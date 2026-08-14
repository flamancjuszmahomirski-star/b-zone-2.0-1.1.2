"""
E4 — Soft-archive & ownership hardening (iteration 10).

Verifies that after the fix, the four evidentiary DELETE endpoints:
    DELETE /api/extra-hours/{eid}
    DELETE /api/reports/{report_id}
    DELETE /api/issues/{issue_id}
    DELETE /api/elements/{eid}
never hard-delete rows — they set status='zarchiwizowany' — and enforce
owner / admin / foreman authorisation. Also:
    PUT /api/reports/{report_id}  → author OR admin/foreman only.
    DELETE /api/extra-hours/{eid} → 409 when ujete_w_rozliczeniu_id set.

Also includes a static grep guarding server.py against re-introduction
of db.<col>.delete_one/delete_many on evidentiary collections.

All test users are prefixed test_ and archived at teardown.
Admin seed account admin@bzone.app is NEVER modified persistently.
"""

import asyncio
import os
import re
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

_BASE_ROOT = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
              or os.environ.get("EXPO_BACKEND_URL")
              or "").rstrip("/")
assert _BASE_ROOT, "EXPO_PUBLIC_BACKEND_URL missing from env"
BASE_URL = _BASE_ROOT + "/api"
ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PASSWORD = "MSbk566lLvI4b!U4"
STRONG_PW = "TestPass_Longer_14+aA1"

SERVER_PY = "/app/backend/server.py"

TIMEOUT = 20


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _uniq(tag: str) -> str:
    return f"test_{tag}_{uuid.uuid4().hex[:8]}@example.com"


def _login(email: str, password: str) -> requests.Response:
    return requests.post(f"{BASE_URL}/auth/login",
                         json={"email": email, "haslo": password}, timeout=TIMEOUT)


def _admin_token() -> str:
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _register(email: str, pw: str, imie="TEST", nazwisko="User") -> dict:
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email, "haslo": pw, "imie": imie, "nazwisko": nazwisko,
    }, timeout=TIMEOUT)
    assert r.status_code == 201, f"register {email}: {r.status_code} {r.text}"
    return r.json()


