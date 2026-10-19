import io
import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import backend
import editor


class Tests(unittest.TestCase):
    def setUp(self):
        self.original = {'id': 'p', 'text': 'Original', 'topic': 'Singing', 'language': 'en',
                         'target_market': 'global', 'active': True, 'version': 2,
                         'test_type': 'brand_knowledge', 'scope': 'diagnostic'}

    def test_preserve_classification_and_versions(self):
        changed = {**self.original, 'text': 'Edited'}
        changes = editor.prompt_changes([changed], [self.original])
        self.assertEqual(changes[0]['expected_version'], 2)
        self.assertNotIn('scope', changes[0])
        self.assertNotIn('test_type', changes[0])
        self.assertEqual(editor.prompt_changes([self.original], [self.original]), [])

    def test_stale_version_rejected_before_write(self):
        with self.assertRaises(editor.Conflict):
            editor.prompt_changes([{**self.original, 'version': 1}], [self.original])

    def test_new_prompt_and_boolean_validation(self):
        new = {**self.original, 'id': 'new', 'version': None, 'prompt_type': 'unbranded'}
        self.assertIsNone(editor.prompt_changes([new], [self.original])[0]['expected_version'])
        with self.assertRaises(ValueError):
            editor.prompt_changes([{**new, 'active': 'true'}], [])

    def test_rpc_request_never_contains_key_in_body(self):
        def opener(request, timeout):
            self.assertEqual(request.method, 'POST')
            self.assertEqual(request.get_header('Apikey'), 'sb_secret_test')
            self.assertNotIn('sb_secret_test', request.data.decode())
            self.assertEqual(json.loads(request.data), {'p_changes': []})
            return io.BytesIO(b'{"saved":0,"prompts":[]}')
        self.assertEqual(editor.Supabase('https://example.supabase.co','sb_secret_test',opener).save_prompts([])['saved'],0)

    def test_local_write_requires_origin_and_csrf(self):
        original = self.original
        class Fixture:
            def rows(self, *a, **kw): return [original]
            def save_prompts(self, changes): return {'saved': len(changes), 'prompts': [original]}
        server = backend.ThreadingHTTPServer(('127.0.0.1', 0), editor.Handler)
        server.store = backend.Store(Fixture())
        server.csrf = 'test-token'
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        raw = json.dumps([{**original, 'text': 'Edited'}]).encode()
        try:
            with self.assertRaises(HTTPError) as context:
                urlopen(Request(base+'/api/prompts', data=raw, headers={'Content-Type':'application/json'}))
            self.assertEqual(context.exception.code,403)
            with urlopen(Request(base+'/api/prompts',data=raw, headers={
                'Origin':base,'X-GEO-Token':'test-token','Content-Type':'application/json'})) as response:
                self.assertEqual(json.load(response)['saved'],1)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__': unittest.main()
