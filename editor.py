"""Local-only prompt editor. All database writes use a transactional RPC."""
import argparse
from getpass import getpass
import hmac
import json
import os
import secrets
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request
import backend

EDITABLE = ('text', 'topic', 'language', 'target_market', 'active')


class Conflict(backend.CloudError):
    pass


def prompt_changes(incoming, current):
    if not isinstance(incoming, list) or not 0 < len(incoming) <= 200:
        raise ValueError('题库必须包含 1 至 200 道题')
    known = {p['id']: p for p in current}
    seen, changes = set(), []
    for item in incoming:
        if not isinstance(item, dict):
            raise ValueError('题目格式不正确')
        for field in ('id', 'text', 'topic'):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError('题目缺少 ' + field)
        if len(item['id']) > 200 or len(item['text']) > 10000 or len(item['topic']) > 200:
            raise ValueError('题目字段过长')
        if item['id'] in seen:
            raise ValueError('题目编号重复')
        seen.add(item['id'])
        if (item.get('language') != 'en' or item.get('target_market') != 'global'
                or type(item.get('active')) is not bool):
            raise ValueError('题目必须面向全球英语用户，active 必须是布尔值')
        old = known.get(item['id'])
        if old:
            if item.get('version') != old['version']:
                raise Conflict('题目已被其他人修改，请复制未保存内容并刷新后重试')
            if all(item.get(k) == old.get(k) for k in EDITABLE):
                continue
        elif item.get('version') not in (None, 0):
            raise Conflict('题目状态已变化，请刷新后重试')
        elif item.get('prompt_type', 'unbranded') != 'unbranded':
            raise ValueError('当前新增入口仅支持自然发现题')
        changes.append({'id': item['id'], **{k: item[k] for k in EDITABLE},
                        'expected_version': old['version'] if old else None})
    return changes


class Supabase(backend.Supabase):
    def save_prompts(self, changes):
        headers = {'apikey': self.key, 'Content-Type': 'application/json', 'Accept': 'application/json'}
        if self.key.startswith('eyJ'):
            headers['Authorization'] = 'Bearer ' + self.key
        request = Request(self.url + '/rest/v1/rpc/geo_save_prompts',
                          data=json.dumps({'p_changes': changes}).encode(), headers=headers, method='POST')
        try:
            with self.opener(request, timeout=30) as response:
                value = json.load(response)
        except HTTPError as exc:
            if exc.code == 409:
                raise Conflict('题目保存发生版本冲突，请刷新后重试') from None
            if exc.code == 404:
                raise backend.CloudError('请先在 Supabase 执行 enable_prompt_editing.sql') from None
            raise backend.CloudError(f'保存失败：Supabase HTTP {exc.code}') from None
        except (URLError, OSError, ValueError):
            raise backend.CloudError('保存结果未确认，请刷新核实，暂勿重复提交') from None
        if not isinstance(value, dict) or not isinstance(value.get('prompts'), list):
            raise backend.CloudError('保存返回格式异常，请刷新核实')
        return value


class Handler(backend.Handler):
    def local_request(self):
        port = self.server.server_port
        return self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}')

    def do_GET(self):
        if not self.local_request():
            return self.send_json({'error': 'Invalid host'}, 403)
        if urlparse(self.path).path == '/api/config':
            return self.send_json({'storage': 'Supabase', 'version': 2, 'can_edit': True,
                'team_mode': True, 'csrf_token': self.server.csrf, 'coze_configured': True,
                'direct_configured': False, 'missing': [], 'missing_by_platform': {},
                'coze_region': 'international', 'can_run': bool(getattr(self.server, 'webhook_key', ''))})
        return super().do_GET()

    def do_POST(self):
        token = self.headers.get('X-GEO-Token', '')
        allowed_origin = 'http://' + self.headers.get('Host', '')
        if (not self.local_request() or self.headers.get('Origin') != allowed_origin
                or not hmac.compare_digest(token, self.server.csrf)):
            return self.send_json({'error': '请求来源或验证信息不正确'}, 403)
        if self.path == '/api/runs' and hasattr(self, 'handle_run'):
            return self.handle_run()
        if self.path != '/api/prompts':
            return self.send_json({'error': '启动测试尚未接入；当前仅支持题目编辑'}, 405)
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.send_json({'error': 'Expected application/json'}, 415)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1_000_000:
                raise ValueError('请求大小不正确')
            incoming = json.loads(self.rfile.read(length))
            with self.server.store.lock:
                current = self.server.store.db.rows('geo_prompts', baseline_id='eq.english-v2', order='id.asc')
                changes = prompt_changes(incoming, current)
                value = self.server.store.db.save_prompts(changes) if changes else {'saved': 0, 'prompts': current}
                self.server.store.cached = None
            return self.send_json(value)
        except Conflict as exc:
            return self.send_json({'error': str(exc)}, 409)
        except (ValueError, TypeError, KeyError):
            return self.send_json({'error': '题目字段无效，请检查后重试'}, 400)
        except backend.CloudError as exc:
            return self.send_json({'error': str(exc)}, 503)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8781)
    args = parser.parse_args()
    url = os.getenv('SUPABASE_URL') or input('Supabase project URL: ').strip()
    key = os.getenv('SUPABASE_SECRET_KEY') or getpass('Supabase backend secret key (hidden): ').strip()
    server = backend.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.store = backend.Store(Supabase(url, key))
    server.csrf = secrets.token_urlsafe(32)
    print(f'Prompt editor (local only): http://127.0.0.1:{args.port}/', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