def _find_user_id(token: str, email: str) -> str:
    r = requests.get(f"{BASE_URL}/users",
                     headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    for u in r.json():
        if u["email"] == email.lower():
            return u["id"]
    raise AssertionError(f"user {email} not found")


def _approve(token: str, user_id: str, rola: str = "worker"):
    r = requests.patch(f"{BASE_URL}/users/{user_id}/approve",
                       headers={"Authorization": f"Bearer {token}"},
                       json={"rola": rola, "stawka_godz_eur": 12.5}, timeout=TIMEOUT)
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"


def _archive_user(token: str, user_id: str):
    try:
        requests.patch(f"{BASE_URL}/users/{user_id}/archive",
                       headers={"Authorization": f"Bearer {token}"}, timeout=10)
    except Exception:
        pass


def _make_user(admin_token: str, tag: str, rola: str = "worker") -> dict:
    email = _uniq(tag)
    _register(email, STRONG_PW)
    uid = _find_user_id(admin_token, email)
    _approve(admin_token, uid, rola)
    tok = _login(email, STRONG_PW).json()["access_token"]
    return {"id": uid, "email": email, "password": STRONG_PW, "token": tok, "rola": rola}


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _mongo():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _run(coro):
    return asyncio.run(coro)


def _db_set(collection: str, doc_id: str, patch: dict):
    async def go():
        c, db = _mongo()
        try:
            await db[collection].update_one({"id": doc_id}, {"$set": patch})
        finally:
            c.close()
    _run(go())


def _db_find_one(collection: str, doc_id: str) -> dict:
    async def go():
        c, db = _mongo()
        try:
            return await db[collection].find_one({"id": doc_id})
        finally:
            c.close()
    return _run(go())


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


@pytest.fixture(scope="module")
def admin_id(admin_token):
    r = requests.get(f"{BASE_URL}/auth/me", headers=_hdr(admin_token), timeout=TIMEOUT)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def project(admin_token):
    """Shared throwaway project + folder + view for element tests."""
    r = requests.post(f"{BASE_URL}/projects", headers=_hdr(admin_token),
                      json={"nazwa": f"TEST_E4_{uuid.uuid4().hex[:6]}"}, timeout=TIMEOUT)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    rf = requests.post(f"{BASE_URL}/projects/{pid}/folders", headers=_hdr(admin_token),
                       json={"nazwa": "TEST_folder"}, timeout=TIMEOUT)
    assert rf.status_code == 201, rf.text
    fid = rf.json()["id"]

    rv = requests.post(f"{BASE_URL}/folders/{fid}/views", headers=_hdr(admin_token),
                       json={"nazwa": "TEST_view",
                             "plik_url": "https://example.com/x.png",
                             "plik_typ": "image"}, timeout=TIMEOUT)
    assert rv.status_code == 201, rv.text
    vid = rv.json()["id"]

    yield {"pid": pid, "fid": fid, "vid": vid}

    # cleanup — soft-delete project (archives everything downstream)
    try:
        requests.delete(f"{BASE_URL}/projects/{pid}", headers=_hdr(admin_token), timeout=10)
    except Exception:
        pass


@pytest.fixture
def worker_a(admin_token):
    u = _make_user(admin_token, "workerA", "worker")
    yield u
    _archive_user(admin_token, u["id"])


@pytest.fixture
def worker_b(admin_token):
    u = _make_user(admin_token, "workerB", "worker")
    yield u
    _archive_user(admin_token, u["id"])


@pytest.fixture
def foreman_user(admin_token):
    u = _make_user(admin_token, "foreman", "foreman")
    yield u
    _archive_user(admin_token, u["id"])


# --------------------------------------------------------------------------- #
# 1) DELETE /api/extra-hours/{eid}
# --------------------------------------------------------------------------- #
class TestExtraHoursSoftArchive:
    def _create(self, tok, pid):
        r = requests.post(f"{BASE_URL}/extra-hours", headers=_hdr(tok),
                          json={"project_id": pid, "data": "2026-01-10",
                                "liczba_godzin": 2.5, "opis": "TEST_extra"},
                          timeout=TIMEOUT)
        assert r.status_code == 201, r.text
        return r.json()

    def test_owner_can_archive(self, admin_token, worker_a, project):
        eh = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/extra-hours/{eh['id']}",
                            headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json().get("archived") is True
        # row persists with status=zarchiwizowany
        doc = _db_find_one("extra_hours", eh["id"])
        assert doc is not None, "HARD DELETE: extra_hours row is gone"
        assert doc["status"] == "zarchiwizowany"

    def test_archived_excluded_from_list(self, admin_token, worker_a, project):
        eh = self._create(worker_a["token"], project["pid"])
        requests.delete(f"{BASE_URL}/extra-hours/{eh['id']}",
                        headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        r = requests.get(f"{BASE_URL}/extra-hours",
                         headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200
        ids = {x["id"] for x in r.json()}
        assert eh["id"] not in ids, "archived extra-hours must not appear in GET"

    def test_admin_can_archive_any(self, admin_token, worker_a, project):
        eh = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/extra-hours/{eh['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_foreman_can_archive_any(self, admin_token, worker_a, foreman_user, project):
        eh = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/extra-hours/{eh['id']}",
                            headers=_hdr(foreman_user["token"]), timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_other_worker_forbidden_403(self, admin_token, worker_a, worker_b, project):
        eh = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/extra-hours/{eh['id']}",
                            headers=_hdr(worker_b["token"]), timeout=TIMEOUT)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        # Row NOT archived
        doc = _db_find_one("extra_hours", eh["id"])
        assert doc["status"] == "naliczone", doc

    def test_in_settlement_returns_409(self, admin_token, worker_a, project):
        eh = self._create(worker_a["token"], project["pid"])
        # simulate inclusion in settlement via direct DB write
        _db_set("extra_hours", eh["id"], {"ujete_w_rozliczeniu_id": "TEST_settlement_1"})
        r = requests.delete(f"{BASE_URL}/extra-hours/{eh['id']}",
                            headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        assert r.status_code == 409, f"expected 409, got {r.status_code} {r.text}"
        # still NOT archived
        doc = _db_find_one("extra_hours", eh["id"])
        assert doc["status"] == "naliczone"
        assert doc.get("ujete_w_rozliczeniu_id") == "TEST_settlement_1"
        # cleanup
        _db_set("extra_hours", eh["id"], {"status": "zarchiwizowany"})

    def test_admin_also_blocked_by_409(self, admin_token, worker_a, project):
        eh = self._create(worker_a["token"], project["pid"])
        _db_set("extra_hours", eh["id"], {"ujete_w_rozliczeniu_id": "TEST_settlement_2"})
        r = requests.delete(f"{BASE_URL}/extra-hours/{eh['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 409, r.text
        _db_set("extra_hours", eh["id"], {"status": "zarchiwizowany"})


# --------------------------------------------------------------------------- #
# 2) DELETE /api/reports/{report_id}
# --------------------------------------------------------------------------- #
class TestReportsSoftArchive:
    def _create(self, tok, pid):
        r = requests.post(f"{BASE_URL}/reports", headers=_hdr(tok),
                          json={"project_id": pid, "opis": "TEST_report",
                                "zdjecia": [], "element_ids": []}, timeout=TIMEOUT)
        assert r.status_code == 201, r.text
        return r.json()

    def test_author_archives(self, admin_token, worker_a, project):
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/reports/{rep['id']}",
                            headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json().get("archived") is True
        doc = _db_find_one("daily_reports", rep["id"])
        assert doc is not None, "HARD DELETE: daily_reports row is gone"
        assert doc["status"] == "zarchiwizowany"

    def test_archived_hidden_from_list(self, admin_token, worker_a, project):
        rep = self._create(worker_a["token"], project["pid"])
        requests.delete(f"{BASE_URL}/reports/{rep['id']}",
                        headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        r = requests.get(f"{BASE_URL}/reports",
                         headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200
        ids = {x["id"] for x in r.json()}
        assert rep["id"] not in ids

    def test_admin_can_archive_any(self, admin_token, worker_a, project):
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/reports/{rep['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_foreman_can_archive_any(self, admin_token, worker_a, foreman_user, project):
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/reports/{rep['id']}",
                            headers=_hdr(foreman_user["token"]), timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_other_worker_forbidden_403(self, worker_a, worker_b, project):
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/reports/{rep['id']}",
                            headers=_hdr(worker_b["token"]), timeout=TIMEOUT)
        assert r.status_code == 403, r.text
        doc = _db_find_one("daily_reports", rep["id"])
        assert doc["status"] != "zarchiwizowany"


# --------------------------------------------------------------------------- #
# 3) PUT /api/reports/{report_id} — ownership enforcement (NEW)
# --------------------------------------------------------------------------- #
class TestReportUpdateOwnership:
    def _create(self, tok, pid):
        r = requests.post(f"{BASE_URL}/reports", headers=_hdr(tok),
                          json={"project_id": pid, "opis": "TEST_update_original",
                                "zdjecia": [], "element_ids": []}, timeout=TIMEOUT)
        assert r.status_code == 201, r.text
        return r.json()

    def test_author_can_update(self, worker_a, project):
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.put(f"{BASE_URL}/reports/{rep['id']}",
                         headers=_hdr(worker_a["token"]),
                         json={"project_id": project["pid"],
                               "opis": "TEST_update_edited_by_author",
                               "zdjecia": [], "element_ids": [], "transkrypcja": ""},
                         timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json()["opis"] == "TEST_update_edited_by_author"

    def test_admin_can_update_any(self, admin_token, worker_a, project):
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.put(f"{BASE_URL}/reports/{rep['id']}",
                         headers=_hdr(admin_token),
                         json={"project_id": project["pid"],
                               "opis": "TEST_edit_by_admin",
                               "zdjecia": [], "element_ids": [], "transkrypcja": ""},
                         timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_foreman_can_update_any(self, worker_a, foreman_user, project):
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.put(f"{BASE_URL}/reports/{rep['id']}",
                         headers=_hdr(foreman_user["token"]),
                         json={"project_id": project["pid"],
                               "opis": "TEST_edit_by_foreman",
                               "zdjecia": [], "element_ids": [], "transkrypcja": ""},
                         timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_other_worker_forbidden_403(self, worker_a, worker_b, project):
        """Previously any logged-in user could edit anyone's report — now must 403."""
        rep = self._create(worker_a["token"], project["pid"])
        r = requests.put(f"{BASE_URL}/reports/{rep['id']}",
                         headers=_hdr(worker_b["token"]),
                         json={"project_id": project["pid"],
                               "opis": "MALICIOUS_edit_by_other_worker",
                               "zdjecia": [], "element_ids": [], "transkrypcja": ""},
                         timeout=TIMEOUT)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        # verify content NOT changed
        doc = _db_find_one("daily_reports", rep["id"])
        assert doc["opis"] == "TEST_update_original"


# --------------------------------------------------------------------------- #
# 4) DELETE /api/issues/{issue_id}
# --------------------------------------------------------------------------- #
class TestIssuesSoftArchive:
    def _create(self, tok, pid):
        r = requests.post(f"{BASE_URL}/issues", headers=_hdr(tok),
                          json={"project_id": pid, "tytul": "TEST_issue",
                                "opis": "opis", "priorytet": "sredni"},
                          timeout=TIMEOUT)
        assert r.status_code == 201, r.text
        return r.json()

    def test_author_archives(self, worker_a, project):
        iss = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/issues/{iss['id']}",
                            headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json().get("archived") is True
        doc = _db_find_one("issues", iss["id"])
        assert doc is not None, "HARD DELETE: issue row gone"
        assert doc["status"] == "zarchiwizowany"

    def test_archived_hidden_from_list(self, admin_token, worker_a, project):
        iss = self._create(worker_a["token"], project["pid"])
        requests.delete(f"{BASE_URL}/issues/{iss['id']}",
                        headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        r = requests.get(f"{BASE_URL}/issues",
                         headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200
        ids = {x["id"] for x in r.json()}
        assert iss["id"] not in ids

    def test_admin_can_archive_any(self, admin_token, worker_a, project):
        iss = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/issues/{iss['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_foreman_can_archive_any(self, worker_a, foreman_user, project):
        iss = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/issues/{iss['id']}",
                            headers=_hdr(foreman_user["token"]), timeout=TIMEOUT)
        assert r.status_code == 200, r.text

    def test_other_worker_forbidden_403(self, worker_a, worker_b, project):
        iss = self._create(worker_a["token"], project["pid"])
        r = requests.delete(f"{BASE_URL}/issues/{iss['id']}",
                            headers=_hdr(worker_b["token"]), timeout=TIMEOUT)
        assert r.status_code == 403, r.text
        doc = _db_find_one("issues", iss["id"])
        assert doc["status"] != "zarchiwizowany"


# --------------------------------------------------------------------------- #
# 5) DELETE /api/elements/{eid}  — UNIFIED archive (all statuses)
# --------------------------------------------------------------------------- #
class TestElementsUnifiedArchive:
    def _create(self, tok, vid, kod):
        r = requests.post(f"{BASE_URL}/views/{vid}/elements", headers=_hdr(tok),
                          json={"kod": kod, "pozycja_x": 0.1, "pozycja_y": 0.1},
                          timeout=TIMEOUT)
        assert r.status_code == 201, f"{r.status_code} {r.text}"
        return r.json()

    def test_do_wykonania_archives(self, admin_token, project):
        el = self._create(admin_token, project["vid"], f"E_dw_{uuid.uuid4().hex[:5]}")
        assert el["status"] == "do_wykonania"
        r = requests.delete(f"{BASE_URL}/elements/{el['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json().get("archived") is True
        doc = _db_find_one("elements", el["id"])
        assert doc is not None, "HARD DELETE: element row gone for status=do_wykonania"
        assert doc["status"] == "zarchiwizowany"

    def test_zgloszony_gotowy_archives(self, admin_token, project):
        el = self._create(admin_token, project["vid"], f"E_zg_{uuid.uuid4().hex[:5]}")
        # promote directly via DB write
        _db_set("elements", el["id"], {"status": "zgloszony_gotowy"})
        r = requests.delete(f"{BASE_URL}/elements/{el['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        doc = _db_find_one("elements", el["id"])
        assert doc is not None, "HARD DELETE: element row gone for status=zgloszony_gotowy"
        assert doc["status"] == "zarchiwizowany"

    def test_odebrany_archives(self, admin_token, project):
        el = self._create(admin_token, project["vid"], f"E_od_{uuid.uuid4().hex[:5]}")
        _db_set("elements", el["id"], {"status": "odebrany"})
        r = requests.delete(f"{BASE_URL}/elements/{el['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        doc = _db_find_one("elements", el["id"])
        assert doc is not None
        assert doc["status"] == "zarchiwizowany"

    def test_worker_forbidden_403(self, admin_token, worker_a, project):
        el = self._create(admin_token, project["vid"], f"E_w_{uuid.uuid4().hex[:5]}")
        r = requests.delete(f"{BASE_URL}/elements/{el['id']}",
                            headers=_hdr(worker_a["token"]), timeout=TIMEOUT)
        assert r.status_code == 403, r.text
        # still not archived
        doc = _db_find_one("elements", el["id"])
        assert doc["status"] != "zarchiwizowany"


# --------------------------------------------------------------------------- #
# 6) Static grep — no hard deletes on evidentiary collections in server.py
# --------------------------------------------------------------------------- #
class TestStaticNoHardDelete:
    def test_no_delete_one_or_many_on_evidentiary_collections(self):
        with open(SERVER_PY, "r", encoding="utf-8") as f:
            src = f.read()
        forbidden = ["daily_reports", "extra_hours", "issues", "elements"]
        for col in forbidden:
            pattern = rf"db\.{col}\.delete_(one|many)\b"
            m = re.search(pattern, src)
            assert m is None, (
                f"FORBIDDEN HARD DELETE FOUND: db.{col}.delete_* in server.py "
                f"at position {m.start() if m else '?'} — must be soft-archive only")

    def test_users_still_soft_archive_only(self):
        with open(SERVER_PY, "r", encoding="utf-8") as f:
            src = f.read()
        assert "db.users.delete_one" not in src
        assert "db.users.delete_many" not in src

    def test_project_members_hard_delete_allowed(self):
        """junction table — hard-delete is intentionally allowed."""
        with open(SERVER_PY, "r", encoding="utf-8") as f:
            src = f.read()
        assert re.search(r"db\.project_members\.delete_(one|many)", src), (
            "expected junction-table cleanup on project_members")


# --------------------------------------------------------------------------- #
# 7) E3 regression — DELETE /users/{id} and DELETE /auth/me still guarded
# --------------------------------------------------------------------------- #
class TestE3Regression:
    def test_admin_self_delete_users_blocked(self, admin_token, admin_id):
        r = requests.delete(f"{BASE_URL}/users/{admin_id}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 400, f"self-delete must be 400: {r.status_code} {r.text}"

    def test_delete_worker_soft_archive(self, admin_token, worker_a):
        r = requests.delete(f"{BASE_URL}/users/{worker_a['id']}",
                            headers=_hdr(admin_token), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        # verify row persists with archived status
        lst = requests.get(f"{BASE_URL}/users", headers=_hdr(admin_token),
                           timeout=TIMEOUT).json()
        row = next((u for u in lst if u["id"] == worker_a["id"]), None)
        assert row is not None, "HARD DELETE regression on /users/{id}"
        assert row["status"] == "zarchiwizowany"

    def test_delete_auth_me_worker_soft_archive(self, admin_token, worker_b):
        r = requests.delete(f"{BASE_URL}/auth/me",
                            headers=_hdr(worker_b["token"]), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json() == {"deleted": True}
        lst = requests.get(f"{BASE_URL}/users", headers=_hdr(admin_token),
                           timeout=TIMEOUT).json()
        row = next((u for u in lst if u["id"] == worker_b["id"]), None)
        assert row is not None, "HARD DELETE regression on /auth/me"
        assert row["status"] == "zarchiwizowany"

    def test_seed_admin_still_active(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200, f"seed admin login broken: {r.text}"
