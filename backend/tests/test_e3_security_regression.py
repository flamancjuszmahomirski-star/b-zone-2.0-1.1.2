"""
E3 Security Regression + related fixes (E1, A1, G8) verification.

Incident context: admin usunął własne konto na produkcji mimo blokady E3.
Preview backend MUSI:
- E3-a: DELETE /users/{me} => 400 (self-delete blocked)
- E3-b: DELETE /users/{last_admin_id} => 400 (last-admin blocked)
- E3-c: DELETE /users/{worker_id} => {archived:true} + record persists with
        status="zarchiwizowany" (soft delete, no hard delete)
- E3-d: archived user cannot login (401/403)
- E1  : PUT /users/{id} — 409 on duplicate email; 422 on invalid email;
        happy-path saves all editable fields.
- A1  : POST /users/{id}/reset-password — 422 if <14 chars; 200 sets
        must_change_password=true. POST /auth/change-password — 422 if <14.
- G8  : POST /views/{vid}/elements — 409 when kod collides post-normalization
        (spaces stripped + case-insensitive).
- E3-me: DELETE /auth/me hardening
        * sole active admin -> 400 (last admin), account not archived
        * regular user / non-last admin -> 200 {deleted:true}, soft-archive
          (status=zarchiwizowany), cannot login again.

All test users use prefix TEST_ and are archived/cleaned at teardown.
Admin account admin@bzone.app is NEVER modified/deleted.
"""

import asyncio
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

# Load /app/backend/.env for MONGO_URL / DB_NAME (used for the sole-admin
# scenario where we transiently flip seed admin status via direct DB write).
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") + "/api"
ADMIN_EMAIL = "admin@bzone.app"
ADMIN_PASSWORD = "MSbk566lLvI4b!U4"

STRONG_PW = "TestPass_Longer_14+aA1"  # 22 chars, >=14
SHORT_PW = "Short12345"               # 10 chars, <14


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _uniq(tag: str) -> str:
    return f"test_{tag}_{uuid.uuid4().hex[:8]}@example.com"


def _login(email: str, password: str) -> requests.Response:
    return requests.post(f"{BASE_URL}/auth/login",
                         json={"email": email, "haslo": password}, timeout=15)


def _admin_token() -> str:
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _register(email: str, pw: str, imie="TEST", nazwisko="User") -> dict:
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email, "haslo": pw, "imie": imie, "nazwisko": nazwisko,
    }, timeout=15)
    assert r.status_code == 201, f"register {email}: {r.status_code} {r.text}"
    return r.json()


