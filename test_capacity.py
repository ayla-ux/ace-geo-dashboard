"""Capacity boundaries through the real HTTP handlers, with external services mocked."""
import io
import json
import unittest
import uuid
from urllib.parse import parse_qs, urlparse
from werkzeug.security import generate_password_hash
import backend
import editor
import runner
from cloud_app import create_app


def library(count=180):
    return [dict(id=f"capacity-{i:03d}", text=f"Which music tools fit scenario {i}?",
                 topic="Capacity fixture", language="en", target_market="global",
                 prompt_type="unbranded", test_type="natural_discovery",
                 scope="core", active=True, version=1) for i in range(count)]


class Database:
    def __init__(self):
        self.prompts = library()
        self.saved = []

    def rows(self, table, **kwargs):
        return self.prompts if table == "geo_prompts" else []

    def save_prompts(self, changes):
        self.saved = changes
        return dict(saved=len(changes), prompts=self.prompts)


class Webhook:
    def __init__(self):
        self.payloads = []

    def open(self, request, timeout):
        body = json.loads(request.data)
        self.payloads.append(body)
        response = io.BytesIO(json.dumps(dict(accepted=True, id=body["request_id"])).encode())
        response.status = 202
        return response


class CapacityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.settings = dict(SESSION_SECRET="s" * 48,
            DASHBOARD_USERS_JSON=json.dumps({"tester": generate_password_hash("local-test-password")}),
            SUPABASE_URL="https://example.supabase.co", SUPABASE_SECRET_KEY="sb_secret_test_only",
            N8N_WEBHOOK_KEY="test-only-webhook", PUBLIC_ORIGIN="https://dashboard.example.com")

    def setUp(self):
        self.db, self.remote = Database(), Webhook()
        self.app = create_app(self.settings, self.db, self.remote)
        self.app.testing = True
        self.client = self.app.test_client()
        self.origin = self.settings["PUBLIC_ORIGIN"]
        self.client.get("/login", base_url=self.origin)
        with self.client.session_transaction(base_url=self.origin) as session:
            token = session["csrf"]
        response = self.client.post("/login", base_url=self.origin,
            headers={"Origin": self.origin},
            data={"username": "tester", "password": "local-test-password", "csrf": token})
        self.assertEqual(response.status_code, 302)
        config = self.client.get("/api/config", base_url=self.origin).json
        self.headers = {"Origin": self.origin, "X-GEO-Token": config["csrf_token"]}

    def request_body(self, repeats=1):
        return dict(request_id=str(uuid.uuid4()), prompt_ids=[p["id"] for p in self.db.prompts],
                    platforms=["ChatGPT", "Perplexity", "Gemini"], repeats=repeats)

    def post(self, path, value):
        return self.client.post(path, base_url=self.origin, headers=self.headers, json=value)

    def test_read_and_save_all_180_prompts(self):
        self.assertEqual(len(self.client.get("/api/prompts", base_url=self.origin).json), 180)
        changed = [{**p, "text": p["text"] + " Updated."} for p in self.db.prompts]
        response = self.post("/api/prompts", changed)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["saved"], 180)
        self.assertEqual({p["id"] for p in self.db.saved}, {p["id"] for p in changed})

    def test_submit_540_tasks_once(self):
        body = self.request_body()
        for _ in range(2):
            response = self.post("/api/runs", body)
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.json["total"], 540)
        self.assertEqual(len(self.remote.payloads), 1)
        self.assertEqual(self.remote.payloads[0]["prompt_ids"], body["prompt_ids"])
        self.assertEqual(self.remote.payloads[0]["platforms"], body["platforms"])

    def test_over_capacity_rejected_without_dispatch(self):
        response = self.post("/api/runs", self.request_body(repeats=2))
        self.assertEqual(response.status_code, 400)
        self.assertIn("540", response.json["error"])
        self.db.prompts = library(181)
        response = self.post("/api/runs", self.request_body())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.remote.payloads, [])

    def test_capacity_does_not_bypass_disabled_or_mixed_type_checks(self):
        self.db.prompts[-1]["active"] = False
        self.assertEqual(self.post("/api/runs", self.request_body()).status_code, 400)
        self.db.prompts[-1].update(active=True, test_type="brand_comparison")
        self.assertEqual(self.post("/api/runs", self.request_body()).status_code, 400)
        self.assertEqual(self.remote.payloads, [])

    def test_results_above_database_page_size_are_not_truncated(self):
        records = [{"id": str(i)} for i in range(540)]
        offsets = []
        def opener(request, timeout):
            query = parse_qs(urlparse(request.full_url).query)
            offset = int(query["offset"][0])
            offsets.append(offset)
            return io.BytesIO(json.dumps(records[offset:offset + 500]).encode())
        db = backend.Supabase("https://example.supabase.co", "sb_secret_fixture", opener)
        self.assertEqual(db.rows("geo_results"), records)
        self.assertEqual(offsets, [0, 500, 540])


if __name__ == "__main__":
    unittest.main()
