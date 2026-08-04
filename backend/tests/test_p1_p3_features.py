"""
B-ZONE 2.0 — P1..P3 feature regression tests.
Focus:
 - P1 notification action_url values for each event type
 - P2 delivery.autor in GET /api/deliveries/{id}
 - P3 POST /api/hours/{id}/unapprove + GET /api/projects/{id}/hours/week-summary
"""
import os
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PASSWORD = "Admin12345!"


def h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctx():
    """Create admin + a worker, project with worker as member, and hours accrual."""
    s = {}
    # admin login
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "haslo": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s["admin_token"] = r.json()["access_token"]
    s["admin_id"] = r.json()["user"]["id"]

    # register + approve worker
    email = f"test_p_{uuid.uuid4().hex[:8]}@example.com"
    pw = "Worker12345!"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "haslo": pw, "imie": "TESTP", "nazwisko": "Worker"})
    assert r.status_code == 201, r.text
    pend = requests.get(f"{API}/users/pending", headers=h(s["admin_token"])).json()
    worker_id = next(u["id"] for u in pend if u["email"] == email)
    r = requests.patch(f"{API}/users/{worker_id}/approve",
                       headers=h(s["admin_token"]),
                       json={"rola": "worker", "stawka_godz_eur": 12.0})
    assert r.status_code == 200
    s["worker_id"] = worker_id
    s["worker_email"] = email
    r = requests.post(f"{API}/auth/login", json={"email": email, "haslo": pw})
    s["worker_token"] = r.json()["access_token"]

    # project + member
    r = requests.post(f"{API}/projects", headers=h(s["admin_token"]), json={
        "nazwa": f"TEST_P_{uuid.uuid4().hex[:6]}", "kod": "PZ",
        "klient_nazwa": "K", "adres": "Berlin, Germany",
        "godz_od": "07:00", "godz_do": "15:00",
        "dni_tyg": [1, 2, 3, 4, 5]})
    assert r.status_code == 201, r.text
    s["project_id"] = r.json()["id"]
    r = requests.post(f"{API}/projects/{s['project_id']}/members",
                      headers=h(s["admin_token"]),
                      json={"user_id": worker_id, "jest_glowny": False})
    assert r.status_code == 201, r.text

    # accrue hours for last working day
    d = date.today()
    while d.isoweekday() > 5:
        d -= timedelta(days=1)
    s["work_day"] = d.isoformat()
    r = requests.get(f"{API}/projects/{s['project_id']}/hours",
                     headers=h(s["admin_token"]),
                     params={"data": s["work_day"]})
    assert r.status_code == 200
    rows = r.json()
    assert rows, "expected accrual"
    s["hours_id"] = rows[0]["id"]

    yield s

    # cleanup
    for path in [f"/projects/{s.get('project_id')}",
                 f"/users/{s.get('worker_id')}"]:
        try:
            requests.delete(f"{API}{path}", headers=h(s["admin_token"]))
        except Exception:
            pass


