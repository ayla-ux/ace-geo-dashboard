# ACE GEO team dashboard

Existing Supabase data, n8n orchestration and Coze calls are retained. No database migration is run on startup. The existing `geo_save_prompts` RPC must already be installed to edit prompts.

## Runtime

Python 3.12, Flask, Gunicorn. Listen on port 5000. Use one worker and eight threads: dispatch deduplication and login throttling are process-local. Existing n8n request IDs also guard against creating the same batch twice. Different request IDs are not globally serialized against scheduled runs. Do not retry an uncertain submission with a new request ID until execution history has been checked.

## Environment (inject using the platform `env` field; never commit values)

- `SUPABASE_URL`: existing HTTPS project URL.
- `SUPABASE_SECRET_KEY`: server-side secret/service-role key.
- `N8N_WEBHOOK_KEY`: Value of the `X-ACE-GEO-Key` credential.
- `PUBLIC_ORIGIN`: final HTTPS dashboard origin, no path, e.g. `https://geo.company.example`.
- `SESSION_SECRET`: random string of at least 32 characters.
- `DASHBOARD_USERS_JSON`: JSON mapping each team login name to a Werkzeug scrypt/pbkdf2 password hash. All provisioned users can read, edit prompts and submit tests. No public registration. These accounts are independent of the deployment platform login.

Production HTTPS must be provided by the company's reverse proxy/load balancer and route to this service. The deployment platform documentation only specifies nginx port 80; confirm HTTPS routing with the platform administrator before login. Do not send passwords over the public HTTP IP. Public origin is deliberately required; no insecure cookie mode.

## Company deployment

Repository: `git@github.com:ayla-ux/ace-geo-dashboard.git`

CPU is sufficient; models are called through Coze. Use a read-only repository deploy key for pulling source. Reuse the existing host on later deployments rather than launching another instance.

Init script:

```sh
export PATH=/root/miniconda3/bin:$PATH
pip install -r requirements.txt
```

Start command:

```sh
export PATH=/root/miniconda3/bin:$PATH
cd /usr/src
exec gunicorn --bind 0.0.0.0:5000 --workers 1 --threads 8 --timeout 180 'cloud_app:create_app()'
```

A Dockerfile is also provided for the platform's Docker build route.

## Validation

```sh
python -m unittest test_backend test_editor test_runner test_cloud
```

Tests use fake database/webhook clients. They neither modify Supabase nor call paid AI APIs. Linux Gunicorn/container boot and browser end-to-end checks remain deployment validation steps.

- `/healthz`: process liveness only, public, no secrets.
- `/api/readiness`: authenticated Supabase read check.
- `/login`: team sign-in; 8-hour session, secure/HttpOnly cookies, per-account rate limit.
- `/api/logout`: authenticated POST with CSRF token.
- `/api/prompts`, `/api/runs`, `/api/results`: login required.

The platform's `/health` is an nginx probe and does not verify this app or its database.

No historical records are deleted. Existing scheduled runs remain managed by n8n. Unknown webhook responses are not automatically retried. A single manually selected prompt/platform should be used for final live acceptance, then verify the persisted answer.
