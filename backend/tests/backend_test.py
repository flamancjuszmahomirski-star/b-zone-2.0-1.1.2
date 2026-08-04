"""
B-ZONE 2.0 backend regression tests.
Covers: auth, users (approval), projects, hours engine, reports, issues,
deliveries, files, notifications, audit-log, role-enforcement, transcribe.
"""
import os
import io
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-builder-11766.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PASSWORD = "Admin12345!"

# Shared state between tests (module-scoped)
state = {
    "admin_token": None,
    "admin_id": None,
    "worker_email": f"test_worker_{uuid.uuid4().hex[:8]}@example.com",
    "worker_password": "Worker12345!",
    "worker_token": None,
    "worker_id": None,
    "project_id": None,
    "report_id": None,
    "issue_id": None,
    "delivery_id": None,
    "file_id": None,
    "hours_id": None,
}


def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- AUTH ----------------
class Test01Auth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "haslo": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["token_type"] == "bearer" and j["access_token"]
        assert j["user"]["rola"] == "admin"
        assert "hash" not in j["user"]
        state["admin_token"] = j["access_token"]
        state["admin_id"] = j["user"]["id"]

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "haslo": "wrong"})
        assert r.status_code == 401

    def test_me(self):
        r = requests.get(f"{API}/auth/me", headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert "hash" not in r.json()

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_pending(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": state["worker_email"], "haslo": state["worker_password"],
            "imie": "TESTW", "nazwisko": "Tester", "telefon": "+48000",
        })
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "oczekujacy"

    def test_login_pending_blocked(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": state["worker_email"], "haslo": state["worker_password"]})
        assert r.status_code == 403

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": state["worker_email"], "haslo": state["worker_password"],
            "imie": "X", "nazwisko": "Y",
        })
        assert r.status_code == 409

    def test_register_short_password(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": f"test_{uuid.uuid4().hex[:6]}@example.com", "haslo": "abc",
            "imie": "A", "nazwisko": "B",
        })
        assert r.status_code == 422

    def test_password_reset_flow(self):
        r = requests.post(f"{API}/auth/password-reset/request",
                          json={"email": ADMIN_EMAIL})
        assert r.status_code == 200
        tok = r.json().get("reset_token")
        assert tok
        # deliberately don't apply (would change admin pw). Test invalid confirm.
        r2 = requests.post(f"{API}/auth/password-reset/confirm",
                           json={"token": "bogus", "nowe_haslo": "newpass1"})
        assert r2.status_code == 400


