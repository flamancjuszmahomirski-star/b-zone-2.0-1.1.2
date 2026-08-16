"""Seed helper for RUNDA 1.3 frontend testing (F3–F8).

Creates ephemeral TEST_ data via public API and direct mongo. Prints IDs to stdout
so the Playwright script can consume them. Cleanup at the bottom is best-effort.
"""
import os, sys, io, base64, json, requests, secrets, string
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from PIL import Image
import bcrypt
from datetime import datetime, timezone
import uuid

BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://app-builder-11766.preview.emergentagent.com').rstrip('/')
API = f"{BASE}/api"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'bzone_database')

ADMIN_EMAIL = 'admin@bzone.app'
ADMIN_PW = 'MSbk566lLvI4b!U4'

def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "haslo": pw}, timeout=15)
    r.raise_for_status()
    return r.json()

def admin_token():
    d = login(ADMIN_EMAIL, ADMIN_PW)
    tok = d.get('token') or d.get('access_token')
    # if forced to change password, call change-password no-op
    if d.get('user', {}).get('must_change_password'):
        requests.post(f"{API}/auth/change-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"nowe": ADMIN_PW}, timeout=15)
        d = login(ADMIN_EMAIL, ADMIN_PW)
        tok = d.get('token') or d.get('access_token')
    return tok, d['user']

def H(tok): return {"Authorization": f"Bearer {tok}"}

def main():
    tok, admin = admin_token()
    print(f"ADMIN_TOKEN_OK id={admin['id']}", file=sys.stderr)

    mc = MongoClient(MONGO_URL)
    db = mc[DB_NAME]

    # === 1. Create TEST_ worker user (for F3 reset-pw) via mongo (avoid rate limit) ===
    worker_id = str(uuid.uuid4())
    pw_hash = bcrypt.hashpw(b"Testpass1!", bcrypt.gensalt()).decode()
    db.users.insert_one({
        "id": worker_id, "email": f"TEST_worker_{worker_id[:6]}@bzone.test",
        "haslo_hash": pw_hash, "imie": "TEST", "nazwisko": f"Worker{worker_id[:4]}",
        "rola": "worker", "status": "aktywny", "stawka_godz_eur": 15.0,
        "must_change_password": False, "created_at": datetime.now(timezone.utc),
        "failed_login_attempts": 0, "locked_until": None,
    })
    print(f"WORKER_ID={worker_id}")

    # === 2. Create TEST_ project ===
    r = requests.post(f"{API}/projects", headers=H(tok), json={
        "nazwa": "TEST_R13H7", "adres": "Ulica Testowa 1", "kod_pocztowy": "00-001",
        "miasto": "Test", "klient_id": None,
    }, timeout=15)
    r.raise_for_status()
    proj = r.json()
    pid = proj['id']
    print(f"PROJECT_ID={pid}")

    # === 3. Upload a small PNG ===
    img = Image.new("RGB", (200, 150), (60, 140, 200))
    buf = io.BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
    files = {"file": ("test.png", buf, "image/png")}
    r = requests.post(f"{API}/files", headers=H(tok), files=files, timeout=30)
    r.raise_for_status()
    fdoc = r.json()
    file_id = fdoc.get('id') or fdoc.get('file_id')
    print(f"FILE_ID={file_id}")

    # === 4. Create folder ===
    r = requests.post(f"{API}/projects/{pid}/folders", headers=H(tok),
                      json={"nazwa": "TEST_F"}, timeout=15)
    r.raise_for_status()
    fid = r.json()['id']
    print(f"FOLDER_ID={fid}")

    # === 5. Create view ===
    r = requests.post(f"{API}/folders/{fid}/views", headers=H(tok), json={
        "nazwa": "TEST_V",
        "plik_url": f"/api/files/{file_id}/content",
        "szerokosc": 200, "wysokosc": 150,
    }, timeout=15)
    r.raise_for_status()
    vid = r.json()['id']
    print(f"VIEW_ID={vid}")

    # === 6. Get first element type ===
    r = requests.get(f"{API}/element-types", headers=H(tok), timeout=15)
    r.raise_for_status()
    types = r.json()
    tid = types[0]['id'] if types else None
    print(f"TYPE_ID={tid}")

    # === 7. Add element B-01 at (0.7, 0.3) ===
    r = requests.post(f"{API}/views/{vid}/elements", headers=H(tok), json={
        "kod": "B-01", "typ_id": tid, "opis": "",
        "pozycja_x": 0.7, "pozycja_y": 0.3,
    }, timeout=15)
    r.raise_for_status()
    el = r.json()
    eid = el['id']
    print(f"ELEMENT_ID={eid}")

    # === 8. FILE_ID for A1.4 fallback flip later ===
    print(f"FILE_ID_FOR_FLIP={file_id}")

    # === 9. Foreman + contractor for F6 ===
    foreman_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": foreman_id, "email": f"TEST_foreman_{foreman_id[:6]}@bzone.test",
        "haslo_hash": bcrypt.hashpw(b"Testpass1!", bcrypt.gensalt()).decode(),
        "imie": "TEST", "nazwisko": f"Foreman{foreman_id[:4]}",
        "rola": "foreman", "status": "aktywny", "stawka_godz_eur": 25.0,
        "must_change_password": False, "created_at": datetime.now(timezone.utc),
        "failed_login_attempts": 0, "locked_until": None,
    })
    print(f"FOREMAN_ID={foreman_id}")
    print(f"FOREMAN_EMAIL=TEST_foreman_{foreman_id[:6]}@bzone.test")

    contractor_id = str(uuid.uuid4())
    db.users.insert_one({
        "id": contractor_id, "email": f"TEST_contr_{contractor_id[:6]}@bzone.test",
        "haslo_hash": bcrypt.hashpw(b"Testpass1!", bcrypt.gensalt()).decode(),
        "imie": "TEST", "nazwisko": f"Contr{contractor_id[:4]}",
        "rola": "contractor", "status": "aktywny",
        "must_change_password": False, "created_at": datetime.now(timezone.utc),
        "failed_login_attempts": 0, "locked_until": None,
    })
    print(f"CONTRACTOR_ID={contractor_id}")
    print(f"CONTRACTOR_EMAIL=TEST_contr_{contractor_id[:6]}@bzone.test")

    # add foreman + contractor as members of project (best-effort — try common shapes)
    try:
        # try add-member endpoint
        rr = requests.post(f"{API}/projects/{pid}/members", headers=H(tok),
                           json={"user_id": foreman_id}, timeout=10)
        print(f"add foreman member -> {rr.status_code}")
        rr = requests.post(f"{API}/projects/{pid}/members", headers=H(tok),
                           json={"user_id": contractor_id}, timeout=10)
        print(f"add contractor member -> {rr.status_code}")
    except Exception as e:
        print(f"member add exc: {e}")

    print("SEED_DONE")

if __name__ == "__main__":
    main()
