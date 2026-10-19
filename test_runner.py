import io
import json
import threading
import unittest
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import backend
import runner

class Tests(unittest.TestCase):
    def test_error_diagnostics_do_not_expose_secrets(self):
        for code in (401, 403, 404, 500):
            message=runner.dispatch_error(HTTPError(runner.WEBHOOK,code,'secret-value',{},None))
            self.assertIn(str(code),message)
            self.assertNotIn('secret-value',message)
        self.assertIn('超时',runner.dispatch_error(TimeoutError('secret-value')))
        self.assertNotIn('secret-value',runner.dispatch_error(ValueError('secret-value')))
    def test_dispatch_is_authenticated_and_not_repeated(self):
        prompt={'id':'p','active':True,'test_type':'natural_discovery'}
        class DB:
            def rows(self,*a,**kw):return [prompt]
        class Opener:
            calls=0
            fail=False
            def open(self,request,timeout):
                self.calls+=1
                assert request.full_url==runner.WEBHOOK
                assert request.get_header('X-ace-geo-key')=='test-webhook-secret'
                assert 'test-webhook-secret' not in request.data.decode()
                if self.fail:raise TimeoutError()
                payload=json.loads(request.data)
                response=io.BytesIO(json.dumps({'accepted':True,'id':payload['request_id']}).encode())
                response.status=202
                return response
        server=backend.ThreadingHTTPServer(('127.0.0.1',0),runner.Handler)
        server.store=backend.Store(DB());server.csrf='csrf';server.webhook_key='test-webhook-secret'
        server.webhook_opener=Opener();server.dispatches={};server.dispatch_lock=threading.Lock()
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
        body={'request_id':str(uuid.uuid4()),'prompt_ids':['p'],'platforms':['Gemini'],'repeats':1}
        def post(auth=True):
            headers={'Content-Type':'application/json'}
            if auth:headers.update({'Origin':base,'X-GEO-Token':'csrf'})
            return urlopen(Request(base+'/api/runs',data=json.dumps(body).encode(),headers=headers))
        try:
            with self.assertRaises(HTTPError) as e:post(False)
            self.assertEqual(e.exception.code,403);self.assertEqual(server.webhook_opener.calls,0)
            for _ in range(2):
                with post() as response:self.assertTrue(json.load(response)['accepted'])
            self.assertEqual(server.webhook_opener.calls,1)
            body['request_id']=str(uuid.uuid4());server.webhook_opener.fail=True
            for _ in range(2):
                with self.assertRaises(HTTPError) as e:post()
                self.assertEqual(e.exception.code,502)
            self.assertEqual(server.webhook_opener.calls,2)
            with urlopen(base+'/api/config') as response:
                config=json.load(response)
                self.assertTrue(config['can_run']);self.assertNotIn('test-webhook-secret',str(config))
        finally:server.shutdown();server.server_close()

    def test_mixed_types_and_disabled_prompts_rejected(self):
        body={'request_id':str(uuid.uuid4()),'prompt_ids':['p','q'],'platforms':['Gemini'],'repeats':1}
        with self.assertRaises(ValueError):runner.payload_for(body,[{'id':'p','active':True,'test_type':'natural_discovery'},{'id':'q','active':True,'test_type':'brand_knowledge'}])
        body['prompt_ids']=['p']
        with self.assertRaises(ValueError):runner.payload_for(body,[{'id':'p','active':False,'test_type':'natural_discovery'}])

if __name__=='__main__':unittest.main()
