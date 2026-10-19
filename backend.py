"""Read-only Supabase adapter for the existing ACE dashboard (stdlib only)."""
import argparse
import json
import os
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
BASELINE = 'english-v2'


class CloudError(Exception):
    pass


class Supabase:
    def __init__(self, url, key, opener=urlopen):
        parsed = urlparse(url)
        if (parsed.scheme != 'https' or not parsed.hostname
                or not parsed.hostname.endswith('.supabase.co')
                or parsed.username or parsed.password or parsed.port
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            raise ValueError('SUPABASE_URL must be the HTTPS project URL')
        if not key or not (key.startswith('sb_secret_') or key.startswith('eyJ')):
            raise ValueError('Use a backend secret key or legacy service_role key')
        self.url, self.key, self.opener = url.rstrip('/'), key, opener

    def rows(self, table, **params):
        allowed = {'geo_prompts', 'geo_runs', 'geo_tasks', 'geo_results'}
        if table not in allowed:
            raise ValueError('Unknown table')
        output, offset = [], 0
        while True:
            query = urlencode({**params, 'limit': 500, 'offset': offset})
            headers = {'apikey': self.key, 'Accept': 'application/json'}
            # New secret keys belong in apikey, never in a Bearer header.
            if self.key.startswith('eyJ'):
                headers['Authorization'] = 'Bearer ' + self.key
            request = Request(f'{self.url}/rest/v1/{table}?{query}', headers=headers)
            try:
                with self.opener(request, timeout=30) as response:
                    page = json.load(response)
            except HTTPError as exc:
                raise CloudError(f'Supabase returned HTTP {exc.code}; check backend configuration') from None
            except (URLError, TimeoutError, OSError, ValueError):
                raise CloudError('Supabase connection failed; please retry later') from None
            if not isinstance(page, list):
                raise CloudError('Supabase returned an invalid response')
            output.extend(page)
            if not page:
                return output
            # Advance by actual rows, even if the project caps responses below 500.
            offset += len(page)


def build_results(prompts, tasks, results):
    """Resolve explicit retry chains, never collapse independent scheduled runs."""
    prompt_map = {p['id']: p for p in prompts}
    task_map = {t['id']: t for t in tasks}

    def root_id(task_id):
        seen = set()
        while task_id in task_map:
            if task_id in seen:
                raise CloudError('Task retry chain contains a cycle')
            seen.add(task_id)
            parent = task_map[task_id].get('retry_of_task_id')
            if not parent:
                break
            task_id = parent
        return task_id

    winners = {}
    for row in results:
        task = task_map.get(row['task_id'])
        if not task:
            continue
        root = root_id(task['id'])
        original = task_map.get(root, task)
        # Reject malformed links instead of merging unrelated prompts/platforms.
        if any(original.get(k) != task.get(k) for k in ('prompt_id', 'platform', 'repeat_index')):
            raise CloudError('Retry task does not match its original task')
        rank = (row.get('status') == 'success', row.get('tested_at') or '', row['id'])
        if root not in winners or rank > winners[root][0]:
            winners[root] = (rank, row, task, original)

    output = []
    for _, row, task, original in winners.values():
        source = task.get('task_snapshot') or {}
        prompt = prompt_map.get(row['prompt_id'], {})
        data = row.get('data') or {}
        value = {k: row.get(k) for k in (
            'id', 'task_id', 'prompt_id', 'baseline_id', 'platform', 'model',
            'status', 'tested_at', 'answer', 'brands', 'citations', 'ace_recommendation_rank')}
        for key in ('topic', 'language', 'target_market', 'prompt_type', 'test_type', 'scope'):
            value[key] = source.get(key, prompt.get(key, data.get(key)))
        value.update(prompt=source.get('prompt', prompt.get('text', data.get('prompt', ''))),
                     run_id=original['run_id'], result_run_id=row['run_id'],
                     repeat_index=task.get('repeat_index', 1), surface='api',
                     search_enabled=source.get('search_enabled', True), simulation=False,
                     execution_mode='coze', retry_of_task_id=task.get('retry_of_task_id'))
        output.append(value)
    return sorted(output, key=lambda r: (r.get('tested_at') or '', r['id']))


class Store:
    def __init__(self, db):
        self.db, self.lock, self.cached, self.expires = db, threading.Lock(), None, 0

    def snapshot(self):
        with self.lock:
            if self.cached is not None and time.monotonic() < self.expires:
                return self.cached
            prompts = self.db.rows('geo_prompts', baseline_id='eq.' + BASELINE, order='id.asc')
            runs = self.db.rows('geo_runs', baseline_id='eq.' + BASELINE, order='created_at.desc,id.desc')
            tasks = self.db.rows('geo_tasks', select='id,run_id,prompt_id,platform,repeat_index,retry_of_task_id,task_snapshot',
                                 order='created_at.asc,id.asc')
            results = self.db.rows('geo_results', baseline_id='eq.' + BASELINE,
                                   order='tested_at.asc,id.asc')
            self.cached = {'prompts': prompts, 'runs': [{**r, 'mode': 'coze'} for r in runs],
                           'results': build_results(prompts, tasks, results)}
            self.expires = time.monotonic() + 15
            return self.cached


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def log_message(self, *_):
        pass

    def send_json(self, body, status=200):
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urlparse(self.path)
        if path.path == '/api/config':
            return self.send_json({'storage': 'Supabase', 'version': 2, 'can_edit': False,
                'team_mode': True, 'direct_configured': False, 'coze_configured': True,
                'missing': [], 'missing_by_platform': {}, 'coze_region': 'international'})
        if path.path == '/api/schedule':
            return self.send_json({'enabled': False, 'managed_by': 'n8n',
                'blocked': '计划由 n8n Cloud 管理；本看板不验证启用状态或下次执行时间',
                'interval_days': 7, 'time': '09:00', 'timezone': 'Asia/Shanghai'})
        try:
            if path.path in ('/api/prompts', '/api/results', '/api/runs', '/api/result'):
                snapshot = self.server.store.snapshot()
                if path.path == '/api/result':
                    target = parse_qs(path.query).get('id', [''])[0]
                    row = next((r for r in snapshot['results'] if r['id'] == target), None)
                    return self.send_json(row or {'error': 'Not found'}, 200 if row else 404)
                key = path.path.rsplit('/', 1)[1]
                if key == 'results' and parse_qs(path.query).get('mode', ['coze'])[0] != 'coze':
                    return self.send_json([])
                return self.send_json(snapshot[key])
        except CloudError as exc:
            return self.send_json({'error': str(exc)}, 503)
        if path.path == '/' or path.path == '/index.html' or (
                path.path.startswith('/') and '..' not in path.path
                and (ROOT / 'dist' / path.path.lstrip('/')).is_file()
                and (ROOT / 'dist') in (ROOT / 'dist' / path.path.lstrip('/')).resolve().parents):
            return super().do_GET()
        return self.send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        self.send_json({'error': '只读版本；题目编辑和启动测试尚未接入'}, 405)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8780)
    args = parser.parse_args()
    url, key = os.getenv('SUPABASE_URL', ''), os.getenv('SUPABASE_SECRET_KEY', '')
    if not url:
        url = input('Supabase project URL: ').strip()
    if not key:
        from getpass import getpass
        key = getpass('Supabase backend secret key (hidden): ').strip()
    db = Supabase(url, key)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.store = Store(db)
    print(f'Read-only dashboard: http://127.0.0.1:{args.port}/', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
