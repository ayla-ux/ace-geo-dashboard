import io
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen, Request
import backend


class Tests(unittest.TestCase):
    def test_pagination_and_secret_header(self):
        calls = []
        pages = [[{'id': 1}], [{'id': 2}], []]
        def opener(request, timeout):
            calls.append(request)
            return io.BytesIO(json.dumps(pages.pop(0)).encode())
        db = backend.Supabase('https://example.supabase.co', 'sb_secret_test', opener)
        self.assertEqual(len(db.rows('geo_prompts')), 2)
        self.assertIn('offset=1', calls[1].full_url)
        self.assertNotIn('Authorization', dict(calls[0].header_items()))
        self.assertEqual(calls[0].get_header('Apikey'), 'sb_secret_test')

    def test_retry_and_independent_runs(self):
        tasks = [dict(id=i, run_id=run, prompt_id='p', platform='Gemini', repeat_index=1,
                      retry_of_task_id=parent, task_snapshot={'text': 'ignored', 'prompt': 'Original question',
                      'test_type': 'natural_discovery', 'scope': 'core'})
                 for i, run, parent in [('a', 'r1', None), ('b', 'retry', 'a'), ('c', 'r2', None), ('d', 'retry2', 'b')]]
        results = [dict(id=i, task_id=i, run_id=t['run_id'], prompt_id='p', platform='Gemini',
                        status=status, tested_at=str(n), data={'secret_debug': 'not exposed'})
                   for n, (i, t, status) in enumerate(zip('abcd', tasks, ['error', 'success', 'success', 'error']))]
        output = backend.build_results([{'id': 'p', 'text': 'Edited question'}], tasks, results)
        self.assertEqual({r['id'] for r in output}, {'b', 'c'})
        retry = next(r for r in output if r['id'] == 'b')
        self.assertEqual(retry['run_id'], 'r1')
        self.assertEqual(retry['result_run_id'], 'retry')
        self.assertEqual(retry['prompt'], 'Original question')
        self.assertNotIn('data', retry)

    def test_error_does_not_leak_key(self):
        def opener(request, timeout):
            raise HTTPError(request.full_url, 401, 'sb_secret_private', {}, None)
        db = backend.Supabase('https://example.supabase.co', 'sb_secret_private', opener)
        with self.assertRaises(backend.CloudError) as context:
            db.rows('geo_prompts')
        self.assertNotIn('sb_secret_private', str(context.exception))

    def test_http_contract_is_read_only(self):
        class Fixture:
            def snapshot(self):
                return {'prompts': [{'id': 'p'}], 'runs': [], 'results': []}
        server = backend.ThreadingHTTPServer(('127.0.0.1', 0), backend.Handler)
        server.store = Fixture()
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base + '/api/config') as response:
                self.assertFalse(json.load(response)['can_edit'])
            with urlopen(base + '/api/prompts') as response:
                self.assertEqual(json.load(response), [{'id': 'p'}])
            with self.assertRaises(HTTPError) as context:
                urlopen(Request(base + '/api/runs', data=b'{}'))
            self.assertEqual(context.exception.code, 405)
            with self.assertRaises(HTTPError):
                urlopen(base + '/backend.py')
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
