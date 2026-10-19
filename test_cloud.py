import io
import json
import unittest
import uuid
from werkzeug.security import generate_password_hash
from cloud_app import create_app

class DB:
    writes=0
    def rows(self,table,**kwargs):
        if table=='geo_prompts':return [dict(id='p',active=True,test_type='natural_discovery',text='Question',topic='Music',language='en',target_market='global',version=1)]
        return []
    def save_prompts(self,changes):
        self.writes+=1
        return dict(saved=len(changes),prompts=self.rows('geo_prompts'))

class Remote:
    calls=0
    def open(self,request,timeout):
        self.calls+=1
        body=json.loads(request.data)
        response=io.BytesIO(json.dumps(dict(accepted=True,id=body['request_id'])).encode())
        response.status=202
        return response

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.settings=dict(SESSION_SECRET='s'*48,DASHBOARD_USERS_JSON=json.dumps({'tester':generate_password_hash('local-test-password')}),SUPABASE_URL='https://example.supabase.co',SUPABASE_SECRET_KEY='sb_secret_test_only',N8N_WEBHOOK_KEY='test-only-webhook',PUBLIC_ORIGIN='https://dashboard.example.com')
    def setUp(self):
        self.db=DB();self.remote=Remote()
        self.app=create_app(self.settings,self.db,self.remote)
        self.app.testing=True;self.client=self.app.test_client()
        self.origin='https://dashboard.example.com'
    def get(self,path):return self.client.get(path,base_url=self.origin)
    def login(self):
        self.get('/login')
        with self.client.session_transaction(base_url=self.origin) as s:token=s['csrf']
        response=self.client.post('/login',base_url=self.origin,headers={'Origin':self.origin},data={'username':'tester','password':'local-test-password','csrf':token})
        self.assertEqual(response.status_code,302)
        cookie=response.headers.get('Set-Cookie','')
        for flag in ('Secure','HttpOnly','SameSite=Lax'):self.assertIn(flag,cookie)
        return self.get('/api/config').json['csrf_token']
    def test_unauthenticated_data_and_assets_blocked(self):
        self.assertEqual(self.get('/api/results').status_code,401)
        self.assertEqual(self.get('/').status_code,302)
        self.assertEqual(self.get('/app.js').status_code,302)
        self.assertEqual(self.get('/healthz').status_code,200)
        self.assertEqual(self.client.get('/api/config',base_url='https://evil.example').status_code,400)
    def test_authenticated_read_and_no_secret_exposure(self):
        self.login()
        response=self.get('/')
        self.assertEqual(response.status_code,200)
        response.close()
        self.assertEqual(self.get('/api/prompts').json[0]['id'],'p')
        self.assertEqual(self.get('/api/readiness').status_code,200)
        self.assertEqual(self.get('/cloud_app.py').status_code,404)
        raw=self.get('/api/config').get_data(as_text=True)
        self.assertNotIn('sb_secret',raw);self.assertNotIn('test-only-webhook',raw)
    def test_post_auth_origin_and_dedup(self):
        token=self.login()
        body=dict(request_id=str(uuid.uuid4()),prompt_ids=['p'],platforms=['Perplexity'],repeats=1)
        self.assertEqual(self.client.post('/api/runs',base_url=self.origin,json=body).status_code,403)
        headers={'Origin':self.origin,'X-GEO-Token':token}
        for _ in range(2):
            response=self.client.post('/api/runs',base_url=self.origin,json=body,headers=headers)
            self.assertEqual(response.status_code,202)
        self.assertEqual(self.remote.calls,1)
        self.client.post('/api/logout',base_url=self.origin,json={},headers=headers)
        self.assertEqual(self.get('/api/config').status_code,401)
    def test_prompt_version_conflict(self):
        token=self.login();prompt=self.db.rows('geo_prompts')[0]
        prompt.update(version=0,text='changed')
        response=self.client.post('/api/prompts',base_url=self.origin,json=[prompt],headers={'Origin':self.origin,'X-GEO-Token':token})
        self.assertEqual(response.status_code,409);self.assertEqual(self.db.writes,0)
    def test_requires_https_origin(self):
        with self.assertRaises(ValueError):create_app({**self.settings,'PUBLIC_ORIGIN':'http://1.2.3.4'},self.db)

if __name__=='__main__':unittest.main()
