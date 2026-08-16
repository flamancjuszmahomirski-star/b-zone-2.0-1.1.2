"""RUNDA 1.3 backend verification (A1, A2, B5, B3, E1b, C4).
Uses the public preview URL from EXPO_PUBLIC_BACKEND_URL. Cleans up all TEST_ data.
Admin lockout is NEVER tested against admin@bzone.app — only a throwaway TEST_ user.
"""
import os
import time
import io
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PW = "MSbk566lLvI4b!U4"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session")
def admin_token():
    # log in as admin (must_change_password bypass: change to same pw)
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": ADMIN_EMAIL, "haslo": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    # clear forced-change if any
    requests.post(f"{BASE}/auth/change-password",
                  json={"nowe": ADMIN_PW},
                  headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    return tok


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ------------------------------------------------------------------ A1 files
class TestA1Files:
    def test_upload_and_fetch_content(self, admin_h, mongo):
        png = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
        r = requests.post(f"{BASE}/files",
                          files={"file": ("t.png", io.BytesIO(png), "image/png")},
                          data={"kind": "attachment"}, headers=admin_h, timeout=30)
        assert r.status_code == 201, r.text
        j = r.json()
        assert "id" in j and j["url"].startswith("/api/files/")
        fid = j["id"]
        # verify storage_path stored in mongo
        doc = mongo.files.find_one({"id": fid})
        assert doc and doc.get("storage_path"), f"missing storage_path in mongo doc: {doc}"
        # fetch content back
        r2 = requests.get(f"{BASE}/files/{fid}/content", timeout=30)
        assert r2.status_code == 200
        assert r2.content == png
        # cleanup
        mongo.files.delete_one({"id": fid})

    def test_legacy_orphan_returns_410_and_marks_utracony(self, admin_h, mongo):
        fake_id = f"TEST_orphan_{uuid.uuid4().hex[:8]}"
        mongo.files.insert_one({
            "id": fake_id, "company_id": "bzone-default", "owner_id": "x",
            "kind": "attachment", "original_name": "x", "content_type": "image/jpeg",
            "path": "/nonexistent.jpg", "status": "active",
        })
        try:
            r = requests.get(f"{BASE}/files/{fake_id}/content", timeout=15)
            assert r.status_code == 410, f"expected 410 got {r.status_code} {r.text}"
            doc = mongo.files.find_one({"id": fake_id})
            assert doc["status"] == "utracony"
        finally:
            mongo.files.delete_one({"id": fake_id})


# ------------------------------------------------------------------ A2 project partial update
class TestA2ProjectPartial:
    def test_partial_update_preserves_untouched(self, admin_h):
        body = {
            "nazwa": "TEST_R13", "kod": "T13", "waluta": "EUR",
            "godz_od": "07:00", "godz_do": "15:00",
            "dni_tyg": [1, 2, 3, 4, 5], "soboty_auto": False, "soboty_godziny": 0,
            "termin_platnosci_klient_dni": 30, "termin_platnosci_ekipa_dni": 21,
            "vat_tryb": "stawka", "tryb_rozliczenia": "godzinowy",
        }
        r = requests.post(f"{BASE}/projects", json=body, headers=admin_h, timeout=15)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        try:
            # send ONLY nazwa
            r2 = requests.put(f"{BASE}/projects/{pid}",
                              json={"nazwa": "TEST_R13b"},
                              headers=admin_h, timeout=15)
            assert r2.status_code == 200, r2.text
            g = requests.get(f"{BASE}/projects/{pid}", headers=admin_h, timeout=15).json()
            assert g["nazwa"] == "TEST_R13b"
            assert g["vat_tryb"] == "stawka"
            assert g["termin_platnosci_klient_dni"] == 30
            assert g["termin_platnosci_ekipa_dni"] == 21
            assert g["dni_tyg"] == [1, 2, 3, 4, 5]
            assert g["tryb_rozliczenia"] == "godzinowy"
        finally:
            requests.delete(f"{BASE}/projects/{pid}", headers=admin_h, timeout=15)


# ------------------------------------------------------------------ (B5 moved after B3/E1b so 3-per-hour register budget is spent last)





# ------------------------------------------------------------------ B3 admin reset -> 16-char password
class TestB3AdminReset:
    """B3: run FIRST (needs 1 registration slot before B5 rate-limit test)."""
    def test_reset_generates_16_char_password_and_forces_change(self, admin_h):
        email = f"TEST_reset_{uuid.uuid4().hex[:6]}@test.pl"
        reg = requests.post(f"{BASE}/auth/register", json={
            "email": email, "haslo": "Password12345!x",
            "imie": "T", "nazwisko": "R",
        }, timeout=10)
        if reg.status_code == 429:
            pytest.skip("register rate limit exhausted this hour")
        assert reg.status_code == 201, reg.text
        pend = requests.get(f"{BASE}/users/pending", headers=admin_h).json()
        uid = next(u["id"] for u in pend if u["email"].lower() == email.lower())
        requests.patch(f"{BASE}/users/{uid}/approve",
                       json={"rola": "worker", "stawka_godz_eur": 5},
                       headers=admin_h, timeout=10)
        try:
            r = requests.post(f"{BASE}/users/{uid}/reset-password",
                              json={}, headers=admin_h, timeout=15)
            assert r.status_code == 200, r.text
            j = r.json()
            assert j.get("reset") is True
            nowe = j.get("nowe", "")
            assert len(nowe) == 16, f"expected 16-char, got {len(nowe)}: {nowe!r}"
            # login with generated password → must_change_password True
            r2 = requests.post(f"{BASE}/auth/login",
                               json={"email": email, "haslo": nowe}, timeout=10)
            assert r2.status_code == 200, r2.text
            u = r2.json()["user"]
            assert u.get("must_change_password") is True
        finally:
            requests.delete(f"{BASE}/users/{uid}", headers=admin_h, timeout=10)


# ------------------------------------------------------------------ E1b role guards
class TestE1bRoleGuards:
    @pytest.fixture(scope="class")
    def contractor(self, request, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        email = f"TEST_contr_{uuid.uuid4().hex[:6]}@test.pl"
        reg = requests.post(f"{BASE}/auth/register", json={
            "email": email, "haslo": "Password12345!x", "imie": "C", "nazwisko": "X",
        }, timeout=10)
        if reg.status_code == 429:
            pytest.skip("register rate limit exhausted this hour")
        assert reg.status_code == 201, reg.text
        pend = requests.get(f"{BASE}/users/pending", headers=h).json()
        uid = next(u["id"] for u in pend if u["email"].lower() == email.lower())
        requests.patch(f"{BASE}/users/{uid}/approve",
                       json={"rola": "contractor", "stawka_godz_eur": 0}, headers=h)
        r = requests.post(f"{BASE}/auth/login",
                          json={"email": email, "haslo": "Password12345!x"}, timeout=10)
        assert r.status_code == 200, r.text
        ctok = r.json()["access_token"]
        requests.post(f"{BASE}/auth/change-password",
                      json={"nowe": "Password12345!x"},
                      headers={"Authorization": f"Bearer {ctok}"}, timeout=10)
        request.addfinalizer(lambda: requests.delete(f"{BASE}/users/{uid}", headers=h, timeout=10))
        return {"uid": uid, "token": ctok}

    def test_contractor_cannot_create_report(self, contractor):
        h = {"Authorization": f"Bearer {contractor['token']}"}
        r = requests.post(f"{BASE}/reports",
                          json={"project_id": "any", "opis": "x"},
                          headers=h, timeout=10)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_contractor_cannot_create_extra_hours(self, contractor):
        h = {"Authorization": f"Bearer {contractor['token']}"}
        r = requests.post(f"{BASE}/extra-hours",
                          json={"project_id": "x", "data": "2026-01-01", "liczba_godzin": 1},
                          headers=h, timeout=10)
        assert r.status_code == 403, r.text

    def test_register_push_requires_auth(self):
        r = requests.post(f"{BASE}/register-push",
                          json={"user_id": "x", "platform": "ios", "device_token": "t"},
                          timeout=10)
        assert r.status_code in (401, 403), f"got {r.status_code} {r.text}"


# ------------------------------------------------------------------ C4: 422 shape
class TestC4LoginMalformed:
    def test_malformed_login_returns_422(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": 123}, timeout=10)
        assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text}"
        body = r.json()
        # FastAPI shape: {"detail": [{...}, ...]}  — frontend maps to readable text


# ------------------------------------------------------------------ B5 lockout + register rate limit
# Placed AFTER B3+E1b so the 3-per-hour register budget serves those tests first.
class TestZ5B5LockoutAndRateLimit:
    """NEVER attempt failed logins on admin — only on a throwaway TEST_ user."""

    def _make_test_user(self, admin_h, email, approve=True):
        reg = requests.post(f"{BASE}/auth/register", json={
            "email": email, "haslo": "Password12345!x",
            "imie": "T", "nazwisko": "R13",
        }, timeout=15)
        if reg.status_code == 429:
            pytest.skip("register rate limit already exhausted this hour")
        assert reg.status_code == 201, reg.text
        pend = requests.get(f"{BASE}/users/pending", headers=admin_h, timeout=10).json()
        uid = next((u["id"] for u in pend if u["email"].lower() == email.lower()), None)
        assert uid, f"user {email} not pending (pending={[u['email'] for u in pend[:5]]})"
        if approve:
            requests.patch(f"{BASE}/users/{uid}/approve",
                           json={"rola": "worker", "stawka_godz_eur": 10},
                           headers=admin_h, timeout=10)
        return uid

    def test_login_lockout_after_5_failed_attempts(self, admin_h):
        email = f"TEST_lock_{uuid.uuid4().hex[:6]}@test.pl"
        uid = self._make_test_user(admin_h, email)
        try:
            statuses = []
            for _ in range(6):
                r = requests.post(f"{BASE}/auth/login",
                                  json={"email": email, "haslo": "wrongwrong!!!"},
                                  timeout=10)
                statuses.append(r.status_code)
            assert 423 in statuses, (
                f"NO 423 lockout observed — B5 login-lockout appears NOT IMPLEMENTED. "
                f"Response codes: {statuses}"
            )
        finally:
            requests.delete(f"{BASE}/users/{uid}", headers=admin_h, timeout=10)

    def test_register_rate_limit_returns_429(self, admin_h):
        # This test MUST run LAST — it may exhaust the /h/IP register budget for other tests.
        try:
            for _ in range(4):
                r = requests.post(f"{BASE}/auth/register", json={
                    "email": f"TEST_rate_{uuid.uuid4().hex[:6]}@test.pl",
                    "haslo": "Password12345!x", "imie": "R", "nazwisko": "L",
                }, timeout=10)
                if r.status_code == 429:
                    return  # PASS: rate limit triggered
                assert r.status_code == 201, r.text
            pytest.fail("expected 429 within 4 tries")
        finally:
            pend = requests.get(f"{BASE}/users", headers=admin_h, timeout=10).json()
            for u in pend:
                if u.get("email", "").startswith("TEST_rate_"):
                    requests.delete(f"{BASE}/users/{u['id']}", headers=admin_h, timeout=10)

        assert "detail" in body
        assert isinstance(body["detail"], list)
