"""Local dashboard gateway; webhook credentials never reach the browser."""
import json
import os
import threading
import uuid
from getpass import getpass
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler
import backend
import editor

WEBHOOK = 'https://maxine-acestudio.app.n8n.cloud/webhook/ace-geo-dashboard'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def dispatch_error(exc):
    # Never expose remote response bodies, exception text, or request headers.
    if isinstance(exc, HTTPError):
        if exc.code in (401, 403):
            return f'n8n 返回 HTTP {exc.code}：请求被拒绝，请核对 Webhook 的请求头名称 X-ACE-GEO-Key 和密钥 Value'
        if exc.code == 404:
            return 'n8n 返回 HTTP 404：请核对 Production URL、Webhook 路径和工作流启用状态'
        return f'n8n 返回 HTTP {exc.code}：请检查执行记录，暂勿重复提交'
    if isinstance(exc, TimeoutError):
        return '等待 n8n 确认超时：测试可能已启动，请先核实执行记录'
    if isinstance(exc, URLError):
        return '连接 n8n 失败（网络、代理或 TLS 问题）：请先核实执行记录'
    if isinstance(exc, (ValueError, AttributeError, TypeError)):
        return 'n8n 返回内容不符合批次确认格式：请检查 Acknowledge Run 节点和执行记录'
    return '本机转发请求异常：提交结果未确认，请先核实执行记录'

def payload_for(body, prompts):
    request_id = body.get('request_id', '')
    parsed = uuid.UUID(request_id)
    if parsed.version != 4 or str(parsed) != request_id:
        raise ValueError('Invalid request ID')
    ids, platforms, repeats = body.get('prompt_ids'), body.get('platforms'), body.get('repeats')
    if not isinstance(ids, list) or not ids or any(not isinstance(x, str) for x in ids) or len(set(ids)) != len(ids):
        raise ValueError('请选择题目')
    if not isinstance(platforms, list) or not platforms or any(p not in ('ChatGPT', 'Perplexity', 'Gemini') for p in platforms) or len(set(platforms)) != len(platforms):
        raise ValueError('请选择有效平台')
    if type(repeats) is not int or not 1 <= repeats <= 3 or len(ids)*len(platforms)*repeats > 300:
        raise ValueError('单批最多300次，重复轮次为1至3')
    selected = [p for p in prompts if p['id'] in ids]
    types = {p.get('test_type') for p in selected}
    if len(selected) != len(ids) or any(not p.get('active') for p in selected) or len(types) != 1:
        raise ValueError('请选择同一题型的启用题目，保存后刷新再试')
    test_type = next(iter(types))
    if test_type not in ('natural_discovery', 'brand_knowledge', 'brand_comparison'):
        raise ValueError('题型不支持')
    return dict(request_id=request_id, prompt_ids=ids, platforms=platforms, repeats=repeats, test_type=test_type)

class Handler(editor.Handler):
    def handle_run(self):
        try:
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.send_json({'error': 'Expected application/json'}, 415)
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 100000:
                raise ValueError('请求过大')
            body = json.loads(self.rfile.read(length))
            prompts = self.server.store.db.rows('geo_prompts', baseline_id='eq.english-v2', order='id.asc')
            payload = payload_for(body, prompts)
        except (ValueError, TypeError, KeyError, AttributeError):
            return self.send_json({'error': '请选择同一题型的已保存启用题目、有效平台和1至3轮；单批最多300次'}, 400)
        except backend.CloudError:
            return self.send_json({'error': '题库读取失败，未发送测试请求'}, 503)
        with self.server.dispatch_lock:
            request_id = payload['request_id']
            if request_id in self.server.dispatches:
                value, status = self.server.dispatches[request_id]
                return self.send_json(value, status)
            # Persist uncertainty in this process before sending; never automatically resend.
            value = {'error': '提交结果未确认，请在 n8n Executions 或批次历史核实，暂勿新建重复测试', 'request_id': request_id}
            status = 502
            self.server.dispatches[request_id] = (value, status)
            try:
                request = Request(WEBHOOK, data=json.dumps(payload).encode(), method='POST', headers={
                    'Content-Type': 'application/json', 'X-ACE-GEO-Key': self.server.webhook_key})
                with self.server.webhook_opener.open(request, timeout=45) as response:
                    result = json.load(response)
                    if response.status != 202 or result.get('accepted') is not True or result.get('id') != request_id:
                        raise ValueError('Unconfirmed acknowledgement')
                value, status = {'accepted': True, 'id': request_id, 'total': len(payload['prompt_ids'])*len(payload['platforms'])*payload['repeats']}, 202
                self.server.store.cached = None
            except Exception as exc:
                value = {'error': dispatch_error(exc), 'request_id': request_id}
            self.server.dispatches[request_id] = (value, status)
            return self.send_json(value, status)

def main():
    url = os.getenv('SUPABASE_URL') or input('Supabase project URL: ').strip()
    key = os.getenv('SUPABASE_SECRET_KEY') or getpass('Supabase backend secret key (hidden): ').strip()
    webhook_key = getpass('n8n X-ACE-GEO-Key Value (hidden): ').strip()
    if not webhook_key or any(ord(c) < 32 or ord(c) > 126 for c in webhook_key):
        raise ValueError('Webhook key must be nonempty printable ASCII')
    server = backend.ThreadingHTTPServer(('127.0.0.1', 8782), Handler)
    server.store = backend.Store(editor.Supabase(url, key))
    server.csrf = editor.secrets.token_urlsafe(32)
    server.webhook_key = webhook_key
    server.webhook_opener = build_opener(NoRedirect())
    server.dispatch_lock = threading.Lock()
    server.dispatches = {}
    print('Dashboard: http://127.0.0.1:8782/ (keep this window open)', flush=True)
    server.serve_forever()

if __name__ == '__main__':
    main()