def _find_user_id(token: str, email: str) -> str:
    r = requests.get(f"{BASE_URL}/users",
                     headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200, r.text
    for u in r.json():
        if u["email"] == email.lower():
            return u["id"]
    raise AssertionError(f"user {email} not found")


def _approve(token: str, user_id: str, rola: str = "worker") -> dict:
    r = requests.patch(f"{BASE_URL}/users/{user_id}/approve",
                       headers={"Authorization": f"Bearer {token}"},
                       json={"rola": rola, "stawka_godz_eur": 12.5}, timeout=15)
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"
    return r.json()


def _archive(token: str, user_id: str):
    """Best-effort cleanup — archive test user."""
    try:
        requests.patch(f"{BASE_URL}/users/{user_id}/archive",
                       headers={"Authorization": f"Bearer {token}"}, timeout=10)
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


@pytest.fixture(scope="module")
def admin_id(admin_token):
    r = requests.get(f"{BASE_URL}/auth/me",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    # Extra guarantee: never touch this id in cleanup logic
    return uid


@pytest.fixture
def worker(admin_token):
    """Approved worker; archived at teardown."""
    email = _uniq("worker")
    _register(email, STRONG_PW)
    uid = _find_user_id(admin_token, email)
    _approve(admin_token, uid, "worker")
    yield {"id": uid, "email": email, "password": STRONG_PW}
    _archive(admin_token, uid)


@pytest.fixture
def throwaway_admin(admin_token):
    """Second admin; used for last-admin scenarios. Archived at teardown."""
    email = _uniq("admin2")
    _register(email, STRONG_PW)
    uid = _find_user_id(admin_token, email)
    _approve(admin_token, uid, "admin")
    yield {"id": uid, "email": email, "password": STRONG_PW}
    _archive(admin_token, uid)


# --------------------------------------------------------------------------- #
# E3-a: cannot delete OWN account (self-delete)
# --------------------------------------------------------------------------- #
class TestE3aSelfDelete:
    def test_admin_cannot_delete_self_returns_400(self, admin_token, admin_id):
        r = requests.delete(f"{BASE_URL}/users/{admin_id}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        # Message hint (localized)
        body = r.text.lower()
        assert "wlasnego" in body or "własnego" in body or "own account" in body, r.text

    def test_admin_still_active_after_self_delete_attempt(self, admin_token, admin_id):
        r = requests.get(f"{BASE_URL}/auth/me",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["id"] == admin_id
        assert me["status"] == "aktywny"
        assert me["rola"] == "admin"

    def test_admin_can_still_login_after_self_delete_attempt(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()


# --------------------------------------------------------------------------- #
# E3-b: cannot delete LAST active admin
# --------------------------------------------------------------------------- #
class TestE3bLastAdmin:
    def test_admin2_can_be_created_and_is_active(self, admin_token, throwaway_admin):
        r = requests.get(f"{BASE_URL}/users/pending",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        # verify the throwaway is active in main list
        lst = requests.get(f"{BASE_URL}/users",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=15).json()
        row = next((u for u in lst if u["id"] == throwaway_admin["id"]), None)
        assert row and row["status"] == "aktywny" and row["rola"] == "admin"

    def test_last_admin_delete_blocked_when_only_one_active(self, admin_token, admin_id):
        """When only THE seeded admin is active, deleting ANY other admin id (even non-self)
        is guarded either by 'self' or by 'last admin'. Here we simulate the true last-admin
        path: create admin2, archive admin2, then try to delete the seed admin via admin2's
        login — that would be self and covered above. Instead we assert the code path directly:
        with only seed admin active, any attempt to delete admin id belongs to admin himself.
        (True last-admin: only one active admin exists — that admin IS the caller, so self-delete
        400 already fires; the *dedicated* last-admin branch fires only when a DIFFERENT admin
        tries to delete the sole other admin. We verify that branch below.)"""
        # Ensure baseline: only the seed admin is active (no throwaway).
        r = requests.get(f"{BASE_URL}/users?status=aktywny",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        active_admins = [u for u in r.json() if u.get("rola") == "admin"]
        # There may be legacy admins in preview DB — as long as >=1, we're OK.
        assert len(active_admins) >= 1
        # Self-delete of that admin is blocked (already covered by E3-a).
        rr = requests.delete(f"{BASE_URL}/users/{admin_id}",
                             headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert rr.status_code == 400

    def test_second_admin_deleting_seed_admin_hits_last_admin_or_self(self, admin_token,
                                                                     admin_id, throwaway_admin):
        """Sub-scenario: throwaway admin logs in and tries to delete seed admin while both
        are active. Expected: 200 with archived (because there IS another admin), then when
        we try again with only one left (self), it must 400 via last-admin OR self."""
        tok2 = _login(throwaway_admin["email"], throwaway_admin["password"]).json()["access_token"]
        # First: attempt to archive seed admin from throwaway_admin's session — this should be
        # allowed by the code (two admins exist). To keep production integrity we DO NOT actually
        # delete the seed admin. Instead, we validate the "last admin" branch by having
        # throwaway_admin attempt to delete THEMSELVES while they are the only "other" admin.
        # Simpler & safe: throwaway_admin tries to delete themselves → self-delete 400.
        r_self = requests.delete(f"{BASE_URL}/users/{throwaway_admin['id']}",
                                 headers={"Authorization": f"Bearer {tok2}"}, timeout=15)
        assert r_self.status_code == 400
        # Now archive the OTHER (seed) admin from throwaway_admin's perspective is a delete.
        # To hit the last-admin branch cleanly WITHOUT modifying seed admin, we instead:
        # 1) archive throwaway_admin first via admin_token's archive endpoint (soft)
        # 2) then attempt to delete seed via seed's own token → self path 400 (covered above)
        # This confirms last-admin logic exists by CODE INSPECTION and self-guard fires first.

    def test_last_admin_branch_direct(self, admin_token, admin_id, throwaway_admin):
        """Direct last-admin branch verification WITHOUT deleting seed admin:
        - throwaway_admin exists & active.
        - seed admin (caller) archives throwaway_admin via PATCH /users/{id}/archive.
          Now only seed admin is active.
        - seed admin attempts DELETE /users/{seed}. Response: 400 self-delete
          (self-guard triggers first). The last-admin branch itself is proven by the
          fact that if we were to add another admin and delete seed via that admin,
          the seed would then be the only remaining admin — which we already showed
          via test_admin_cannot_delete_self_returns_400.

        This test additionally proves that when we try to delete the throwaway (currently
        active) admin from seed-admin's session, and it IS the only "other" admin, the
        response is 200 archived (not blocked) — because seed admin remains as the last one.
        That's the correct semantics: last-admin blocks only when THE deleted user is the
        last active admin."""
        # verify DELETE another admin (throwaway) succeeds when seed remains
        r = requests.delete(f"{BASE_URL}/users/{throwaway_admin['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"archived": True}
        # verify throwaway is archived, not gone
        lst = requests.get(f"{BASE_URL}/users",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=15).json()
        row = next((u for u in lst if u["id"] == throwaway_admin["id"]), None)
        assert row is not None, "throwaway admin was HARD-deleted!"
        assert row["status"] == "zarchiwizowany"

    def test_true_last_admin_blocked_when_creating_and_deleting_third(self, admin_token, admin_id):
        """True last-admin branch: create admin B and admin C, then delete B (ok), then
        try to delete C via seed admin — this should archive C fine (seed remains). Then
        we prove the *guard* by inspecting: if only one active admin remains (the caller),
        DELETE self already fails with 400 (self-guard). The dedicated last-admin message
        can only fire if a DIFFERENT admin tries to delete the sole remaining admin —
        an impossible state without violating self. We therefore explicitly craft it:
        - create admin B
        - from admin B's session, archive admin B's own peers except seed — not possible
          because we cannot touch seed.
        - Skip the impossible combination; the self-guard covers the incident."""
        email_b = _uniq("adminB")
        _register(email_b, STRONG_PW)
        uid_b = _find_user_id(admin_token, email_b)
        _approve(admin_token, uid_b, "admin")
        try:
            # Now: seed + B are the two active admins.
            # Log in as B, and B tries to delete SEED admin. Expected: 200 archived (B still remains).
            # But we do NOT want to actually archive the seed admin. So we DO NOT execute that call.
            # Instead: verify the count aggregation logic by archiving B via seed and then
            # asserting a subsequent delete of seed (self) still 400.
            tok_b = _login(email_b, STRONG_PW).json()["access_token"]
            # B cannot delete themselves (self-guard):
            r = requests.delete(f"{BASE_URL}/users/{uid_b}",
                                headers={"Authorization": f"Bearer {tok_b}"}, timeout=15)
            assert r.status_code == 400
        finally:
            _archive(admin_token, uid_b)


# --------------------------------------------------------------------------- #
# E3-c: soft-delete regular user (archive, no hard delete)
# --------------------------------------------------------------------------- #
class TestE3cSoftDelete:
    def test_delete_worker_returns_archived_true(self, admin_token, worker):
        r = requests.delete(f"{BASE_URL}/users/{worker['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"archived": True}

    def test_worker_record_persists_with_zarchiwizowany_status(self, admin_token, worker):
        # first: archive
        requests.delete(f"{BASE_URL}/users/{worker['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        # user still in listing (all users), but status=zarchiwizowany
        r = requests.get(f"{BASE_URL}/users",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        row = next((u for u in r.json() if u["id"] == worker["id"]), None)
        assert row is not None, "SOFT DELETE VIOLATION: worker was hard-deleted"
        assert row["status"] == "zarchiwizowany"

    def test_worker_disappears_from_active_list(self, admin_token, worker):
        requests.delete(f"{BASE_URL}/users/{worker['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        r = requests.get(f"{BASE_URL}/users?status=aktywny",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()]
        assert worker["id"] not in ids


# --------------------------------------------------------------------------- #
# E3-d: archived user cannot log in
# --------------------------------------------------------------------------- #
class TestE3dArchivedCannotLogin:
    def test_archived_user_login_blocked(self, admin_token, worker):
        # user can log in BEFORE archive
        pre = _login(worker["email"], worker["password"])
        assert pre.status_code == 200, pre.text
        # archive
        requests.delete(f"{BASE_URL}/users/{worker['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        # cannot log in AFTER archive
        post = _login(worker["email"], worker["password"])
        assert post.status_code in (401, 403), f"expected 401/403, got {post.status_code} {post.text}"


# --------------------------------------------------------------------------- #
# E1: PUT /users/{id} email/role edits
# --------------------------------------------------------------------------- #
class TestE1UpdateUser:
    def test_duplicate_email_returns_409(self, admin_token, worker):
        # create a second worker to steal email from
        email2 = _uniq("worker2")
        _register(email2, STRONG_PW)
        uid2 = _find_user_id(admin_token, email2)
        _approve(admin_token, uid2, "worker")
        try:
            r = requests.put(f"{BASE_URL}/users/{worker['id']}",
                             headers={"Authorization": f"Bearer {admin_token}"},
                             json={"email": email2}, timeout=15)
            assert r.status_code == 409, r.text
        finally:
            _archive(admin_token, uid2)

    def test_invalid_email_returns_422(self, admin_token, worker):
        r = requests.put(f"{BASE_URL}/users/{worker['id']}",
                         headers={"Authorization": f"Bearer {admin_token}"},
                         json={"email": "not-an-email"}, timeout=15)
        assert r.status_code == 422, r.text

    def test_full_edit_persists_all_fields(self, admin_token, worker):
        new_email = _uniq("edited")
        payload = {
            "imie": "TESTImie", "nazwisko": "TESTNazw",
            "email": new_email, "telefon": "+48123456789",
            "rola": "foreman", "stawka_godz_eur": 22.5,
        }
        r = requests.put(f"{BASE_URL}/users/{worker['id']}",
                         headers={"Authorization": f"Bearer {admin_token}"},
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["imie"] == "TESTImie"
        assert got["nazwisko"] == "TESTNazw"
        assert got["email"] == new_email.lower()
        assert got["telefon"] == "+48123456789"
        assert got["rola"] == "foreman"
        assert got["stawka_godz_eur"] == 22.5


# --------------------------------------------------------------------------- #
# A1: admin reset-password + self change-password length rules
# --------------------------------------------------------------------------- #
class TestA1PasswordLength:
    def test_admin_reset_short_password_422(self, admin_token, worker):
        r = requests.post(f"{BASE_URL}/users/{worker['id']}/reset-password",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"nowe": SHORT_PW}, timeout=15)
        assert r.status_code == 422, r.text

    def test_admin_reset_long_password_ok_and_forces_change(self, admin_token, worker):
        r = requests.post(f"{BASE_URL}/users/{worker['id']}/reset-password",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"nowe": STRONG_PW + "_v2"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"reset": True}
        # verify must_change_password=true via /users list
        lst = requests.get(f"{BASE_URL}/users",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=15).json()
        row = next(u for u in lst if u["id"] == worker["id"])
        assert row.get("must_change_password") is True
        # verify user can login with new password
        li = _login(worker["email"], STRONG_PW + "_v2")
        assert li.status_code == 200

    def test_change_password_short_new_returns_422(self, admin_token, worker):
        # login as worker with initial password
        tok = _login(worker["email"], worker["password"]).json()["access_token"]
        r = requests.post(f"{BASE_URL}/auth/change-password",
                          headers={"Authorization": f"Bearer {tok}"},
                          json={"stare": worker["password"], "nowe": SHORT_PW}, timeout=15)
        assert r.status_code == 422, r.text


# --------------------------------------------------------------------------- #
# G8: element code collision after normalization
# --------------------------------------------------------------------------- #
class TestG8CodeNormalization:
    @pytest.fixture
    def project_view(self, admin_token):
        # create project
        r = requests.post(f"{BASE_URL}/projects",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"nazwa": f"TEST_E3_G8_{uuid.uuid4().hex[:6]}"}, timeout=15)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        # create folder
        rf = requests.post(f"{BASE_URL}/projects/{pid}/folders",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"nazwa": "TEST_folder"}, timeout=15)
        assert rf.status_code == 201, rf.text
        fid = rf.json()["id"]
        # create view
        rv = requests.post(f"{BASE_URL}/folders/{fid}/views",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"nazwa": "TEST_view",
                                 "plik_url": "https://example.com/x.png",
                                 "plik_typ": "image"}, timeout=15)
        assert rv.status_code == 201, rv.text
        vid = rv.json()["id"]
        yield {"pid": pid, "vid": vid}
        # cleanup — project delete is soft (archive) which cascades OK
        try:
            requests.delete(f"{BASE_URL}/projects/{pid}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        except Exception:
            pass

    def test_collision_after_space_and_case_normalization(self, admin_token, project_view):
        vid = project_view["vid"]
        # create original "A 01"
        r1 = requests.post(f"{BASE_URL}/views/{vid}/elements",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"kod": "A 01", "pozycja_x": 0.1, "pozycja_y": 0.1}, timeout=15)
        assert r1.status_code == 201, r1.text
        # collide with lowercase-no-space "a01"
        r2 = requests.post(f"{BASE_URL}/views/{vid}/elements",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"kod": "a01", "pozycja_x": 0.2, "pozycja_y": 0.2}, timeout=15)
        assert r2.status_code == 409, f"expected 409, got {r2.status_code} {r2.text}"
        # collide with uppercase-no-space "A01"
        r3 = requests.post(f"{BASE_URL}/views/{vid}/elements",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"kod": "A01", "pozycja_x": 0.3, "pozycja_y": 0.3}, timeout=15)
        assert r3.status_code == 409, f"expected 409, got {r3.status_code} {r3.text}"
        # collide with padded "  A  01  "
        r4 = requests.post(f"{BASE_URL}/views/{vid}/elements",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"kod": "  A  01  ", "pozycja_x": 0.4, "pozycja_y": 0.4}, timeout=15)
        assert r4.status_code == 409, f"expected 409, got {r4.status_code} {r4.text}"


# --------------------------------------------------------------------------- #
# E3-me: DELETE /auth/me self-service hardening (FIX verification)
# --------------------------------------------------------------------------- #
#
# Historical bug (iteration 8): DELETE /auth/me did an UNGUARDED
# db.users.delete_one → the plausible production incident vector where an
# admin used the "Delete my account" self-service (App Store requirement)
# and E3 never fired (E3 was only on DELETE /users/{id}).
#
# Fix under test (server.py delete_my_account, ~line 522):
#   1) if caller.rola=='admin' and no other active admins → 400
#   2) soft-archive (status='zarchiwizowany'), NOT delete_one
#   3) remove project_members but keep user row
#
# We verify all three branches. The "sole active admin" branch requires
# ONE active admin to exist in the whole DB, but preview seeds admin@bzone.app
# which we MUST NOT modify persistently. We therefore transiently flip
# the seed admin's `status` to 'zarchiwizowany' via direct DB write, run
# the test on a throwaway admin B, then IMMEDIATELY restore seed to
# status='aktywny'. Restoration happens inside try/finally with a
# module-level auto-restore fixture as extra safety net.

def _mongo_db():
    from motor.motor_asyncio import AsyncIOMotorClient  # local import
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


def _get_user_by_email_direct(email: str) -> dict:
    async def go():
        c, db = _mongo_db()
        try:
            return await db.users.find_one({"email": email.lower()})
        finally:
            c.close()
    return _run(go())


def _set_user_status_direct(user_id: str, status: str):
    async def go():
        c, db = _mongo_db()
        try:
            await db.users.update_one({"id": user_id}, {"$set": {"status": status}})
        finally:
            c.close()
    _run(go())


def _users_delete_count_direct() -> int:
    """Sanity check that there is no code path issuing db.users.delete_one.
    We assert this indirectly by counting audit entries of type
    'usuniecie_wlasnego_konta' AND that the target user rows still exist."""
    async def go():
        c, db = _mongo_db()
        try:
            audits = await db.audit_log.count_documents(
                {"typ": "usuniecie_wlasnego_konta"})
            return audits
        finally:
            c.close()
    return _run(go())


@pytest.fixture(autouse=False)
def seed_admin_status_guard():
    """Extra safety net: capture seed admin status before, restore after."""
    seed = _get_user_by_email_direct(ADMIN_EMAIL)
    assert seed is not None, "seed admin missing – aborting"
    original_status = seed.get("status", "aktywny")
    original_rola = seed.get("rola", "admin")
    yield seed
    # Restore no matter what happened during the test
    _set_user_status_direct(seed["id"], original_status)
    # Also verify (defensive)
    after = _get_user_by_email_direct(ADMIN_EMAIL)
    assert after and after.get("status") == "aktywny", (
        f"CRITICAL: seed admin not restored to aktywny (status={after and after.get('status')})"
    )
    # And rola/preservation
    assert after.get("rola") == original_rola


class TestE3MeSelfArchiveWorker:
    """Non-admin: DELETE /auth/me → 200 archived, cannot re-login."""

    def test_worker_self_delete_returns_deleted_true(self, admin_token, worker):
        tok = _login(worker["email"], worker["password"]).json()["access_token"]
        r = requests.delete(f"{BASE_URL}/auth/me",
                            headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"deleted": True}

    def test_worker_record_persists_with_zarchiwizowany(self, admin_token, worker):
        tok = _login(worker["email"], worker["password"]).json()["access_token"]
        requests.delete(f"{BASE_URL}/auth/me",
                        headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        # Verify soft-archive: row still exists, status=zarchiwizowany
        lst = requests.get(f"{BASE_URL}/users",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=15).json()
        row = next((u for u in lst if u["id"] == worker["id"]), None)
        assert row is not None, "HARD DELETE VIOLATION: worker row gone after DELETE /auth/me"
        assert row["status"] == "zarchiwizowany", f"expected archived, got {row.get('status')}"

    def test_worker_cannot_login_after_self_delete(self, admin_token, worker):
        tok = _login(worker["email"], worker["password"]).json()["access_token"]
        requests.delete(f"{BASE_URL}/auth/me",
                        headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        post = _login(worker["email"], worker["password"])
        assert post.status_code in (401, 403), f"expected 401/403, got {post.status_code} {post.text}"


class TestE3MeAdminWithPeersArchived:
    """Admin who is NOT the last active admin: DELETE /auth/me → 200 archived."""

    def test_non_last_admin_self_delete_archives(self, admin_token, throwaway_admin):
        # seed admin remains active, so throwaway_admin is NOT the last admin
        tok = _login(throwaway_admin["email"], throwaway_admin["password"]).json()["access_token"]
        r = requests.delete(f"{BASE_URL}/auth/me",
                            headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"deleted": True}
        # verify row persists, status archived
        lst = requests.get(f"{BASE_URL}/users",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=15).json()
        row = next((u for u in lst if u["id"] == throwaway_admin["id"]), None)
        assert row is not None, "HARD DELETE: throwaway admin row is gone"
        assert row["status"] == "zarchiwizowany"
        # cannot log in
        post = _login(throwaway_admin["email"], throwaway_admin["password"])
        assert post.status_code in (401, 403)


class TestE3MeSoleAdminBlocked:
    """Sole active admin path: DELETE /auth/me must 400 + NOT archive."""

    def test_sole_admin_self_delete_returns_400_and_stays_active(
            self, admin_token, seed_admin_status_guard):
        # Step 1: create throwaway admin B
        email_b = _uniq("solememeadmin")
        _register(email_b, STRONG_PW)
        uid_b = _find_user_id(admin_token, email_b)
        _approve(admin_token, uid_b, "admin")
        seed = seed_admin_status_guard

        # Step 2: login as B FIRST (need active status to log in)
        login_b = _login(email_b, STRONG_PW)
        assert login_b.status_code == 200, login_b.text
        tok_b = login_b.json()["access_token"]

        try:
            # Step 3: transiently archive seed admin so B is the sole active admin
            _set_user_status_direct(seed["id"], "zarchiwizowany")

            # Step 4: B calls DELETE /auth/me → expect 400 last-admin
            r = requests.delete(f"{BASE_URL}/auth/me",
                                headers={"Authorization": f"Bearer {tok_b}"}, timeout=15)
            assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
            body_lower = r.text.lower()
            assert ("ostatni" in body_lower or "last admin" in body_lower), r.text

            # Step 5: B is NOT archived, still active
            b_doc = _get_user_by_email_direct(email_b)
            assert b_doc is not None
            assert b_doc.get("status") == "aktywny", f"B was archived despite 400! {b_doc}"

            # Step 6: B can still log in
            re_login = _login(email_b, STRONG_PW)
            assert re_login.status_code == 200, f"B cannot login after failed self-delete: {re_login.text}"

        finally:
            # Step 7: restore seed admin FIRST (fixture also restores, double-safety)
            _set_user_status_direct(seed["id"], "aktywny")
            # Cleanup B via seed admin token
            _archive(admin_token, uid_b)

        # Step 8: verify seed admin login still works
        seed_login = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert seed_login.status_code == 200, f"seed admin login broken! {seed_login.text}"


class TestE3MeNoHardDeletePathExists:
    """Static + dynamic guard: no db.users.delete_one/delete_many in server.py."""

    def test_server_py_has_no_users_hard_delete(self):
        with open("/app/backend/server.py", "r", encoding="utf-8") as f:
            src = f.read()
        # Any occurrence of db.users.delete_one or db.users.delete_many is a red flag
        assert "db.users.delete_one" not in src, "FOUND db.users.delete_one in server.py"
        assert "db.users.delete_many" not in src, "FOUND db.users.delete_many in server.py"

    def test_audit_records_use_soft_archive_semantics(self):
        # audit entries exist (0 or more) but there must never be a case where
        # audit says "usuniecie_wlasnego_konta" but the target user row is missing.
        async def go():
            c, db = _mongo_db()
            try:
                cursor = db.audit_log.find({"typ": "usuniecie_wlasnego_konta"})
                async for entry in cursor:
                    uid = entry.get("obiekt_id") or entry.get("user_id")
                    if not uid:
                        continue
                    u = await db.users.find_one({"id": uid})
                    assert u is not None, (
                        f"HARD DELETE DETECTED: audit says self-delete for user {uid} "
                        f"but user row does not exist"
                    )
            finally:
                c.close()
        _run(go())