# ------------------ P1 : action_url on notifications ------------------
class TestP1NotificationActionUrl:
    def test_notifications_returned_with_action_url_field(self, ctx):
        r = requests.get(f"{API}/notifications", headers=h(ctx["worker_token"]))
        assert r.status_code == 200
        rows = r.json()
        assert rows, "worker should have notifications from approval"
        # every notification must have the action_url key (may be None for legacy)
        for n in rows:
            assert "action_url" in n

    def test_konto_zatwierdzone_action_url(self, ctx):
        # from approve step
        r = requests.get(f"{API}/notifications", headers=h(ctx["worker_token"]))
        rows = r.json()
        approvals = [n for n in rows if n["typ"] == "konto_zatwierdzone"]
        assert approvals, "expected konto_zatwierdzone notification"
        # action_url points to tabs root
        assert approvals[0]["action_url"] == "/(tabs)"

    def test_new_report_action_url_points_to_report(self, ctx):
        # worker creates report -> admin gets notification with /report/{id}
        r = requests.post(f"{API}/reports", headers=h(ctx["worker_token"]), json={
            "project_id": ctx["project_id"], "opis": "Test P1 report",
            "zdjecia": [], "element_ids": []})
        assert r.status_code == 201, r.text
        report_id = r.json()["id"]
        ctx["report_id"] = report_id
        r = requests.get(f"{API}/notifications", headers=h(ctx["admin_token"]))
        assert r.status_code == 200
        rows = r.json()
        matching = [n for n in rows if n.get("action_url") == f"/report/{report_id}"]
        assert matching, "expected notification with action_url=/report/{id}"

    def test_new_issue_action_url(self, ctx):
        r = requests.post(f"{API}/issues", headers=h(ctx["worker_token"]), json={
            "project_id": ctx["project_id"], "tytul": "TEST P1 issue",
            "opis": "x", "priorytet": "sredni"})
        assert r.status_code == 201
        issue_id = r.json()["id"]
        ctx["issue_id"] = issue_id
        r = requests.get(f"{API}/notifications", headers=h(ctx["admin_token"]))
        matching = [n for n in r.json() if n.get("action_url") == f"/issue/{issue_id}"]
        assert matching, "expected notification with action_url=/issue/{id}"

    def test_new_delivery_action_url(self, ctx):
        r = requests.post(f"{API}/deliveries", headers=h(ctx["worker_token"]),
                          json={"project_id": ctx["project_id"], "opis": "P1 delivery"})
        assert r.status_code == 201
        did = r.json()["id"]
        ctx["delivery_id"] = did
        r = requests.get(f"{API}/notifications", headers=h(ctx["admin_token"]))
        matching = [n for n in r.json() if n.get("action_url") == f"/delivery/{did}"]
        assert matching, "expected notification with action_url=/delivery/{id}"

    def test_new_account_notification_to_admin_points_to_users(self, ctx):
        # register a new pending user, admin should get action_url=/users
        email = f"test_p_pending_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "haslo": "pending12345", "imie": "P", "nazwisko": "Q"})
        assert r.status_code == 201
        r = requests.get(f"{API}/notifications", headers=h(ctx["admin_token"]))
        matching = [n for n in r.json() if n.get("action_url") == "/users" and n["typ"] == "nowe_konto"]
        assert matching, "expected admin notification action_url=/users for new account"
        # cleanup
        pend = requests.get(f"{API}/users/pending", headers=h(ctx["admin_token"])).json()
        uid = next((u["id"] for u in pend if u["email"] == email), None)
        if uid:
            requests.delete(f"{API}/users/{uid}", headers=h(ctx["admin_token"]))

    def test_hours_approved_action_url_points_to_hours_tab(self, ctx):
        # approve worker hours
        r = requests.post(f"{API}/hours/{ctx['hours_id']}/approve",
                          headers=h(ctx["admin_token"]))
        assert r.status_code == 200
        r = requests.get(f"{API}/notifications", headers=h(ctx["worker_token"]))
        matching = [n for n in r.json() if n.get("action_url") == "/(tabs)/hours"
                    and n["typ"] == "godziny_zatwierdzone"]
        assert matching, "expected hours-approved notification action_url=/(tabs)/hours"

    def test_mark_notification_read(self, ctx):
        r = requests.get(f"{API}/notifications", headers=h(ctx["worker_token"]))
        assert r.status_code == 200
        rows = r.json()
        assert rows
        nid = rows[0]["id"]
        # PATCH read
        r2 = requests.patch(f"{API}/notifications/{nid}/read",
                            headers=h(ctx["worker_token"]))
        assert r2.status_code in (200, 204), r2.text


