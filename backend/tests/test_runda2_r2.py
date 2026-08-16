"""RUNDA 2 (v1.2.0) backend tests — foreman/worker/contractor forbidden on geometry writes."""
import os
import uuid
import bcrypt
import pytest
import requests
from pymongo import MongoClient

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
MONGO = os.environ["MONGO_URL"]
DB = os.environ["DB_NAME"]

ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PW = "MSbk566lLvI4b!U4"
FOREMAN_EMAIL = "test_r2_foreman@test.pl"
FOREMAN_PW = "ForemanPass123456"

VIEW_ID = "9f5a0846-8d93-4ad1-9e91-d05e0d2a0d8d"
PROJECT_ID = "54680c4c-3ec3-471c-bd79-c6953b767e76"
OKN99_ID = "ddae466d-070c-4d19-80ed-99e72cb91fba"


def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "haslo": pw})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    # clear must_change_password if flagged
    requests.post(f"{BASE}/auth/change-password", json={"nowe": pw},
                  headers={"Authorization": f"Bearer {tok}"})
    r2 = requests.post(f"{BASE}/auth/login", json={"email": email, "haslo": pw})
    return r2.json()["access_token"] if r2.status_code == 200 else tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def foreman_token():
    return _login(FOREMAN_EMAIL, FOREMAN_PW)


@pytest.fixture(scope="module")
def worker_ctx():
    """Seed TEST_ worker via mongo, return (token, email)."""
    client = MongoClient(MONGO)
    db = client[DB]
    email = f"test_r2_worker_{uuid.uuid4().hex[:6]}@bzone.pl"
    pw = "WorkerPass123456"
    h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    db.users.insert_one({
        "id": str(uuid.uuid4()), "email": email, "hash": h,
        "imie": "TEST", "nazwisko": "Worker",
        "rola": "worker", "status": "aktywny",
        "company_id": "bzone-default", "stawka_godzinowa": 15,
        "must_change_password": False,
    })
    tok = _login(email, pw)
    yield tok, email
    db.users.update_one({"email": email}, {"$set": {"status": "zarchiwizowany"}})
    client.close()


@pytest.fixture(scope="module")
def contractor_ctx():
    client = MongoClient(MONGO)
    db = client[DB]
    email = f"test_r2_contr_{uuid.uuid4().hex[:6]}@bzone.pl"
    pw = "ContrPass123456"
    h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    db.users.insert_one({
        "id": str(uuid.uuid4()), "email": email, "hash": h,
        "imie": "TEST", "nazwisko": "Contr",
        "rola": "contractor", "status": "aktywny",
        "company_id": "bzone-default", "stawka_godzinowa": 20,
        "must_change_password": False,
    })
    tok = _login(email, pw)
    yield tok, email
    db.users.update_one({"email": email}, {"$set": {"status": "zarchiwizowany"}})
    client.close()


# ---------- BACKEND-1: foreman 403 on geometry writes ----------

class TestBackend1_ForemanGeometryWrites:
    def test_foreman_create_element_403(self, foreman_token):
        body = {"kod": "ZZ-1", "pozycja_x": 0.5, "pozycja_y": 0.5}
        r = requests.post(f"{BASE}/views/{VIEW_ID}/elements", json=body,
                          headers={"Authorization": f"Bearer {foreman_token}"})
        print(f"[BACKEND-1a] POST /views/{{vid}}/elements body={body} -> {r.status_code} {r.text}")
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_foreman_create_batch_403(self, foreman_token):
        body = {"elementy": [
            {"kod": "ZZ-B1", "pozycja_x": 0.1, "pozycja_y": 0.1},
            {"kod": "ZZ-B2", "pozycja_x": 0.2, "pozycja_y": 0.2},
        ]}
        r = requests.post(f"{BASE}/views/{VIEW_ID}/elements/batch", json=body,
                          headers={"Authorization": f"Bearer {foreman_token}"})
        print(f"[BACKEND-1b] POST /views/{{vid}}/elements/batch body={body} -> {r.status_code} {r.text}")
        assert r.status_code == 403

    def test_foreman_batch_archive_403(self, foreman_token):
        body = {"ids": [OKN99_ID]}
        r = requests.post(f"{BASE}/elements/batch-archive", json=body,
                          headers={"Authorization": f"Bearer {foreman_token}"})
        print(f"[BACKEND-1c] POST /elements/batch-archive body={body} -> {r.status_code} {r.text}")
        assert r.status_code == 403


