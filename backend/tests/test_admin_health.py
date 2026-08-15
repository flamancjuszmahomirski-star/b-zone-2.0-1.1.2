"""
GET /api/admin/health — read-only diagnostic endpoint verification.

Verifies:
  H1: 200 as admin; shape/typing of response fields.
  H2: 401/403 without token; 403 for worker/foreman/subcontractor.
  H3: duplicate_code_groups reported when 2 elements share kod_norm
      in the same project (inserted directly in DB to bypass API dedup).
      After archive/delete of the offenders → no longer reported.
  H4: Endpoint is READ-ONLY — counters unchanged across two consecutive calls.

Throwaway records use TEST_/test_* prefixes and are cleaned up at teardown.
The seed admin (admin@bzone.app) and project 'Diemwb' are NEVER modified.
"""

import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PASSWORD = "MSbk566lLvI4b!U4"
STRONG_PW = "TestPass_Longer_14+aA1"


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _login(email: str, password: str) -> requests.Response:
    return requests.post(f"{BASE_URL}/auth/login",
                         json={"email": email, "haslo": password}, timeout=15)


def _admin_token() -> str:
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(email: str, imie="TEST", nazwisko="User") -> None:
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email, "haslo": STRONG_PW, "imie": imie, "nazwisko": nazwisko,
    }, timeout=15)
    assert r.status_code == 201, f"register {email}: {r.status_code} {r.text}"


def _find_user_id(token: str, email: str) -> str:
    r = requests.get(f"{BASE_URL}/users", headers=_hdr(token), timeout=15)
    assert r.status_code == 200, r.text
    for u in r.json():
        if u["email"] == email.lower():
            return u["id"]
    raise AssertionError(f"user {email} not found")


def _approve(token: str, user_id: str, rola: str) -> None:
    r = requests.patch(f"{BASE_URL}/users/{user_id}/approve",
                       headers=_hdr(token),
                       json={"rola": rola, "stawka_godz_eur": 12.5}, timeout=15)
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"


def _archive_user(token: str, user_id: str) -> None:
    try:
        requests.patch(f"{BASE_URL}/users/{user_id}/archive",
                       headers=_hdr(token), timeout=10)
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


@pytest.fixture(scope="module")
def mongo_db():
    """Direct DB handle for throwaway insert/cleanup of duplicates."""
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture
def worker(admin_token):
    email = f"test_worker_{uuid.uuid4().hex[:8]}@example.com"
    _register(email)
    uid = _find_user_id(admin_token, email)
    _approve(admin_token, uid, "worker")
    tok = _login(email, STRONG_PW).json()["access_token"]
    yield {"id": uid, "email": email, "token": tok}
    _archive_user(admin_token, uid)


@pytest.fixture
def foreman(admin_token):
    email = f"test_foreman_{uuid.uuid4().hex[:8]}@example.com"
    _register(email)
    uid = _find_user_id(admin_token, email)
    _approve(admin_token, uid, "foreman")
    tok = _login(email, STRONG_PW).json()["access_token"]
    yield {"id": uid, "email": email, "token": tok}
    _archive_user(admin_token, uid)


@pytest.fixture
def subcontractor(admin_token):
    email = f"test_sub_{uuid.uuid4().hex[:8]}@example.com"
    _register(email)
    uid = _find_user_id(admin_token, email)
    _approve(admin_token, uid, "subcontractor")
    tok = _login(email, STRONG_PW).json()["access_token"]
    yield {"id": uid, "email": email, "token": tok}
    _archive_user(admin_token, uid)


# --------------------------------------------------------------------------- #
# H1: 200 as admin — response shape/types
# --------------------------------------------------------------------------- #
class TestAdminHealthShape:
    def test_admin_health_ok_and_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()

        # Top-level keys present
        for k in ("unique_index_present", "index_names", "kod_norm_backfilled",
                  "duplicate_code_groups", "counts"):
            assert k in data, f"missing key: {k}"

        # Types
        assert isinstance(data["unique_index_present"], bool)
        assert isinstance(data["index_names"], list)
        assert isinstance(data["kod_norm_backfilled"], bool)
        assert isinstance(data["duplicate_code_groups"], list)
        assert isinstance(data["counts"], dict)

        # Unique index must be built by startup routine
        assert data["unique_index_present"] is True, \
            f"uniq_element_kod_norm not present. index_names={data['index_names']}"
        assert "uniq_element_kod_norm" in data["index_names"]
        assert data["kod_norm_backfilled"] is True, \
            "kod_norm backfill not complete (elements with missing kod_norm)"

        # Counts subset & types
        counts = data["counts"]
        for k in ("users", "users_active", "admins_active",
                  "projects", "elements", "elements_active", "reports"):
            assert k in counts, f"counts missing {k}"
            assert isinstance(counts[k], int) and counts[k] >= 0

        # Sanity: at least one active admin exists (seed)
        assert counts["admins_active"] >= 1


