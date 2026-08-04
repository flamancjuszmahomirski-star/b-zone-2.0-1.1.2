"""
B-ZONE 2.0 — Etap 1 deployment-hardening regression tests.

Covers:
 - Config: JWT_SECRET required + admin login still works (seeded admin present)
 - GET /api/ health
 - GET /api/projects returns liczba_czlonkow via single aggregation (correct count = 2)
 - DELETE /api/auth/me self-service deletion (removes user + project_members,
   writes audit entry 'usuniecie_wlasnego_konta', token unusable, login fails)
 - Regression sanity for auth approval + basic project CRUD/read
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PASSWORD = "Admin12345!"


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "haslo": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    j = r.json()
    assert "access_token" in j and j["access_token"]
    assert j["user"]["email"] == ADMIN_EMAIL
    assert j["user"]["rola"] == "admin"
    return j["access_token"]


def _register_and_approve(admin_tok, rola="worker", stawka=15.0, prefix="TESTE1"):
    email = f"test_e1_{uuid.uuid4().hex[:8]}@example.com"
    pw = "User12345!"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "haslo": pw,
        "imie": prefix, "nazwisko": "User"})
    assert r.status_code == 201, r.text
    pend = requests.get(f"{API}/users/pending", headers=H(admin_tok)).json()
    uid = next(u["id"] for u in pend if u["email"] == email)
    r = requests.patch(f"{API}/users/{uid}/approve",
                       headers=H(admin_tok),
                       json={"rola": rola, "stawka_godz_eur": stawka})
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/login", json={"email": email, "haslo": pw})
    assert r.status_code == 200, r.text
    return {"id": uid, "email": email, "pw": pw, "token": r.json()["access_token"]}


# ---------------- 1. Config / health / admin login ----------------

class TestConfigAndHealth:
    def test_api_root_health(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        j = r.json()
        assert j.get("status") == "ok"

    def test_admin_login_returns_token(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_admin_token_authorizes_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=H(admin_token))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["email"] == ADMIN_EMAIL
        assert j["rola"] == "admin"
        assert "hash" not in j
        assert "_id" not in j

    def test_missing_token_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_invalid_token_401(self):
        r = requests.get(f"{API}/auth/me", headers=H("garbage.token.value"))
        assert r.status_code == 401


# ---------------- 2. Projects N+1 fix / liczba_czlonkow ----------------

class TestProjectsMemberCount:
    def test_project_with_two_members_reports_two(self, admin_token):
        # Create project
        r = requests.post(f"{API}/projects", headers=H(admin_token), json={
            "nazwa": f"TEST_E1_PRJ_{uuid.uuid4().hex[:6]}", "kod": "MC",
            "klient_nazwa": "K", "adres": "Berlin, Germany",
            "godz_od": "07:00", "godz_do": "15:00",
            "dni_tyg": [1, 2, 3, 4, 5]})
        assert r.status_code == 201, r.text
        pid = r.json()["id"]

        # 2 users, both members
        u1 = _register_and_approve(admin_token, prefix="TESTE1A")
        u2 = _register_and_approve(admin_token, prefix="TESTE1B")
        try:
            for uid in (u1["id"], u2["id"]):
                r = requests.post(f"{API}/projects/{pid}/members",
                                  headers=H(admin_token),
                                  json={"user_id": uid, "jest_glowny": False})
                assert r.status_code == 201, r.text

            r = requests.get(f"{API}/projects", headers=H(admin_token))
            assert r.status_code == 200
            match = next((p for p in r.json() if p["id"] == pid), None)
            assert match is not None, "created project not in list"
            assert "liczba_czlonkow" in match
            assert match["liczba_czlonkow"] == 2, match

            # sanity: other projects still expose liczba_czlonkow (int)
            for p in r.json():
                assert isinstance(p.get("liczba_czlonkow"), int)
        finally:
            requests.delete(f"{API}/projects/{pid}", headers=H(admin_token))
            requests.delete(f"{API}/users/{u1['id']}", headers=H(admin_token))
            requests.delete(f"{API}/users/{u2['id']}", headers=H(admin_token))

    def test_empty_project_reports_zero(self, admin_token):
        r = requests.post(f"{API}/projects", headers=H(admin_token), json={
            "nazwa": f"TEST_E1_EMPTY_{uuid.uuid4().hex[:6]}", "kod": "MZ",
            "klient_nazwa": "K", "adres": "Berlin, Germany",
            "godz_od": "07:00", "godz_do": "15:00",
            "dni_tyg": [1, 2, 3, 4, 5]})
        assert r.status_code == 201
        pid = r.json()["id"]
        try:
            r = requests.get(f"{API}/projects", headers=H(admin_token))
            match = next(p for p in r.json() if p["id"] == pid)
            assert match["liczba_czlonkow"] == 0
        finally:
            requests.delete(f"{API}/projects/{pid}", headers=H(admin_token))


# ---------------- 3. DELETE /api/auth/me self-service ----------------

class TestDeleteMyAccount:
    def test_full_self_delete_flow(self, admin_token):
        u = _register_and_approve(admin_token, prefix="TESTE1DEL")

        # Add user to a fresh project so we can check project_members purge
        r = requests.post(f"{API}/projects", headers=H(admin_token), json={
            "nazwa": f"TEST_E1_DEL_{uuid.uuid4().hex[:6]}", "kod": "MD",
            "klient_nazwa": "K", "adres": "Berlin, Germany",
            "godz_od": "07:00", "godz_do": "15:00",
            "dni_tyg": [1, 2, 3, 4, 5]})
        assert r.status_code == 201
        pid = r.json()["id"]
        r = requests.post(f"{API}/projects/{pid}/members",
                          headers=H(admin_token),
                          json={"user_id": u["id"], "jest_glowny": False})
        assert r.status_code == 201

        try:
            # Sanity: member count == 1
            proj = next(p for p in requests.get(f"{API}/projects", headers=H(admin_token)).json()
                        if p["id"] == pid)
            assert proj["liczba_czlonkow"] == 1

            # Token works before deletion
            r = requests.get(f"{API}/auth/me", headers=H(u["token"]))
            assert r.status_code == 200

            # DELETE /api/auth/me
            r = requests.delete(f"{API}/auth/me", headers=H(u["token"]))
            assert r.status_code == 200, r.text
            assert r.json().get("deleted") is True

            # Token no longer works (user gone -> current_user 401)
            r = requests.get(f"{API}/auth/me", headers=H(u["token"]))
            assert r.status_code == 401, r.text

            # Cannot log back in
            r = requests.post(f"{API}/auth/login",
                              json={"email": u["email"], "haslo": u["pw"]})
            assert r.status_code == 401, r.text

            # project_members row removed (member count back to 0)
            proj = next(p for p in requests.get(f"{API}/projects", headers=H(admin_token)).json()
                        if p["id"] == pid)
            assert proj["liczba_czlonkow"] == 0

            # Audit log has usuniecie_wlasnego_konta for this user
            r = requests.get(f"{API}/audit-log", headers=H(admin_token))
            assert r.status_code == 200
            entries = [a for a in r.json()
                       if a.get("akcja") == "usuniecie_wlasnego_konta"
                       and a.get("user_id") == u["id"]]
            assert entries, "expected usuniecie_wlasnego_konta audit entry"
        finally:
            requests.delete(f"{API}/projects/{pid}", headers=H(admin_token))
            # user already gone; ignore
            requests.delete(f"{API}/users/{u['id']}", headers=H(admin_token))

    def test_delete_me_requires_auth(self):
        r = requests.delete(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- 4. Regression sanity ----------------

class TestRegressionSanity:
    def test_pending_registration_cannot_login(self):
        email = f"test_e1_pend_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "haslo": "Pending12345!",
            "imie": "P", "nazwisko": "Q"})
        assert r.status_code == 201
        r = requests.post(f"{API}/auth/login",
                          json={"email": email, "haslo": "Pending12345!"})
        assert r.status_code in (401, 403)

    def test_project_crud_admin(self, admin_token):
        r = requests.post(f"{API}/projects", headers=H(admin_token), json={
            "nazwa": f"TEST_E1_CRUD_{uuid.uuid4().hex[:6]}", "kod": "CR",
            "klient_nazwa": "K", "adres": "Berlin, Germany",
            "godz_od": "07:00", "godz_do": "15:00",
            "dni_tyg": [1, 2, 3, 4, 5]})
        assert r.status_code == 201
        pid = r.json()["id"]
        r = requests.get(f"{API}/projects/{pid}", headers=H(admin_token))
        assert r.status_code == 200
        r = requests.put(f"{API}/projects/{pid}", headers=H(admin_token),
                         json={"nazwa": f"TEST_E1_CRUD_{uuid.uuid4().hex[:6]}",
                               "kod": "CR2", "klient_nazwa": "K",
                               "adres": "Berlin, Germany",
                               "godz_od": "07:00", "godz_do": "15:00",
                               "dni_tyg": [1, 2, 3, 4, 5]})
        assert r.status_code == 200
        assert r.json()["kod"] == "CR2"
        r = requests.delete(f"{API}/projects/{pid}", headers=H(admin_token))
        assert r.status_code in (200, 204)
        # Project is archived (soft-delete) — remains GETtable but with status=zarchiwizowany
        r = requests.get(f"{API}/projects/{pid}", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json().get("status") == "zarchiwizowany"