# ---------- BACKEND-2: worker + contractor also 403 on geometry writes; reads allowed ----------

class TestBackend2_OtherRoles:
    def test_worker_create_element_403(self, worker_ctx):
        tok, _ = worker_ctx
        body = {"kod": "ZZ-W1", "pozycja_x": 0.3, "pozycja_y": 0.3}
        r = requests.post(f"{BASE}/views/{VIEW_ID}/elements", json=body,
                          headers={"Authorization": f"Bearer {tok}"})
        print(f"[BACKEND-2a] worker POST elements -> {r.status_code} {r.text}")
        assert r.status_code == 403

    def test_worker_batch_archive_403(self, worker_ctx):
        tok, _ = worker_ctx
        r = requests.post(f"{BASE}/elements/batch-archive", json={"ids": [OKN99_ID]},
                          headers={"Authorization": f"Bearer {tok}"})
        print(f"[BACKEND-2b] worker POST batch-archive -> {r.status_code} {r.text}")
        assert r.status_code == 403

    def test_contractor_create_batch_403(self, contractor_ctx):
        tok, _ = contractor_ctx
        r = requests.post(f"{BASE}/views/{VIEW_ID}/elements/batch",
                          json={"elementy": [{"kod": "ZZ-C1", "pozycja_x": 0.4, "pozycja_y": 0.4}]},
                          headers={"Authorization": f"Bearer {tok}"})
        print(f"[BACKEND-2c] contractor POST batch -> {r.status_code} {r.text}")
        assert r.status_code == 403

    def test_all_roles_can_read_view_with_geometry(self, foreman_token, worker_ctx, contractor_ctx):
        for label, tok in [("foreman", foreman_token), ("worker", worker_ctx[0]), ("contractor", contractor_ctx[0])]:
            r = requests.get(f"{BASE}/views/{VIEW_ID}",
                             headers={"Authorization": f"Bearer {tok}"})
            print(f"[BACKEND-2d/{label}] GET /views/{{vid}} -> {r.status_code}")
            assert r.status_code == 200, f"{label}: {r.text}"
            data = r.json()
            els = data.get("elementy") or data.get("elements") or []
            assert isinstance(els, list) and len(els) >= 1, f"{label}: no elements returned"
            # geometria_json must be present for rects
            rect = next((e for e in els if e.get("geometria_typ") == "prostokat"), None)
            assert rect is not None, f"{label}: no prostokat element found"
            assert rect.get("geometria_json") is not None, f"{label}: rect has no geometria_json"


# ---------- BACKEND-3: foreman PUT non-geometry allowed; geometry fields -> 403 ----------

class TestBackend3_ForemanPutElement:
    def test_foreman_put_opis_only_200(self, foreman_token):
        body = {"opis": "x"}
        r = requests.put(f"{BASE}/elements/{OKN99_ID}", json=body,
                         headers={"Authorization": f"Bearer {foreman_token}"})
        print(f"[BACKEND-3a] PUT /elements/{{id}} body={body} -> {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, r.text
        # verify persistence
        r2 = requests.get(f"{BASE}/elements/{OKN99_ID}",
                          headers={"Authorization": f"Bearer {foreman_token}"})
        assert r2.status_code == 200
        assert r2.json().get("opis") == "x"

    def test_foreman_put_geometry_403(self, foreman_token):
        body = {"pozycja_x": 0.1, "pozycja_y": 0.1}
        r = requests.put(f"{BASE}/elements/{OKN99_ID}", json=body,
                         headers={"Authorization": f"Bearer {foreman_token}"})
        print(f"[BACKEND-3b] PUT /elements/{{id}} body={body} -> {r.status_code} {r.text}")
        assert r.status_code == 403