# --------------------------------------------------------------------------- #
# H2: authentication / authorization
# --------------------------------------------------------------------------- #
class TestAdminHealthAuthz:
    def test_no_token_unauthorized(self):
        r = requests.get(f"{BASE_URL}/admin/health", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"

    def test_bad_token_unauthorized(self):
        r = requests.get(f"{BASE_URL}/admin/health",
                         headers={"Authorization": "Bearer notavalidtoken"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_worker_forbidden(self, worker):
        r = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(worker["token"]), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_foreman_forbidden(self, foreman):
        r = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(foreman["token"]), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_subcontractor_forbidden(self, subcontractor):
        r = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(subcontractor["token"]), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# --------------------------------------------------------------------------- #
# H3: duplicate_code_groups reported for direct-DB duplicates; cleaned up
# --------------------------------------------------------------------------- #
class TestDuplicateCodeGroups:
    def test_duplicate_reporting_and_cleanup(self, admin_token, mongo_db):
        db = mongo_db

        proj_id = f"TEST_proj_{uuid.uuid4().hex[:8]}"
        kod_norm = f"test_dupe_{uuid.uuid4().hex[:6]}"
        e1_id = f"TEST_el_{uuid.uuid4().hex[:8]}"
        e2_id = f"TEST_el_{uuid.uuid4().hex[:8]}"

        # Insert a throwaway project
        project_doc = {
            "id": proj_id,
            "company_id": os.environ.get("COMPANY_ID", "bzone-default"),
            "nazwa": f"TEST_project_{proj_id}",
            "status": "aktywny",
        }
        el_base = {
            "company_id": os.environ.get("COMPANY_ID", "bzone-default"),
            "project_id": proj_id,
            "kod_norm": kod_norm,
            "status": "do_wykonania",
            "geometria_typ": "punkt",
            "geometria_json": None,
        }
        el1 = {**el_base, "id": e1_id, "kod": f"TEST DUPE {kod_norm}"}
        el2 = {**el_base, "id": e2_id, "kod": f"testdupe{kod_norm}"}
        # unique index is partial on {do_wykonania, zgloszony_gotowy, odebrany}.
        # Insert e2 with status outside that filter so index doesn't block,
        # but the aggregation (excludes only 'zarchiwizowany') still counts it.
        el2["status"] = "wstrzymany"

        created_project = False
        created_el1 = False
        created_el2 = False
        try:
            db.projects.insert_one(project_doc)
            created_project = True
            db.elements.insert_one(el1)
            created_el1 = True
            db.elements.insert_one(el2)
            created_el2 = True

            # Call endpoint — expect our group present
            r = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(admin_token), timeout=20)
            assert r.status_code == 200, r.text
            groups = r.json()["duplicate_code_groups"]
            match = [g for g in groups if g["project_id"] == proj_id and g["kod_norm"] == kod_norm]
            assert len(match) == 1, f"expected duplicate group for {proj_id}/{kod_norm}, got: {groups}"
            g = match[0]
            assert g["count"] == 2
            assert isinstance(g["kody"], list)
            assert set(g["kody"]) == {el1["kod"], el2["kod"]}

            # Archive both offenders → group should disappear
            db.elements.update_many(
                {"id": {"$in": [e1_id, e2_id]}},
                {"$set": {"status": "zarchiwizowany"}})

            r2 = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(admin_token), timeout=20)
            assert r2.status_code == 200, r2.text
            groups2 = r2.json()["duplicate_code_groups"]
            match2 = [g for g in groups2 if g["project_id"] == proj_id and g["kod_norm"] == kod_norm]
            assert len(match2) == 0, \
                f"group still reported after archiving: {match2}"
        finally:
            # HARD DELETE throwaway rows — must not leave any test artifacts.
            if created_el1:
                db.elements.delete_one({"id": e1_id})
            if created_el2:
                db.elements.delete_one({"id": e2_id})
            if created_project:
                db.projects.delete_one({"id": proj_id})


# --------------------------------------------------------------------------- #
# H4: READ-ONLY — counters unchanged across two consecutive calls
# --------------------------------------------------------------------------- #
class TestAdminHealthReadOnly:
    def test_counts_unchanged_between_calls(self, admin_token):
        r1 = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(admin_token), timeout=15)
        assert r1.status_code == 200
        c1 = r1.json()["counts"]
        r2 = requests.get(f"{BASE_URL}/admin/health", headers=_hdr(admin_token), timeout=15)
        assert r2.status_code == 200
        c2 = r2.json()["counts"]
        assert c1 == c2, f"counters changed between two read-only calls: {c1} vs {c2}"