# ------------------ P2 : delivery author in detail ------------------
class TestP2DeliveryDetail:
    def test_get_delivery_returns_autor(self, ctx):
        # Create our own delivery here (test may run on different xdist worker)
        r = requests.post(f"{API}/deliveries", headers=h(ctx["worker_token"]),
                          json={"project_id": ctx["project_id"], "opis": "P2 detail delivery"})
        assert r.status_code == 201, r.text
        did = r.json()["id"]
        r = requests.get(f"{API}/deliveries/{did}", headers=h(ctx["admin_token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert "autor" in j and j["autor"], "GET /api/deliveries/{id} must include autor"
        assert "TESTP" in j["autor"] or "Worker" in j["autor"]
        # cleanup
        requests.delete(f"{API}/deliveries/{did}", headers=h(ctx["admin_token"]))

    def test_get_deleted_delivery_returns_404(self, ctx):
        r = requests.get(f"{API}/deliveries/does-not-exist-123",
                         headers=h(ctx["admin_token"]))
        assert r.status_code == 404

    def test_get_deleted_report_returns_404(self, ctx):
        r = requests.get(f"{API}/reports/does-not-exist-123",
                         headers=h(ctx["admin_token"]))
        assert r.status_code == 404

    def test_get_deleted_issue_returns_404(self, ctx):
        r = requests.get(f"{API}/issues/does-not-exist-123",
                         headers=h(ctx["admin_token"]))
        assert r.status_code == 404


# ------------------ P3 : hours unapprove + week-summary ------------------
class TestP3HoursApproval:
    def test_week_summary_shape(self, ctx):
        # ensure the hours entry is approved on this worker (P1 may have run elsewhere)
        requests.post(f"{API}/hours/{ctx['hours_id']}/approve", headers=h(ctx["admin_token"]))
        # find Monday of current week from work_day
        d = date.fromisoformat(ctx["work_day"])
        # Monday = 1
        monday = d - timedelta(days=d.isoweekday() - 1)
        r = requests.get(f"{API}/projects/{ctx['project_id']}/hours/week-summary",
                         headers=h(ctx["admin_token"]),
                         params={"tydzien_od": monday.isoformat()})
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) == 7
        for row in rows:
            for k in ("data", "total", "approved", "pending", "state"):
                assert k in row, f"missing {k}"
            assert row["state"] in ("none", "partial", "all")
        # work day should be 'all' because we approved the only entry
        target = next(r for r in rows if r["data"] == ctx["work_day"])
        assert target["approved"] >= 1
        assert target["state"] in ("all", "partial")  # tolerate other members if any

    def test_week_summary_requires_role(self, ctx):
        d = date.fromisoformat(ctx["work_day"])
        monday = d - timedelta(days=d.isoweekday() - 1)
        r = requests.get(f"{API}/projects/{ctx['project_id']}/hours/week-summary",
                         headers=h(ctx["worker_token"]),
                         params={"tydzien_od": monday.isoformat()})
        assert r.status_code == 403

    def test_unapprove_hours(self, ctx):
        r = requests.post(f"{API}/hours/{ctx['hours_id']}/unapprove",
                          headers=h(ctx["admin_token"]))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "naliczone"
        assert j.get("zatwierdzil_id") in (None, "")

    def test_unapprove_writes_audit(self, ctx):
        r = requests.get(f"{API}/audit-log", headers=h(ctx["admin_token"]))
        assert r.status_code == 200
        events = [a for a in r.json() if a.get("akcja") == "cofniecie_zatwierdzenia_godzin"]
        assert events, "expected cofniecie_zatwierdzenia_godzin audit entry"

    def test_unapprove_missing_returns_404(self, ctx):
        r = requests.post(f"{API}/hours/does-not-exist/unapprove",
                          headers=h(ctx["admin_token"]))
        assert r.status_code == 404

    def test_unapprove_forbidden_for_worker(self, ctx):
        r = requests.post(f"{API}/hours/{ctx['hours_id']}/unapprove",
                          headers=h(ctx["worker_token"]))
        assert r.status_code == 403

    def test_week_summary_after_unapprove_shows_pending(self, ctx):
        d = date.fromisoformat(ctx["work_day"])
        monday = d - timedelta(days=d.isoweekday() - 1)
        r = requests.get(f"{API}/projects/{ctx['project_id']}/hours/week-summary",
                         headers=h(ctx["admin_token"]),
                         params={"tydzien_od": monday.isoformat()})
        rows = r.json()
        target = next(r for r in rows if r["data"] == ctx["work_day"])
        assert target["pending"] >= 1
        assert target["state"] in ("partial", "none")  # none only if total==0