# ---------------- USERS / APPROVAL ----------------
class Test02UsersApproval:
    def test_pending_list(self):
        r = requests.get(f"{API}/users/pending", headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        pend = r.json()
        found = next((u for u in pend if u["email"] == state["worker_email"]), None)
        assert found, "Pending worker not found"
        state["worker_id"] = found["id"]

    def test_pending_forbidden_no_auth(self):
        r = requests.get(f"{API}/users/pending")
        assert r.status_code == 401

    def test_approve_worker(self):
        r = requests.patch(
            f"{API}/users/{state['worker_id']}/approve",
            headers=auth_h(state["admin_token"]),
            json={"rola": "worker", "stawka_godz_eur": 15.5})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "aktywny" and j["rola"] == "worker"
        assert j["stawka_godz_eur"] == 15.5

    def test_worker_login_after_approval(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": state["worker_email"], "haslo": state["worker_password"]})
        assert r.status_code == 200, r.text
        state["worker_token"] = r.json()["access_token"]

    def test_role_enforcement_worker_cannot_admin(self):
        r = requests.get(f"{API}/users/pending", headers=auth_h(state["worker_token"]))
        assert r.status_code == 403


# ---------------- PROJECTS ----------------
class Test03Projects:
    def test_create_project(self):
        r = requests.post(f"{API}/projects", headers=auth_h(state["admin_token"]), json={
            "nazwa": f"TEST_Proj_{uuid.uuid4().hex[:6]}",
            "kod": "TP1", "klient_nazwa": "Klient X",
            "adres": "Berlin, Germany",
            "godz_od": "07:00", "godz_do": "15:00",
            "dni_tyg": [1, 2, 3, 4, 5],
        })
        assert r.status_code == 201, r.text
        state["project_id"] = r.json()["id"]

    def test_get_project(self):
        r = requests.get(f"{API}/projects/{state['project_id']}",
                         headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        assert "czlonkowie" in r.json()

    def test_list_projects(self):
        r = requests.get(f"{API}/projects", headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        assert any(p["id"] == state["project_id"] for p in r.json())

    def test_add_member(self):
        r = requests.post(f"{API}/projects/{state['project_id']}/members",
                          headers=auth_h(state["admin_token"]),
                          json={"user_id": state["worker_id"], "jest_glowny": False})
        assert r.status_code == 201, r.text

    def test_worker_cant_create_project(self):
        r = requests.post(f"{API}/projects", headers=auth_h(state["worker_token"]),
                          json={"nazwa": "Nope"})
        assert r.status_code == 403


# ---------------- WORK HOURS ----------------
class Test04WorkHours:
    def _weekday(self):
        # pick last Monday (working day) to ensure accrual triggers
        d = date.today()
        while d.isoweekday() > 5:
            d = d - timedelta(days=1)
        return d.isoformat()

    def test_hours_accrual(self):
        day = self._weekday()
        r = requests.get(f"{API}/projects/{state['project_id']}/hours",
                         headers=auth_h(state["admin_token"]),
                         params={"data": day})
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1, "Expected accrual entry for member"
        e = rows[0]
        assert e["user_id"] == state["worker_id"]
        assert e["liczba_godzin"] == 8.0
        state["hours_id"] = e["id"]

    def test_hours_me(self):
        r = requests.get(f"{API}/hours/me", headers=auth_h(state["worker_token"]))
        assert r.status_code == 200

    def test_approve_hours(self):
        r = requests.post(f"{API}/hours/{state['hours_id']}/approve",
                          headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        assert r.json()["status"] == "zatwierdzone"


# ---------------- REPORTS ----------------
class Test05Reports:
    def test_create_report_with_weather(self):
        r = requests.post(f"{API}/reports", headers=auth_h(state["worker_token"]), json={
            "project_id": state["project_id"], "opis": "Test raport dnia.",
            "zdjecia": [], "element_ids": [],
        })
        assert r.status_code == 201, r.text
        j = r.json()
        state["report_id"] = j["id"]
        # weather may be None if geocoding unreachable — accept both but log
        assert "pogoda_json" in j

    def test_get_report(self):
        r = requests.get(f"{API}/reports/{state['report_id']}",
                         headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        assert r.json()["autor"]

    def test_reject_requires_reason(self):
        r = requests.post(f"{API}/reports/{state['report_id']}/reject",
                          headers=auth_h(state["admin_token"]), json={"powod": ""})
        assert r.status_code == 422

    def test_approve_report(self):
        r = requests.post(f"{API}/reports/{state['report_id']}/approve",
                          headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        assert r.json()["status"] == "zatwierdzony"
        # verify persistence
        g = requests.get(f"{API}/reports/{state['report_id']}",
                        headers=auth_h(state["admin_token"]))
        assert g.json()["status"] == "zatwierdzony"


# ---------------- ISSUES ----------------
class Test06Issues:
    def test_create_issue(self):
        r = requests.post(f"{API}/issues", headers=auth_h(state["worker_token"]), json={
            "project_id": state["project_id"], "tytul": "TEST issue",
            "opis": "Problem", "priorytet": "wysoki",
        })
        assert r.status_code == 201, r.text
        state["issue_id"] = r.json()["id"]
        assert r.json()["status"] == "otwarte"

    def test_status_requires_reason(self):
        r = requests.patch(f"{API}/issues/{state['issue_id']}/status",
                           headers=auth_h(state["admin_token"]),
                           json={"status": "rozwiazane", "powod": ""})
        assert r.status_code == 422

    def test_status_change(self):
        r = requests.patch(f"{API}/issues/{state['issue_id']}/status",
                           headers=auth_h(state["admin_token"]),
                           json={"status": "rozwiazane", "powod": "Naprawione"})
        assert r.status_code == 200
        assert r.json()["status"] == "rozwiazane"
        assert len(r.json()["historia_statusow"]) >= 2


# ---------------- DELIVERIES ----------------
class Test07Deliveries:
    def test_create_delivery(self):
        r = requests.post(f"{API}/deliveries", headers=auth_h(state["worker_token"]),
                          json={"project_id": state["project_id"], "opis": "Materiały"})
        assert r.status_code == 201, r.text
        state["delivery_id"] = r.json()["id"]
        assert r.json()["status"] == "awizowana"

    def test_delivery_confirm(self):
        r = requests.patch(f"{API}/deliveries/{state['delivery_id']}/status",
                           headers=auth_h(state["admin_token"]),
                           json={"status": "potwierdzona"})
        assert r.status_code == 200


# ---------------- FILES ----------------
class Test08Files:
    def test_upload_and_download(self):
        files = {"file": ("hello.txt", b"hello world", "text/plain")}
        data = {"kind": "attachment"}
        r = requests.post(f"{API}/files", headers=auth_h(state["admin_token"]),
                          files=files, data=data)
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["id"] and j["url"].startswith("/api/files/")
        state["file_id"] = j["id"]
        # fetch content
        r2 = requests.get(f"{API}/files/{j['id']}/content",
                          headers=auth_h(state["admin_token"]))
        assert r2.status_code == 200
        assert r2.content == b"hello world"


# ---------------- NOTIFICATIONS ----------------
class Test09Notifications:
    def test_notifications_present(self):
        # worker got notifications on approval, report events
        r = requests.get(f"{API}/notifications", headers=auth_h(state["worker_token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_unread_count(self):
        r = requests.get(f"{API}/notifications/unread-count",
                         headers=auth_h(state["worker_token"]))
        assert r.status_code == 200
        assert "count" in r.json()

    def test_read_all(self):
        r = requests.post(f"{API}/notifications/read-all",
                         headers=auth_h(state["worker_token"]))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/notifications/unread-count",
                          headers=auth_h(state["worker_token"]))
        assert r2.json()["count"] == 0


# ---------------- AUDIT LOG ----------------
class Test10Audit:
    def test_audit_admin(self):
        r = requests.get(f"{API}/audit-log", headers=auth_h(state["admin_token"]))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_audit_forbidden_worker(self):
        r = requests.get(f"{API}/audit-log", headers=auth_h(state["worker_token"]))
        assert r.status_code == 403


# ---------------- TRANSCRIBE ----------------
class Test11Transcribe:
    def test_transcribe_requires_auth(self):
        r = requests.post(f"{API}/transcribe")
        assert r.status_code == 401


# ---------------- CLEANUP ----------------
class Test99Cleanup:
    def test_delete_worker(self):
        # delete report/issue/delivery/project/worker to keep DB clean
        if state.get("report_id"):
            requests.delete(f"{API}/reports/{state['report_id']}",
                            headers=auth_h(state["admin_token"]))
        if state.get("issue_id"):
            requests.delete(f"{API}/issues/{state['issue_id']}",
                            headers=auth_h(state["admin_token"]))
        if state.get("delivery_id"):
            requests.delete(f"{API}/deliveries/{state['delivery_id']}",
                            headers=auth_h(state["admin_token"]))
        if state.get("project_id"):
            requests.delete(f"{API}/projects/{state['project_id']}",
                            headers=auth_h(state["admin_token"]))
        if state.get("worker_id"):
            r = requests.delete(f"{API}/users/{state['worker_id']}",
                                headers=auth_h(state["admin_token"]))
            assert r.status_code == 200
