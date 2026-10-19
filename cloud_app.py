"""Authenticated cloud entrypoint. No interactive input and no secrets in assets."""
import hmac
import json
import os
import secrets
import threading
import time
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
from urllib.request import build_opener
from flask import Flask, request, session, jsonify, redirect, render_template_string, send_from_directory
from werkzeug.security import check_password_hash
import backend
import editor
import runner

LOGIN = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ACE GEO 登录</title>
<style>body{font:16px system-ui;background:#f4f6fa;color:#23334b;margin:0}main{max-width:360px;margin:12vh auto;padding:32px;background:white;border-radius:14px}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0 18px;font:inherit}button{background:#304c86;color:white;border:0;border-radius:6px}p{color:#a32b2b}</style>
<main><h1>ACE GEO</h1><div>团队看板登录</div><p>{{error}}</p>
<form method="post"><input type="hidden" name="csrf" value="{{csrf}}">
<label>账号<input name="username" autocomplete="username" required maxlength="100"></label>
<label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
<button>登录看板</button></form></main></html>'''

def create_app(settings=None, db=None, opener=None):
    env = os.environ if settings is None else settings
    required = ('SESSION_SECRET','DASHBOARD_USERS_JSON','SUPABASE_URL','SUPABASE_SECRET_KEY','N8N_WEBHOOK_KEY','PUBLIC_ORIGIN')
    if any(not env.get(k) for k in required):
        raise ValueError('Missing required deployment environment variables; see README')
    origin = env['PUBLIC_ORIGIN'].rstrip('/')
    url = urlparse(origin)
    if url.scheme != 'https' or not url.hostname or url.path or url.query or url.fragment or url.username or url.password:
        raise ValueError('PUBLIC_ORIGIN must be an HTTPS origin without a path')
    if len(env['SESSION_SECRET']) < 32:
        raise ValueError('SESSION_SECRET must contain at least 32 characters')
    users = json.loads(env['DASHBOARD_USERS_JSON'])
    if not isinstance(users,dict) or not users or any(not isinstance(k,str) or not isinstance(v,str) or not v.startswith(('scrypt:','pbkdf2:')) for k,v in users.items()):
        raise ValueError('DASHBOARD_USERS_JSON must map usernames to password hashes')
    app = Flask(__name__,static_folder=None)
    app.config.update(SECRET_KEY=env['SESSION_SECRET'],SESSION_COOKIE_NAME='ace_geo_session',
        SESSION_COOKIE_SECURE=True,SESSION_COOKIE_HTTPONLY=True,SESSION_COOKIE_SAMESITE='Lax',
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8),MAX_CONTENT_LENGTH=1_000_000,
        TRUSTED_HOSTS=[url.hostname])
    store = backend.Store(db or editor.Supabase(env['SUPABASE_URL'],env['SUPABASE_SECRET_KEY']))
    dispatch_server = SimpleNamespace(store=store,webhook_key=env['N8N_WEBHOOK_KEY'],
        webhook_opener=opener or build_opener(runner.NoRedirect()),dispatch_lock=threading.Lock(),dispatches={})
    # One worker / multiple threads: fixed per-account login windows, no proxy-IP assumptions.
    attempts={}; auth_lock=threading.Lock()
    dummy_hash=next(iter(users.values()))

    def csrf():
        if 'csrf' not in session:session['csrf']=secrets.token_urlsafe(32)
        return session['csrf']

    @app.before_request
    def guard():
        # Trigger trusted-host validation before an auth redirect masks routing errors.
        if request.host != url.netloc:return jsonify(error='Invalid host'),400
        if request.path=='/healthz' and request.method in ('GET','HEAD'):return None
        if request.method not in ('GET','HEAD','OPTIONS'):
            if request.headers.get('Origin') != origin:return jsonify(error='请求来源不正确'),403
            token=request.form.get('csrf','') if request.path=='/login' else request.headers.get('X-GEO-Token','')
            if not session.get('csrf') or not hmac.compare_digest(token,session['csrf']):
                return jsonify(error='登录已过期或验证失败，请刷新后重新登录'),403
        if request.path=='/login':return None
        if session.get('user') not in users:
            if request.path.startswith('/api/'):return jsonify(error='请先登录看板'),401
            return redirect('/login')

    @app.after_request
    def headers(response):
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['X-Frame-Options']='DENY'
        response.headers['Referrer-Policy']='same-origin'
        response.headers['Strict-Transport-Security']='max-age=31536000'
        response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        return response

    @app.route('/login',methods=['GET','POST'])
    def login():
        error='';status=200
        if request.method=='POST':
            username=request.form.get('username','');password=request.form.get('password','')
            bucket=username if username in users else '__unknown__'
            now=time.monotonic()
            with auth_lock:
                count,start=attempts.get(bucket,(0,now))
                if now-start>900:count,start=0,now
                if count>=10:return render_template_string(LOGIN,error='尝试次数过多，请15分钟后再试',csrf=csrf()),429
                attempts[bucket]=(count+1,start)
            valid=check_password_hash(users.get(username,dummy_hash),password)
            if valid and username in users:
                session.clear();session['user']=username;session.permanent=True;csrf()
                with auth_lock:attempts.pop(bucket,None)
                return redirect('/')
            error='账号或密码不正确';status=401
        return render_template_string(LOGIN,error=error,csrf=csrf()),status

    @app.post('/api/logout')
    def logout():
        session.clear();return jsonify(ok=True)

    @app.get('/healthz')
    def health():
        # Liveness only; authenticated readiness checks the database separately.
        return jsonify(ok=True,check='process')

    @app.get('/api/readiness')
    def readiness():
        store.db.rows('geo_prompts',baseline_id='eq.english-v2',select='id')
        return jsonify(ok=True,check='supabase_read')

    @app.get('/api/config')
    def config():
        return jsonify(storage='Supabase',version=2,can_edit=True,can_run=True,team_mode=True,
            csrf_token=csrf(),coze_configured=True,direct_configured=False,missing=[],
            missing_by_platform={},coze_region='international',cloud_login=True)

    @app.get('/api/schedule')
    def schedule():
        return jsonify(enabled=False,managed_by='n8n',blocked='计划由 n8n Cloud 管理；本看板不验证启用状态或下次执行时间',interval_days=7,time='09:00',timezone='Asia/Shanghai')

    @app.get('/api/<kind>')
    def read(kind):
        if kind not in ('prompts','runs','results','result'):return jsonify(error='Not found'),404
        snapshot=store.snapshot()
        if kind=='result':
            row=next((r for r in snapshot['results'] if r['id']==request.args.get('id')),None)
            return (jsonify(row),200) if row else (jsonify(error='Not found'),404)
        if kind=='results' and request.args.get('mode','coze')!='coze':return jsonify([])
        return jsonify(snapshot[kind])

    @app.post('/api/prompts')
    def save():
        with store.lock:
            current=store.db.rows('geo_prompts',baseline_id='eq.english-v2',order='id.asc')
            changes=editor.prompt_changes(request.get_json(),current)
            result=store.db.save_prompts(changes) if changes else dict(saved=0,prompts=current)
            store.cached=None
        return jsonify(result)

    @app.post('/api/runs')
    def run():
        # Reuse the tested local dispatcher after session/origin/CSRF checks.
        import io
        proxy=SimpleNamespace(headers=request.headers,rfile=io.BytesIO(request.get_data()),server=dispatch_server,
            send_json=lambda body,status=200:(jsonify(body),status))
        return runner.Handler.handle_run(proxy)

    @app.errorhandler(editor.Conflict)
    def conflict(exc):return jsonify(error=str(exc)),409

    @app.errorhandler(backend.CloudError)
    def cloud_error(exc):return jsonify(error=str(exc)),503

    @app.errorhandler(ValueError)
    def invalid(exc):return jsonify(error='字段无效，请检查后重试'),400

    @app.get('/')
    def index():return send_from_directory(Path(__file__).parent/'dist','index.html')

    @app.get('/<path:filename>')
    def asset(filename):return send_from_directory(Path(__file__).parent/'dist',filename)

    return app
