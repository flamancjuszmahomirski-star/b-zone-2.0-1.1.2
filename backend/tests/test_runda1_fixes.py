"""
B-ZONE 2.0 — RUNDA 1 pre-crew fixes verification.
Covers:
 - Report POST is fast even when weather is unavailable (timeout 6s, pogoda=null OK)
 - Report richer GET: elementy/extra_godziny/klient_nazwa
 - Element code uniqueness: 409 on create/update dup, /duplicates, /validate-codes, index exists
 - Issues POST contractor 403
 - Change-password endpoint (throwaway user only)
 - Element schema: geometria_typ/geometria_json defaults
 - Contractor security: no financial fields
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-builder-11766.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PASSWORD = "Admin12345!"


def H(tok): return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def ctx():
    """Build a self-contained fixture: admin token, project, worker, contractor, view."""
    ctx = {}
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "haslo": ADMIN_PASSWORD}, timeout=10)
    assert r.status_code == 200, r.text
    ctx["admin_token"] = r.json()["access_token"]
    ctx["admin_id"] = r.json()["user"]["id"]

    # Create project (no address so weather fetch has nothing to resolve)
    proj = {
        "nazwa": f"TEST_R1_{uuid.uuid4().hex[:6]}",
        "kod": f"R1{uuid.uuid4().hex[:4]}",
        "klient_nazwa": "TEST_ClientAG",
        "adres": "",  # empty on purpose for weather timeout scenario
        "godz_od": "07:00", "godz_do": "15:00", "dni_tyg": [1, 2, 3, 4, 5],
        "tryb_rozliczenia": "godzinowy", "stawka_sprzedazy_godz": 55.0,
        "termin": "2026-12-31",
    }
    r = requests.post(f"{API}/projects", headers=H(ctx["admin_token"]), json=proj, timeout=15)
    assert r.status_code == 201, r.text
    p = r.json()
    ctx["project_id"] = p["id"]
    # sanity: PUT with deadline+klient_nazwa
    assert p.get("klient_nazwa") == "TEST_ClientAG"

    # Worker
    w_email = f"test_w_{uuid.uuid4().hex[:8]}@ex.com"
    w_pass = "Worker12345!"
    r = requests.post(f"{API}/auth/register", json={
        "email": w_email, "haslo": w_pass, "imie": "TESTW", "nazwisko": "R1"}, timeout=10)
    assert r.status_code == 201
    ctx["worker_email"] = w_email; ctx["worker_password"] = w_pass
    # find + approve
    pending = requests.get(f"{API}/users/pending", headers=H(ctx["admin_token"])).json()
    w = next(u for u in pending if u["email"] == w_email)
    ctx["worker_id"] = w["id"]
    r = requests.patch(f"{API}/users/{w['id']}/approve", headers=H(ctx["admin_token"]),
                       json={"rola": "worker", "stawka_godz_eur": 12.0}, timeout=10)
    assert r.status_code == 200
    ctx["worker_token"] = requests.post(f"{API}/auth/login",
        json={"email": w_email, "haslo": w_pass}).json()["access_token"]
    # member on project
    requests.post(f"{API}/projects/{ctx['project_id']}/members",
                  headers=H(ctx["admin_token"]),
                  json={"user_id": ctx["worker_id"], "jest_glowny": False})

    # Contractor
    c_email = f"test_c_{uuid.uuid4().hex[:8]}@ex.com"; c_pass = "Contractor12345!"
    requests.post(f"{API}/auth/register", json={"email": c_email, "haslo": c_pass, "imie": "TESTC", "nazwisko": "R1"})
    pend = requests.get(f"{API}/users/pending", headers=H(ctx["admin_token"])).json()
    cu = next(u for u in pend if u["email"] == c_email)
    ctx["contractor_id"] = cu["id"]
    requests.patch(f"{API}/users/{cu['id']}/approve", headers=H(ctx["admin_token"]),
                   json={"rola": "contractor"})
    ctx["contractor_token"] = requests.post(f"{API}/auth/login",
        json={"email": c_email, "haslo": c_pass}).json()["access_token"]
    # link contractor to project
    requests.put(f"{API}/projects/{ctx['project_id']}", headers=H(ctx["admin_token"]),
                 json={"kontrahent_user_id": ctx["contractor_id"]})

    # Folder + View so elements can be created
    fold = requests.post(f"{API}/projects/{ctx['project_id']}/folders",
                        headers=H(ctx["admin_token"]),
                        json={"nazwa": "TEST_F"}).json()
    ctx["folder_id"] = fold["id"]
    view = requests.post(f"{API}/folders/{fold['id']}/views", headers=H(ctx["admin_token"]),
                         json={"nazwa": "TEST_V", "plik_url": "https://example.com/x.png",
                               "plik_typ": "image", "szerokosc": 1000, "wysokosc": 800}).json()
    assert "id" in view, f"view create failed: {view}"
    ctx["view_id"] = view["id"]

    yield ctx

    # cleanup
    for eid in ctx.get("created_element_ids", []):
        requests.delete(f"{API}/elements/{eid}", headers=H(ctx["admin_token"]))
    requests.delete(f"{API}/projects/{ctx['project_id']}", headers=H(ctx["admin_token"]))
    requests.delete(f"{API}/users/{ctx['worker_id']}", headers=H(ctx["admin_token"]))
    requests.delete(f"{API}/users/{ctx['contractor_id']}", headers=H(ctx["admin_token"]))


# ------------------------------------------------------------------
# 1.1  Report POST — weather timeout is bounded, endpoint returns 201 quickly
# ------------------------------------------------------------------
class Test11ReportWeatherTimeout:
    def test_create_report_fast_no_address(self, ctx):
        # create an element to also cover element_ids + extra_godziny path
        r = requests.post(f"{API}/views/{ctx['view_id']}/elements",
                          headers=H(ctx["admin_token"]),
                          json={"kod": "E1", "typ_id": None, "pozycja_x": 0.1, "pozycja_y": 0.1})
        assert r.status_code == 201
        eid = r.json()["id"]
        ctx.setdefault("created_element_ids", []).append(eid)

        # verify schema defaults (task 4)
        assert r.json().get("geometria_typ") == "punkt"
        assert r.json().get("geometria_json") is None

        # delay reason (needed for extra hours ref)
        drs = requests.get(f"{API}/delay-reasons", headers=H(ctx["admin_token"])).json()
        reason_id = drs[0]["id"] if drs else None

        started = time.time()
        r = requests.post(f"{API}/reports", headers=H(ctx["worker_token"]), json={
            "project_id": ctx["project_id"], "opis": "Bez adresu — pogoda ma być null.",
            "zdjecia": [], "element_ids": [eid],
            "extra_godziny": {"liczba_godzin": 1.5, "przyczyna_id": reason_id, "opis": "opóźnienie"},
        }, timeout=15)
        elapsed = time.time() - started
        assert r.status_code == 201, r.text
        assert elapsed < 10, f"Report POST too slow: {elapsed:.1f}s"
        j = r.json()
        # weather may be None (empty address = geocoding fails). Task requirement.
        assert j.get("pogoda_json") is None, "expected pogoda_json=null with empty address"
        ctx["report_id"] = j["id"]

    def test_get_report_enriched(self, ctx):
        r = requests.get(f"{API}/reports/{ctx['report_id']}", headers=H(ctx["admin_token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("klient_nazwa") == "TEST_ClientAG"
        assert isinstance(j.get("elementy"), list) and len(j["elementy"]) == 1
        el = j["elementy"][0]
        assert el.get("kod") == "E1"
        # element should now be zgloszony_gotowy since we passed it in element_ids
        assert el.get("status") in ("zgloszony_gotowy", "odebrany")
        assert isinstance(j.get("extra_godziny"), list) and len(j["extra_godziny"]) == 1
        eh = j["extra_godziny"][0]
        assert eh.get("liczba_godzin") == 1.5
        # przyczyna_pl/en should be joined
        assert "przyczyna_pl" in eh and "przyczyna_en" in eh


# ------------------------------------------------------------------
# 1.2  Element code uniqueness
# ------------------------------------------------------------------
class Test12ElementUniqueness:
    def test_duplicate_code_409(self, ctx):
        # First code
        r = requests.post(f"{API}/views/{ctx['view_id']}/elements",
                          headers=H(ctx["admin_token"]), json={"kod": "DUP1", "typ_id": None, "pozycja_x": 0.2, "pozycja_y": 0.2})
        assert r.status_code == 201
        e1 = r.json()["id"]; ctx["created_element_ids"].append(e1)
        # Second same code → 409
        r = requests.post(f"{API}/views/{ctx['view_id']}/elements",
                          headers=H(ctx["admin_token"]), json={"kod": "DUP1", "typ_id": None, "pozycja_x": 0.2, "pozycja_y": 0.2})
        assert r.status_code == 409, r.text
        assert "użyt" in r.text.lower() or "used" in r.text.lower()

    def test_put_rename_conflict_409(self, ctx):
        # ensure another distinct code exists
        r = requests.post(f"{API}/views/{ctx['view_id']}/elements",
                          headers=H(ctx["admin_token"]), json={"kod": "OTHER1", "typ_id": None, "pozycja_x": 0.3, "pozycja_y": 0.3})
        assert r.status_code == 201
        oid = r.json()["id"]; ctx["created_element_ids"].append(oid)
        # rename OTHER1 → DUP1 (taken)
        r = requests.put(f"{API}/elements/{oid}", headers=H(ctx["admin_token"]),
                         json={"kod": "DUP1"})
        assert r.status_code == 409, r.text

    def test_validate_codes(self, ctx):
        r = requests.post(f"{API}/projects/{ctx['project_id']}/elements/validate-codes",
                          headers=H(ctx["admin_token"]),
                          json={"kody": ["DUP1", "FREE_X", "FREE_Y", "FREE_X"]})
        assert r.status_code == 200
        j = r.json()
        assert "taken" in j and "ok" in j
        assert "DUP1" in j["taken"] and "FREE_X" in j["taken"]  # dup within batch
        assert j["ok"] is False

    def test_duplicates_endpoint_empty(self, ctx):
        # after test_duplicate_code_409, DUP1 exists only once (2nd insert failed)
        r = requests.get(f"{API}/projects/{ctx['project_id']}/elements/duplicates",
                         headers=H(ctx["admin_token"]))
        assert r.status_code == 200
        assert r.json() == []  # no real duplicates because uniqueness prevented them


# ------------------------------------------------------------------
# 2.1  Issues — contractor forbidden
# ------------------------------------------------------------------
class Test21IssuesContractor:
    def test_contractor_cannot_create_issue(self, ctx):
        r = requests.post(f"{API}/issues", headers=H(ctx["contractor_token"]), json={
            "project_id": ctx["project_id"], "tytul": "TEST_c",
            "opis": "attempt", "priorytet": "sredni"})
        assert r.status_code == 403, r.text

    def test_worker_can_create_issue(self, ctx):
        r = requests.post(f"{API}/issues", headers=H(ctx["worker_token"]), json={
            "project_id": ctx["project_id"], "tytul": "TEST_w_ok",
            "opis": "ok", "priorytet": "sredni"})
        assert r.status_code == 201, r.text
        requests.delete(f"{API}/issues/{r.json()['id']}", headers=H(ctx["admin_token"]))


# ------------------------------------------------------------------
# 3.2  Change-password — using a throwaway user (NOT admin)
# ------------------------------------------------------------------
class Test32ChangePassword:
    def test_min8_and_change(self, ctx):
        email = f"test_cp_{uuid.uuid4().hex[:8]}@ex.com"
        p1 = "OldPass12345!"; p2 = "NewPass67890!"
        r = requests.post(f"{API}/auth/register", json={"email": email, "haslo": p1,
                          "imie": "TC", "nazwisko": "P"}); assert r.status_code == 201
        pend = requests.get(f"{API}/users/pending", headers=H(ctx["admin_token"])).json()
        uid = next(u["id"] for u in pend if u["email"] == email)
        requests.patch(f"{API}/users/{uid}/approve", headers=H(ctx["admin_token"]),
                       json={"rola": "worker", "stawka_godz_eur": 10.0})
        tok = requests.post(f"{API}/auth/login", json={"email": email, "haslo": p1}).json()["access_token"]

        # too short → 422
        r = requests.post(f"{API}/auth/change-password", headers=H(tok),
                          json={"stare": p1, "nowe": "abc"})
        assert r.status_code == 422

        # wrong old → 401
        r = requests.post(f"{API}/auth/change-password", headers=H(tok),
                          json={"stare": "wrong123", "nowe": p2})
        assert r.status_code == 401

        # correct → 200 and can re-login with new password
        r = requests.post(f"{API}/auth/change-password", headers=H(tok),
                          json={"stare": p1, "nowe": p2})
        assert r.status_code == 200
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "haslo": p2})
        assert r2.status_code == 200
        # old password must fail now
        assert requests.post(f"{API}/auth/login",
                             json={"email": email, "haslo": p1}).status_code == 401
        requests.delete(f"{API}/users/{uid}", headers=H(ctx["admin_token"]))


# ------------------------------------------------------------------
# 4  Schema defaults + REGRESSION contractor security
# ------------------------------------------------------------------
class Test4Regression:
    def test_contractor_no_financial_fields(self, ctx):
        r = requests.get(f"{API}/projects/{ctx['project_id']}", headers=H(ctx["contractor_token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("stawka_sprzedazy_godz", "bryg_widzi_stawki",
                  "termin_platnosci_klient_dni", "termin_platnosci_ekipa_dni", "vat_tryb"):
            assert k not in j, f"contractor should NOT see {k}"

    def test_admin_sees_financial_fields(self, ctx):
        r = requests.get(f"{API}/projects/{ctx['project_id']}", headers=H(ctx["admin_token"]))
        assert r.status_code == 200
        j = r.json()
        # at least one financial field present for admin
        assert "stawka_sprzedazy_godz" in j
