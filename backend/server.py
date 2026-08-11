"""
B-ZONE 2.0 — Backend REST API (Etap 1)
Single source of truth for the construction/facade work management app.

Conventions:
- All ids are string uuids stored in the "id" field; Mongo "_id" is never exposed.
- Every document carries a company_id (multitenancy-ready, constant in this install).
- One action = one endpoint (assistant-ready naming), all prefixed with /api.
"""

import os
import uuid
import asyncio
import logging
import tempfile
import mimetypes
from pathlib import Path
from datetime import datetime, timezone, timedelta, date

import jwt
import httpx
import bcrypt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]  # required; injected from deployment secrets
COMPANY_ID = os.environ.get("COMPANY_ID", "bzone-default")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
PUSH_BASE_URL = "https://integrations.emergentagent.com"
ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "")

# Uploads dir: use a writable/persistent path in production if provided, else local.
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", str(ROOT_DIR / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ROLES = ("admin", "foreman", "subcontractor", "worker", "contractor")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="B-ZONE 2.0 API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bzone")

push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc = dict(doc)
        doc.pop("_id", None)
    return doc


# Commercially sensitive project fields never exposed to the client (contractor).
_FIN_PROJECT_FIELDS = ("stawka_sprzedazy_godz", "bryg_widzi_stawki",
                       "termin_platnosci_klient_dni", "termin_platnosci_ekipa_dni", "vat_tryb")


def strip_project_financials(p: dict, role: str) -> dict:
    if role == "contractor":
        for f in _FIN_PROJECT_FIELDS:
            p.pop(f, None)
    return p


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def audit(user_id: str, action: str, obj_type: str, obj_id: str,
                before=None, after=None):
    await db.audit_log.insert_one({
        "id": new_id(), "company_id": COMPANY_ID, "user_id": user_id,
        "akcja": action, "obiekt_typ": obj_type, "obiekt_id": obj_id,
        "wartosc_przed": before, "wartosc_po": after, "created_at": now_iso(),
    })


async def notify(user_id: str, typ: str, tresc: str, obj_ref: str = None,
                 push: bool = True, title: str = "B-ZONE", action_url: str = None):
    await db.notifications.insert_one({
        "id": new_id(), "company_id": COMPANY_ID, "user_id": user_id,
        "typ": typ, "tresc": tresc, "obiekt_ref": obj_ref, "action_url": action_url,
        "przeczytane": False, "created_at": now_iso(),
    })
    if push:
        try:
            await send_push([user_id], {
                "title": title, "message": tresc,
                **({"action_url": action_url} if action_url else {}),
            })
        except Exception as e:
            logger.warning(f"push failed (non-blocking): {e}")


async def send_push(recipients: List[str], data: dict, idempotency_key: str = None):
    if not recipients:
        return
    payload = {"recipients": recipients[:100], "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
async def current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Brak tokenu / Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        uid = payload["sub"]
    except Exception:
        raise HTTPException(401, "Nieprawidłowy token / Invalid token")
    user = await db.users.find_one({"id": uid})
    if not user or user.get("status") != "aktywny":
        raise HTTPException(401, "Konto nieaktywne / Account inactive")
    return clean(user)


def require(*roles):
    async def dep(user: dict = Depends(current_user)):
        if user.get("rola") not in roles:
            raise HTTPException(403, "Brak uprawnień / Insufficient role")
        return user
    return dep


# ---------------------------------------------------------------------------
# Models (request bodies)
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    haslo: str
    imie: str
    nazwisko: str
    telefon: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    haslo: str


class ApproveUserIn(BaseModel):
    rola: str
    stawka_godz_eur: float = 0.0


class UpdateUserIn(BaseModel):
    imie: Optional[str] = None
    nazwisko: Optional[str] = None
    telefon: Optional[str] = None
    rola: Optional[str] = None
    stawka_godz_eur: Optional[float] = None
    avatar_url: Optional[str] = None
    jezyk: Optional[str] = None


class ProfileIn(BaseModel):
    imie: Optional[str] = None
    nazwisko: Optional[str] = None
    telefon: Optional[str] = None
    avatar_url: Optional[str] = None
    jezyk: Optional[str] = None


class ResetRequestIn(BaseModel):
    email: EmailStr


class ResetConfirmIn(BaseModel):
    token: str
    nowe_haslo: str


class ProjectIn(BaseModel):
    nazwa: str
    kod: Optional[str] = ""
    klient_nazwa: Optional[str] = ""
    kontrahent_user_id: Optional[str] = None
    adres: Optional[str] = ""
    waluta: str = "EUR"
    data_start: Optional[str] = None
    termin: Optional[str] = None
    godz_od: str = "07:00"
    godz_do: str = "15:00"
    dni_tyg: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    soboty_auto: bool = False
    soboty_godziny: float = 0
    termin_platnosci_klient_dni: int = 30
    termin_platnosci_ekipa_dni: int = 21
    vat_tryb: str = "stawka"
    logo_url: Optional[str] = None
    tryb_rozliczenia: str = "godzinowy"  # akordowy | godzinowy | mieszany
    stawka_sprzedazy_godz: Optional[float] = None
    bryg_widzi_stawki: bool = False


class MemberIn(BaseModel):
    user_id: str
    jest_glowny: bool = False


class ExtraHoursIn(BaseModel):
    project_id: str
    data: str
    liczba_godzin: float
    przyczyna_id: Optional[str] = None
    element_id: Optional[str] = None
    opis: Optional[str] = ""


class HoursCorrectionIn(BaseModel):
    liczba_godzin: Optional[float] = None
    godz_od: Optional[str] = None
    godz_do: Optional[str] = None
    status: Optional[str] = None
    zrodlo: Optional[str] = None


class AddDayIn(BaseModel):
    user_id: str
    data: str
    liczba_godzin: float
    zrodlo: str = "weekend_reczny"


class DelayReasonIn(BaseModel):
    nazwa_pl: str
    nazwa_en: str
    aktywna: bool = True


class ReportIn(BaseModel):
    project_id: str
    data: Optional[str] = None
    opis: str
    zdjecia: List[dict] = Field(default_factory=list)  # [{file_id,url,timestamp,gps}]
    voice_url: Optional[str] = None
    transkrypcja: Optional[str] = ""
    element_ids: List[str] = Field(default_factory=list)
    extra_godziny: Optional[dict] = None  # {liczba, przyczyna_id, opis}


class RejectIn(BaseModel):
    powod: str


class IssueIn(BaseModel):
    project_id: str
    tytul: str
    opis: str
    zdjecia: List[dict] = Field(default_factory=list)
    priorytet: str = "sredni"
    voice_url: Optional[str] = None


class IssueStatusIn(BaseModel):
    status: str
    powod: Optional[str] = ""


class DeliveryIn(BaseModel):
    project_id: str
    opis: str
    transkrypcja: Optional[str] = ""
    data_planowana: Optional[str] = None
    zalacznik_url: Optional[str] = None
    zalacznik_nazwa: Optional[str] = None


class DeliveryStatusIn(BaseModel):
    status: str


class RegisterPushIn(BaseModel):
    user_id: str
    platform: str
    device_token: str


# ---------------------------------------------------------------------------
# Weather (Open-Meteo, free, no key)
# ---------------------------------------------------------------------------
async def fetch_weather(address: str) -> Optional[dict]:
    if not address:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            geo = await c.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": address, "count": 1, "language": "pl"},
            )
            gj = geo.json()
            if not gj.get("results"):
                # try only first token (city) as fallback
                first = address.split(",")[-1].strip() or address.split()[0]
                geo = await c.get(
                    "https://geocoding-api.open-meteo.com/v1/search",
                    params={"name": first, "count": 1},
                )
                gj = geo.json()
                if not gj.get("results"):
                    return None
            loc = gj["results"][0]
            wx = await c.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": loc["latitude"], "longitude": loc["longitude"],
                    "current": "temperature_2m,wind_speed_10m,precipitation",
                    "wind_speed_unit": "ms",
                },
            )
            cur = wx.json().get("current", {})
            return {
                "temp": cur.get("temperature_2m"),
                "wiatr": cur.get("wind_speed_10m"),
                "opady": cur.get("precipitation"),
                "miejsce": loc.get("name"),
                "czas": cur.get("time"),
            }
    except Exception as e:
        logger.warning(f"weather fetch failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Work-hours accrual engine
# ---------------------------------------------------------------------------
def hours_between(godz_od: str, godz_do: str) -> float:
    try:
        h1, m1 = map(int, godz_od.split(":"))
        h2, m2 = map(int, godz_do.split(":"))
        return round(((h2 * 60 + m2) - (h1 * 60 + m1)) / 60.0, 2)
    except Exception:
        return 8.0


async def ensure_accrual(project: dict, day: str):
    """Create automatic daily work_hours entries for a project on `day`
    when all engine conditions hold. Etap 1: leaves/rotations empty."""
    try:
        d = date.fromisoformat(day)
    except Exception:
        return
    iso_weekday = d.isoweekday()  # Mon=1 .. Sun=7
    is_saturday = iso_weekday == 6
    working_day = iso_weekday in (project.get("dni_tyg") or [])
    if is_saturday and project.get("soboty_auto"):
        working_day = True
        default_hours = float(project.get("soboty_godziny") or 0) or hours_between(
            project.get("godz_od", "07:00"), project.get("godz_do", "15:00"))
    else:
        default_hours = hours_between(
            project.get("godz_od", "07:00"), project.get("godz_do", "15:00"))
    if not working_day:
        return

    members = await db.project_members.find(
        {"project_id": project["id"], "company_id": COMPANY_ID}).to_list(1000)
    for m in members:
        uid = m["user_id"]
        # (c) no approved leave
        leave = await db.leaves.find_one(
            {"user_id": uid, "status": "zatwierdzony", "od": {"$lte": day}, "do": {"$gte": day}})
        if leave:
            continue
        # (d) rotation working day (no record = always works) — Etap 1 empty
        existing = await db.work_hours.find_one(
            {"user_id": uid, "project_id": project["id"], "data": day, "company_id": COMPANY_ID})
        if existing:
            continue
        await db.work_hours.insert_one({
            "id": new_id(), "company_id": COMPANY_ID, "user_id": uid,
            "project_id": project["id"], "data": day,
            "godz_od": project.get("godz_od", "07:00"),
            "godz_do": project.get("godz_do", "15:00"),
            "liczba_godzin": default_hours,
            "zrodlo": "weekend_reczny" if is_saturday else "auto",
            "status": "naliczone", "zatwierdzil_id": None,
            "ujete_w_rozliczeniu_id": None, "created_at": now_iso(),
        })


# ===========================================================================
# AUTH
# ===========================================================================
@api.post("/auth/register", status_code=201)
async def register(body: RegisterIn):
    if len(body.haslo) < 6:
        raise HTTPException(422, "Hasło min. 6 znaków / Password min 6 chars")
    exists = await db.users.find_one({"email": body.email.lower()})
    if exists:
        raise HTTPException(409, "E-mail zajęty / Email already registered")
    doc = {
        "id": new_id(), "company_id": COMPANY_ID, "email": body.email.lower(),
        "hash": hash_pw(body.haslo), "imie": body.imie.strip(),
        "nazwisko": body.nazwisko.strip(), "rola": None, "avatar_url": None,
        "telefon": body.telefon or "", "status": "oczekujacy",
        "stawka_godz_eur": 0.0, "jezyk": "pl", "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    # notify all admins
    admins = await db.users.find({"rola": "admin", "status": "aktywny"}).to_list(100)
    for a in admins:
        await notify(a["id"], "nowe_konto",
                     f"Nowe konto do zatwierdzenia: {body.imie} {body.nazwisko}",
                     obj_ref=doc["id"], action_url="/users")
    return {"status": "oczekujacy", "message": "Konto oczekuje na zatwierdzenie przez administratora."}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_pw(body.haslo, user.get("hash", "")):
        raise HTTPException(401, "Błędny e-mail lub hasło / Invalid credentials")
    if user.get("status") == "oczekujacy":
        raise HTTPException(403, "Konto oczekuje na zatwierdzenie / Pending approval")
    if user.get("status") != "aktywny" or not user.get("rola"):
        raise HTTPException(403, "Konto nieaktywne / Account not active")
    return {"access_token": make_token(user["id"]), "token_type": "bearer",
            "user": clean(user) and {k: v for k, v in clean(user).items() if k != "hash"}}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    user.pop("hash", None)
    return user


class ChangePasswordIn(BaseModel):
    stare: Optional[str] = None
    nowe: str


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(current_user)):
    if len(body.nowe) < 8:
        raise HTTPException(422, "Hasło musi mieć min. 8 znaków / Password min 8 chars")
    # If the account is not in a forced-change state, verify the current password.
    if not user.get("must_change_password"):
        if not body.stare or not verify_pw(body.stare, user.get("hash", "")):
            raise HTTPException(401, "Błędne obecne hasło / Wrong current password")
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "hash": hash_pw(body.nowe), "must_change_password": False}})
    await audit(user["id"], "zmiana_hasla", "user", user["id"])
    return {"changed": True}


@api.put("/auth/me")
async def update_me(body: ProfileIn, user: dict = Depends(current_user)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    doc = clean(await db.users.find_one({"id": user["id"]}))
    doc.pop("hash", None)
    return doc


@api.delete("/auth/me")
async def delete_my_account(user: dict = Depends(current_user)):
    """Self-service account deletion (App Store / Play Store requirement)."""
    await db.users.delete_one({"id": user["id"]})
    await db.project_members.delete_many({"user_id": user["id"]})
    await audit(user["id"], "usuniecie_wlasnego_konta", "user", user["id"])
    return {"deleted": True}


@api.post("/auth/password-reset/request")
async def reset_request(body: ResetRequestIn):
    user = await db.users.find_one({"email": body.email.lower()})
    token = new_id()
    if user:
        await db.password_resets.insert_one({
            "id": new_id(), "user_id": user["id"], "token": token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
            "used": False,
        })
    # In production email the token. For MVP we return it so the flow is testable.
    return {"message": "Jeśli konto istnieje, wysłano instrukcje.", "reset_token": token if user else None}


@api.post("/auth/password-reset/confirm")
async def reset_confirm(body: ResetConfirmIn):
    if len(body.nowe_haslo) < 6:
        raise HTTPException(422, "Hasło min. 6 znaków")
    rec = await db.password_resets.find_one({"token": body.token, "used": False})
    if not rec or rec["expires_at"] < now_iso():
        raise HTTPException(400, "Token nieprawidłowy lub wygasł / Invalid or expired")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"hash": hash_pw(body.nowe_haslo)}})
    await db.password_resets.update_one({"id": rec["id"]}, {"$set": {"used": True}})
    return {"message": "Hasło zmienione / Password reset"}


# ===========================================================================
# USERS (admin)
# ===========================================================================
@api.get("/users")
async def list_users(status: Optional[str] = None, admin: dict = Depends(require("admin"))):
    q = {"company_id": COMPANY_ID}
    if status:
        q["status"] = status
    users = await db.users.find(q).sort("created_at", -1).to_list(1000)
    out = []
    for u in users:
        u = clean(u)
        u.pop("hash", None)
        out.append(u)
    return out


@api.get("/users/pending")
async def pending_users(admin: dict = Depends(require("admin"))):
    users = await db.users.find({"status": "oczekujacy", "company_id": COMPANY_ID}).to_list(1000)
    out = []
    for u in users:
        u = clean(u); u.pop("hash", None); out.append(u)
    return out


@api.patch("/users/{user_id}/approve")
async def approve_user(user_id: str, body: ApproveUserIn, admin: dict = Depends(require("admin"))):
    if body.rola not in ROLES:
        raise HTTPException(400, "Nieprawidłowa rola / Invalid role")
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "Nie znaleziono")
    await db.users.update_one({"id": user_id}, {"$set": {
        "status": "aktywny", "rola": body.rola, "stawka_godz_eur": body.stawka_godz_eur}})
    await audit(admin["id"], "zatwierdzenie_konta", "user", user_id,
                {"status": u.get("status")}, {"status": "aktywny", "rola": body.rola})
    await notify(user_id, "konto_zatwierdzone", "Twoje konto zostało zatwierdzone.", action_url="/(tabs)")
    doc = clean(await db.users.find_one({"id": user_id})); doc.pop("hash", None)
    return doc


@api.patch("/users/{user_id}/reject")
async def reject_user(user_id: str, admin: dict = Depends(require("admin"))):
    await db.users.update_one({"id": user_id}, {"$set": {"status": "odrzucony"}})
    await audit(admin["id"], "odrzucenie_konta", "user", user_id)
    return {"status": "odrzucony"}


@api.put("/users/{user_id}")
async def update_user(user_id: str, body: UpdateUserIn, admin: dict = Depends(require("admin"))):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "Nie znaleziono")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "rola" in upd and upd["rola"] not in ROLES:
        raise HTTPException(400, "Nieprawidłowa rola")
    await db.users.update_one({"id": user_id}, {"$set": upd})
    await audit(admin["id"], "edycja_uzytkownika", "user", user_id,
                {"rola": u.get("rola"), "stawka": u.get("stawka_godz_eur")}, upd)
    doc = clean(await db.users.find_one({"id": user_id})); doc.pop("hash", None)
    return doc


@api.patch("/users/{user_id}/archive")
async def archive_user(user_id: str, admin: dict = Depends(require("admin"))):
    await db.users.update_one({"id": user_id}, {"$set": {"status": "zarchiwizowany"}})
    await audit(admin["id"], "archiwizacja_uzytkownika", "user", user_id)
    return {"status": "zarchiwizowany"}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require("admin"))):
    await db.users.delete_one({"id": user_id})
    await db.project_members.delete_many({"user_id": user_id})
    await audit(admin["id"], "usuniecie_uzytkownika", "user", user_id)
    return {"deleted": True}


# ===========================================================================
# PROJECTS
# ===========================================================================
async def user_project_ids(user: dict) -> List[str]:
    rows = await db.project_members.find({"user_id": user["id"]}).to_list(1000)
    ids = [r["project_id"] for r in rows]
    # contractor: projects where they are the client
    if user.get("rola") == "contractor":
        cp = await db.projects.find({"kontrahent_user_id": user["id"]}).to_list(1000)
        ids += [p["id"] for p in cp]
    return list(set(ids))


@api.get("/projects")
async def list_projects(status: str = "aktywny", user: dict = Depends(current_user)):
    q = {"company_id": COMPANY_ID, "status": status}
    if user["rola"] not in ("admin",):
        ids = await user_project_ids(user)
        q["id"] = {"$in": ids}
    projects = await db.projects.find(q).sort("created_at", -1).to_list(1000)
    project_ids = [p["id"] for p in projects]
    # Single grouped aggregation for member counts (avoids per-project N+1).
    counts: dict = {}
    if project_ids:
        agg = await db.project_members.aggregate([
            {"$match": {"project_id": {"$in": project_ids}}},
            {"$group": {"_id": "$project_id", "n": {"$sum": 1}}},
        ]).to_list(len(project_ids))
        counts = {row["_id"]: row["n"] for row in agg}
    out = []
    for p in projects:
        p = clean(p)
        p["liczba_czlonkow"] = counts.get(p["id"], 0)
        out.append(strip_project_financials(p, user["rola"]))
    return out


@api.post("/projects", status_code=201)
async def create_project(body: ProjectIn, admin: dict = Depends(require("admin"))):
    doc = body.model_dump()
    doc.update({"id": new_id(), "company_id": COMPANY_ID, "status": "aktywny",
                "created_at": now_iso()})
    await db.projects.insert_one(doc)
    await audit(admin["id"], "utworzenie_projektu", "project", doc["id"], None, {"nazwa": body.nazwa})
    return clean(doc)


@api.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(current_user)):
    p = await db.projects.find_one({"id": project_id})
    if not p:
        raise HTTPException(404, "Nie znaleziono projektu")
    p = clean(p)
    members = await db.project_members.find({"project_id": project_id}).to_list(1000)
    mout = []
    for m in members:
        u = await db.users.find_one({"id": m["user_id"]})
        if u:
            mout.append({"user_id": u["id"], "imie": u["imie"], "nazwisko": u["nazwisko"],
                         "rola": u["rola"], "avatar_url": u.get("avatar_url"),
                         "jest_glowny": m.get("jest_glowny", False)})
    p["czlonkowie"] = mout
    # progress: received elements / all elements (Etap 2A)
    total_el = await db.elements.count_documents({"project_id": project_id, "status": {"$ne": "zarchiwizowany"}})
    recv_el = await db.elements.count_documents({"project_id": project_id, "status": "odebrany"})
    folders_n = await db.folders.count_documents({"project_id": project_id, "status": "aktywny"})
    p["modele_summary"] = {"foldery": folders_n, "elementy": total_el, "odebrane": recv_el,
                            "procent": round(recv_el / total_el * 100) if total_el else 0}
    return strip_project_financials(p, user["rola"])


@api.put("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectIn, admin: dict = Depends(require("admin"))):
    old = await db.projects.find_one({"id": project_id})
    if not old:
        raise HTTPException(404, "Nie znaleziono")
    await db.projects.update_one({"id": project_id}, {"$set": body.model_dump()})
    await audit(admin["id"], "edycja_projektu", "project", project_id,
                {"nazwa": old.get("nazwa"), "tryb_rozliczenia": old.get("tryb_rozliczenia"),
                 "stawka_sprzedazy_godz": old.get("stawka_sprzedazy_godz")},
                {"nazwa": body.nazwa, "tryb_rozliczenia": body.tryb_rozliczenia,
                 "stawka_sprzedazy_godz": body.stawka_sprzedazy_godz})
    return clean(await db.projects.find_one({"id": project_id}))


@api.patch("/projects/{project_id}/archive")
async def archive_project(project_id: str, admin: dict = Depends(require("admin"))):
    await db.projects.update_one({"id": project_id}, {"$set": {"status": "zarchiwizowany"}})
    await audit(admin["id"], "archiwizacja_projektu", "project", project_id)
    return {"status": "zarchiwizowany"}


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, admin: dict = Depends(require("admin"))):
    await db.projects.update_one({"id": project_id}, {"$set": {"status": "zarchiwizowany"}})
    await audit(admin["id"], "usuniecie_projektu", "project", project_id)
    return {"archived": True, "message": "Projekt zarchiwizowany (ochrona danych finansowych/dowodowych)."}


@api.post("/projects/{project_id}/members", status_code=201)
async def add_member(project_id: str, body: MemberIn, admin: dict = Depends(require("admin"))):
    existing = await db.project_members.find_one({"project_id": project_id, "user_id": body.user_id})
    if existing:
        await db.project_members.update_one(
            {"id": existing["id"]}, {"$set": {"jest_glowny": body.jest_glowny}})
        return clean(await db.project_members.find_one({"id": existing["id"]}))
    doc = {"id": new_id(), "company_id": COMPANY_ID, "project_id": project_id,
           "user_id": body.user_id, "jest_glowny": body.jest_glowny, "od_daty": now_iso()}
    await db.project_members.insert_one(doc)
    await audit(admin["id"], "przypisanie_do_projektu", "project_member", doc["id"],
                None, {"user_id": body.user_id, "project_id": project_id})
    return clean(doc)


@api.delete("/projects/{project_id}/members/{user_id}")
async def remove_member(project_id: str, user_id: str, admin: dict = Depends(require("admin"))):
    await db.project_members.delete_one({"project_id": project_id, "user_id": user_id})
    await audit(admin["id"], "usuniecie_przypisania", "project_member", f"{project_id}:{user_id}")
    return {"removed": True}


# ===========================================================================
# WORK HOURS
# ===========================================================================
@api.get("/projects/{project_id}/hours")
async def project_hours(project_id: str, data: Optional[str] = None,
                        user: dict = Depends(require("admin", "foreman"))):
    day = data or datetime.now(timezone.utc).date().isoformat()
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(404, "Nie znaleziono projektu")
    await ensure_accrual(clean(project), day)
    rows = await db.work_hours.find({"project_id": project_id, "data": day}).to_list(1000)
    out = []
    for r in rows:
        r = clean(r)
        u = await db.users.find_one({"id": r["user_id"]})
        r["imie"] = u["imie"] if u else "?"
        r["nazwisko"] = u["nazwisko"] if u else ""
        r["avatar_url"] = u.get("avatar_url") if u else None
        out.append(r)
    return out


@api.get("/projects/{project_id}/hours/pending")
async def pending_hours(project_id: str, user: dict = Depends(require("admin", "foreman"))):
    rows = await db.work_hours.find(
        {"project_id": project_id, "status": "naliczone"}).to_list(1000)
    return [clean(r) for r in rows]


@api.get("/hours/me")
async def my_hours(month: Optional[str] = None, user: dict = Depends(current_user)):
    q = {"user_id": user["id"]}
    if month:  # YYYY-MM
        q["data"] = {"$regex": f"^{month}"}
    rows = await db.work_hours.find(q).sort("data", -1).to_list(1000)
    out = []
    for r in rows:
        r = clean(r)
        p = await db.projects.find_one({"id": r["project_id"]})
        r["project_nazwa"] = p["nazwa"] if p else "?"
        out.append(r)
    return out


@api.put("/hours/{hours_id}")
async def correct_hours(hours_id: str, body: HoursCorrectionIn,
                        user: dict = Depends(require("admin", "foreman"))):
    old = await db.work_hours.find_one({"id": hours_id})
    if not old:
        raise HTTPException(404, "Nie znaleziono")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "godz_od" in upd or "godz_do" in upd:
        upd.setdefault("liczba_godzin", hours_between(
            upd.get("godz_od", old["godz_od"]), upd.get("godz_do", old["godz_do"])))
        upd["zrodlo"] = "korekta"
    await db.work_hours.update_one({"id": hours_id}, {"$set": upd})
    await audit(user["id"], "korekta_godzin", "work_hours", hours_id,
                {"liczba_godzin": old.get("liczba_godzin")}, upd)
    return clean(await db.work_hours.find_one({"id": hours_id}))


@api.post("/projects/{project_id}/hours/add-day", status_code=201)
async def add_day(project_id: str, body: AddDayIn, user: dict = Depends(require("admin", "foreman"))):
    doc = {"id": new_id(), "company_id": COMPANY_ID, "user_id": body.user_id,
           "project_id": project_id, "data": body.data, "godz_od": "", "godz_do": "",
           "liczba_godzin": body.liczba_godzin, "zrodlo": body.zrodlo,
           "status": "naliczone", "zatwierdzil_id": None,
           "ujete_w_rozliczeniu_id": None, "created_at": now_iso()}
    await db.work_hours.insert_one(doc)
    await audit(user["id"], "dodanie_dnia", "work_hours", doc["id"], None, doc)
    return clean(doc)


@api.post("/hours/{hours_id}/approve")
async def approve_hours(hours_id: str, user: dict = Depends(require("admin", "foreman"))):
    h = await db.work_hours.find_one({"id": hours_id})
    if not h:
        raise HTTPException(404, "Nie znaleziono")
    await db.work_hours.update_one({"id": hours_id},
                                   {"$set": {"status": "zatwierdzone", "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "zatwierdzenie_godzin", "work_hours", hours_id,
                {"status": h["status"]}, {"status": "zatwierdzone"})
    await notify(h["user_id"], "godziny_zatwierdzone",
                 f"Godziny z dnia {h['data']} zatwierdzone.", action_url="/(tabs)/hours")
    return clean(await db.work_hours.find_one({"id": hours_id}))


@api.post("/hours/{hours_id}/reject")
async def reject_hours(hours_id: str, user: dict = Depends(require("admin", "foreman"))):
    h = await db.work_hours.find_one({"id": hours_id})
    if not h:
        raise HTTPException(404, "Nie znaleziono")
    await db.work_hours.update_one({"id": hours_id},
                                   {"$set": {"status": "odrzucone", "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "odrzucenie_godzin", "work_hours", hours_id)
    await notify(h["user_id"], "godziny_odrzucone", f"Godziny z dnia {h['data']} odrzucone.", action_url="/(tabs)/hours")
    return {"status": "odrzucone"}


@api.post("/hours/{hours_id}/unapprove")
async def unapprove_hours(hours_id: str, user: dict = Depends(require("admin", "foreman"))):
    h = await db.work_hours.find_one({"id": hours_id})
    if not h:
        raise HTTPException(404, "Nie znaleziono")
    await db.work_hours.update_one({"id": hours_id},
                                   {"$set": {"status": "naliczone", "zatwierdzil_id": None}})
    await audit(user["id"], "cofniecie_zatwierdzenia_godzin", "work_hours", hours_id,
                {"status": h["status"]}, {"status": "naliczone"})
    return clean(await db.work_hours.find_one({"id": hours_id}))


@api.post("/projects/{project_id}/hours/approve-day")
async def approve_day(project_id: str, data: str = Query(...),
                      user: dict = Depends(require("admin", "foreman"))):
    res = await db.work_hours.update_many(
        {"project_id": project_id, "data": data, "status": "naliczone"},
        {"$set": {"status": "zatwierdzone", "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "zatwierdzenie_dnia", "project", project_id, None, {"data": data})
    return {"zatwierdzono": res.modified_count}


@api.post("/projects/{project_id}/hours/approve-week")
async def approve_week(project_id: str, tydzien_od: str = Query(...),
                       user: dict = Depends(require("admin", "foreman"))):
    start = date.fromisoformat(tydzien_od)
    days = [(start + timedelta(days=i)).isoformat() for i in range(7)]
    res = await db.work_hours.update_many(
        {"project_id": project_id, "data": {"$in": days}, "status": "naliczone"},
        {"$set": {"status": "zatwierdzone", "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "zatwierdzenie_tygodnia", "project", project_id, None, {"od": tydzien_od})
    return {"zatwierdzono": res.modified_count}


@api.get("/projects/{project_id}/hours/week-summary")
async def week_summary(project_id: str, tydzien_od: str = Query(...),
                       user: dict = Depends(require("admin", "foreman"))):
    """Per-day approval status for the week strip: none/partial/all + counts."""
    start = date.fromisoformat(tydzien_od)
    out = []
    for i in range(7):
        day = (start + timedelta(days=i)).isoformat()
        rows = await db.work_hours.find({"project_id": project_id, "data": day}).to_list(1000)
        total = len(rows)
        approved = len([r for r in rows if r["status"] == "zatwierdzone"])
        pending = len([r for r in rows if r["status"] == "naliczone"])
        state = "none" if total == 0 else ("all" if pending == 0 else "partial")
        out.append({"data": day, "total": total, "approved": approved, "pending": pending, "state": state})
    return out


# ===========================================================================
# EXTRA HOURS
# ===========================================================================
@api.post("/extra-hours", status_code=201)
async def create_extra(body: ExtraHoursIn, user: dict = Depends(current_user)):
    doc = body.model_dump()
    doc.update({"id": new_id(), "company_id": COMPANY_ID, "user_id": user["id"],
                "status": "naliczone", "zatwierdzil_id": None,
                "ujete_w_rozliczeniu_id": None, "created_at": now_iso()})
    await db.extra_hours.insert_one(doc)
    return clean(doc)


@api.get("/extra-hours")
async def list_extra(project_id: Optional[str] = None, mine: bool = False,
                     user: dict = Depends(current_user)):
    q = {"company_id": COMPANY_ID}
    if project_id:
        q["project_id"] = project_id
    if mine or user["rola"] in ("worker", "subcontractor"):
        q["user_id"] = user["id"]
    rows = await db.extra_hours.find(q).sort("created_at", -1).to_list(1000)
    return [clean(r) for r in rows]


@api.post("/extra-hours/{eid}/approve")
async def approve_extra(eid: str, user: dict = Depends(require("admin", "foreman"))):
    e = await db.extra_hours.find_one({"id": eid})
    if not e:
        raise HTTPException(404, "Nie znaleziono")
    await db.extra_hours.update_one({"id": eid},
                                    {"$set": {"status": "zatwierdzone", "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "zatwierdzenie_godzin_ekstra", "extra_hours", eid)
    await notify(e["user_id"], "godziny_ekstra_zatwierdzone", "Godziny ekstra zatwierdzone.", action_url="/(tabs)/hours")
    return {"status": "zatwierdzone"}


@api.post("/extra-hours/{eid}/reject")
async def reject_extra(eid: str, user: dict = Depends(require("admin", "foreman"))):
    e = await db.extra_hours.find_one({"id": eid})
    if not e:
        raise HTTPException(404, "Nie znaleziono")
    await db.extra_hours.update_one({"id": eid},
                                    {"$set": {"status": "odrzucone", "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "odrzucenie_godzin_ekstra", "extra_hours", eid)
    await notify(e["user_id"], "godziny_ekstra_odrzucone", "Godziny ekstra odrzucone.", action_url="/(tabs)/hours")
    return {"status": "odrzucone"}


@api.delete("/extra-hours/{eid}")
async def delete_extra(eid: str, user: dict = Depends(current_user)):
    await db.extra_hours.delete_one({"id": eid})
    await audit(user["id"], "usuniecie_godzin_ekstra", "extra_hours", eid)
    return {"deleted": True}


# ===========================================================================
# DELAY REASONS
# ===========================================================================
@api.get("/delay-reasons")
async def list_reasons(user: dict = Depends(current_user)):
    rows = await db.delay_reasons.find({"company_id": COMPANY_ID, "aktywna": True}).to_list(200)
    return [clean(r) for r in rows]


@api.post("/delay-reasons", status_code=201)
async def create_reason(body: DelayReasonIn, admin: dict = Depends(require("admin"))):
    doc = body.model_dump()
    doc.update({"id": new_id(), "company_id": COMPANY_ID})
    await db.delay_reasons.insert_one(doc)
    return clean(doc)


@api.put("/delay-reasons/{rid}")
async def update_reason(rid: str, body: DelayReasonIn, admin: dict = Depends(require("admin"))):
    await db.delay_reasons.update_one({"id": rid}, {"$set": body.model_dump()})
    return clean(await db.delay_reasons.find_one({"id": rid}))


@api.delete("/delay-reasons/{rid}")
async def delete_reason(rid: str, admin: dict = Depends(require("admin"))):
    await db.delay_reasons.update_one({"id": rid}, {"$set": {"aktywna": False}})
    return {"deleted": True}


# ===========================================================================
# DAILY REPORTS
# ===========================================================================
@api.post("/reports", status_code=201)
async def create_report(body: ReportIn, user: dict = Depends(current_user)):
    project = await db.projects.find_one({"id": body.project_id})
    if not project:
        raise HTTPException(404, "Nie znaleziono projektu")
    day = body.data or datetime.now(timezone.utc).date().isoformat()
    # Weather is best-effort and must NEVER block report submission. Bound it hard.
    try:
        weather = await asyncio.wait_for(fetch_weather(project.get("adres", "")), timeout=6.0)
    except (asyncio.TimeoutError, Exception) as e:
        logger.warning(f"weather skipped for report: {e}")
        weather = None
    doc = {
        "id": new_id(), "company_id": COMPANY_ID, "user_id": user["id"],
        "project_id": body.project_id, "data": day, "opis": body.opis,
        "zdjecia": body.zdjecia, "voice_url": body.voice_url,
        "transkrypcja": body.transkrypcja, "element_ids": body.element_ids,
        "pogoda_json": weather, "status": "wyslany", "powod_odrzucenia": None,
        "zatwierdzil_id": None, "created_at": now_iso(),
    }
    await db.daily_reports.insert_one(doc)
    # Mark selected elements as "zgłoszony_gotowy" (skip already-received ones).
    for eid in (body.element_ids or []):
        el = await db.elements.find_one({"id": eid, "project_id": body.project_id})
        if not el or el.get("status") == "odebrany":
            continue
        await db.elements.update_one({"id": eid}, {"$set": {
            "status": "zgloszony_gotowy", "zglosil_id": user["id"], "zgloszony_at": now_iso()}})
        await db.element_history.insert_one({
            "id": new_id(), "company_id": COMPANY_ID, "element_id": eid,
            "akcja": "zgloszony_gotowy", "status_przed": el.get("status"),
            "status_po": "zgloszony_gotowy", "user_id": user["id"],
            "report_id": doc["id"], "created_at": now_iso()})
    # optional extra hours attached to report
    if body.extra_godziny and body.extra_godziny.get("liczba_godzin"):
        eg = body.extra_godziny
        await db.extra_hours.insert_one({
            "id": new_id(), "company_id": COMPANY_ID, "user_id": user["id"],
            "project_id": body.project_id, "data": day,
            "liczba_godzin": float(eg.get("liczba_godzin")),
            "przyczyna_id": eg.get("przyczyna_id"), "element_id": eg.get("element_id"),
            "opis": eg.get("opis", ""), "status": "naliczone", "report_id": doc["id"],
            "zatwierdzil_id": None, "ujete_w_rozliczeniu_id": None, "created_at": now_iso(),
        })
    await audit(user["id"], "utworzenie_raportu", "daily_report", doc["id"])
    # notify foreman(s) & admins of the project
    members = await db.project_members.find({"project_id": body.project_id}).to_list(1000)
    fore_ids = []
    for m in members:
        u = await db.users.find_one({"id": m["user_id"]})
        if u and u.get("rola") == "foreman":
            fore_ids.append(u["id"])
    admins = await db.users.find({"rola": "admin", "status": "aktywny"}).to_list(100)
    for rid in set(fore_ids + [a["id"] for a in admins]):
        await notify(rid, "raport_do_zatwierdzenia",
                     f"Nowy raport do zatwierdzenia: {project['nazwa']}",
                     obj_ref=doc["id"], action_url=f"/report/{doc['id']}")
    return clean(doc)


@api.get("/reports")
async def list_reports(project_id: Optional[str] = None, mine: bool = False,
                       status: Optional[str] = None, user: dict = Depends(current_user)):
    q = {"company_id": COMPANY_ID}
    if project_id:
        q["project_id"] = project_id
    if status:
        q["status"] = status
    if mine or user["rola"] in ("worker", "subcontractor"):
        q["user_id"] = user["id"]
    if user["rola"] == "contractor":
        ids = await user_project_ids(user)
        q["project_id"] = {"$in": ids}
        q["status"] = "zatwierdzony"
    rows = await db.daily_reports.find(q).sort("created_at", -1).to_list(1000)
    out = []
    for r in rows:
        r = clean(r)
        u = await db.users.find_one({"id": r["user_id"]})
        p = await db.projects.find_one({"id": r["project_id"]})
        r["autor"] = f"{u['imie']} {u['nazwisko']}" if u else "?"
        r["project_nazwa"] = p["nazwa"] if p else "?"
        out.append(r)
    return out


@api.get("/reports/{report_id}")
async def get_report(report_id: str, user: dict = Depends(current_user)):
    r = await db.daily_reports.find_one({"id": report_id})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    r = clean(r)
    u = await db.users.find_one({"id": r["user_id"]})
    p = await db.projects.find_one({"id": r["project_id"]})
    r["autor"] = f"{u['imie']} {u['nazwisko']}" if u else "?"
    r["autor_avatar"] = u.get("avatar_url") if u else None
    r["project_nazwa"] = p["nazwa"] if p else "?"
    r["klient_nazwa"] = p.get("klient_nazwa") if p else None
    # reported elements (clickable on client)
    els = []
    for eid in (r.get("element_ids") or []):
        el = await db.elements.find_one({"id": eid})
        if el:
            els.append({"id": el["id"], "kod": el.get("kod"), "status": el.get("status")})
    r["elementy"] = els
    # extra hours linked to this report
    extras = await db.extra_hours.find({"report_id": report_id}).to_list(100)
    eout = []
    for e in extras:
        e = clean(e)
        if e.get("przyczyna_id"):
            pr = await db.delay_reasons.find_one({"id": e["przyczyna_id"]})
            e["przyczyna_pl"] = pr.get("nazwa_pl") if pr else None
            e["przyczyna_en"] = pr.get("nazwa_en") if pr else None
        if e.get("element_id"):
            elx = await db.elements.find_one({"id": e["element_id"]})
            e["element_kod"] = elx.get("kod") if elx else None
        eout.append(e)
    r["extra_godziny"] = eout
    return r


@api.put("/reports/{report_id}")
async def update_report(report_id: str, body: ReportIn, user: dict = Depends(current_user)):
    r = await db.daily_reports.find_one({"id": report_id})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    await db.daily_reports.update_one({"id": report_id}, {"$set": {
        "opis": body.opis, "zdjecia": body.zdjecia, "transkrypcja": body.transkrypcja,
        "element_ids": body.element_ids}})
    await audit(user["id"], "edycja_raportu", "daily_report", report_id)
    return clean(await db.daily_reports.find_one({"id": report_id}))


@api.post("/reports/{report_id}/approve")
async def approve_report(report_id: str, user: dict = Depends(require("admin", "foreman"))):
    r = await db.daily_reports.find_one({"id": report_id})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    await db.daily_reports.update_one({"id": report_id},
                                      {"$set": {"status": "zatwierdzony", "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "zatwierdzenie_raportu", "daily_report", report_id,
                {"status": r["status"]}, {"status": "zatwierdzony"})
    await notify(r["user_id"], "raport_zatwierdzony", "Twój raport został zatwierdzony.",
                 action_url=f"/report/{report_id}")
    return {"status": "zatwierdzony"}


@api.post("/reports/{report_id}/reject")
async def reject_report(report_id: str, body: RejectIn, user: dict = Depends(require("admin", "foreman"))):
    if not body.powod or not body.powod.strip():
        raise HTTPException(422, "Powód odrzucenia jest wymagany / Reason required")
    r = await db.daily_reports.find_one({"id": report_id})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    await db.daily_reports.update_one({"id": report_id}, {"$set": {
        "status": "odrzucony", "powod_odrzucenia": body.powod, "zatwierdzil_id": user["id"]}})
    await audit(user["id"], "odrzucenie_raportu", "daily_report", report_id, None, {"powod": body.powod})
    await notify(r["user_id"], "raport_odrzucony", f"Raport odrzucony: {body.powod}",
                 action_url=f"/report/{report_id}")
    return {"status": "odrzucony"}


@api.delete("/reports/{report_id}")
async def delete_report(report_id: str, user: dict = Depends(current_user)):
    await db.daily_reports.delete_one({"id": report_id})
    await audit(user["id"], "usuniecie_raportu", "daily_report", report_id)
    return {"deleted": True}


# ===========================================================================
# ISSUES
# ===========================================================================
@api.post("/issues", status_code=201)
async def create_issue(body: IssueIn, user: dict = Depends(current_user)):
    if user["rola"] == "contractor":
        raise HTTPException(403, "Brak uprawnień / Not allowed")
    doc = {
        "id": new_id(), "company_id": COMPANY_ID, "user_id": user["id"],
        "project_id": body.project_id, "tytul": body.tytul, "opis": body.opis,
        "zdjecia": body.zdjecia, "voice_url": body.voice_url, "priorytet": body.priorytet,
        "status": "otwarte", "decyzja_powod": None,
        "historia_statusow": [{"status": "otwarte", "kiedy": now_iso(), "kto": user["id"]}],
        "created_at": now_iso(),
    }
    await db.issues.insert_one(doc)
    await audit(user["id"], "utworzenie_zgloszenia", "issue", doc["id"])
    project = await db.projects.find_one({"id": body.project_id})
    admins = await db.users.find({"rola": "admin", "status": "aktywny"}).to_list(100)
    for a in admins:
        await notify(a["id"], "nowe_zgloszenie",
                     f"Nowe zgłoszenie: {body.tytul}", obj_ref=doc["id"], action_url=f"/issue/{doc['id']}")
    return clean(doc)


@api.get("/issues")
async def list_issues(project_id: Optional[str] = None, mine: bool = False,
                      user: dict = Depends(current_user)):
    q = {"company_id": COMPANY_ID}
    if project_id:
        q["project_id"] = project_id
    if mine or user["rola"] in ("worker", "subcontractor"):
        q["user_id"] = user["id"]
    rows = await db.issues.find(q).sort("created_at", -1).to_list(1000)
    out = []
    for r in rows:
        r = clean(r)
        u = await db.users.find_one({"id": r["user_id"]})
        p = await db.projects.find_one({"id": r["project_id"]})
        r["autor"] = f"{u['imie']} {u['nazwisko']}" if u else "?"
        r["project_nazwa"] = p["nazwa"] if p else "?"
        out.append(r)
    return out


@api.get("/issues/{issue_id}")
async def get_issue(issue_id: str, user: dict = Depends(current_user)):
    r = await db.issues.find_one({"id": issue_id})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    r = clean(r)
    u = await db.users.find_one({"id": r["user_id"]})
    p = await db.projects.find_one({"id": r["project_id"]})
    r["autor"] = f"{u['imie']} {u['nazwisko']}" if u else "?"
    r["project_nazwa"] = p["nazwa"] if p else "?"
    return r


@api.patch("/issues/{issue_id}/status")
async def issue_status(issue_id: str, body: IssueStatusIn, user: dict = Depends(require("admin", "foreman"))):
    r = await db.issues.find_one({"id": issue_id})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    if body.status in ("rozwiazane", "odrzucone") and not (body.powod or "").strip():
        raise HTTPException(422, "Powód decyzji wymagany / Reason required")
    hist = r.get("historia_statusow", [])
    hist.append({"status": body.status, "kiedy": now_iso(), "kto": user["id"], "powod": body.powod})
    await db.issues.update_one({"id": issue_id}, {"$set": {
        "status": body.status, "decyzja_powod": body.powod, "historia_statusow": hist}})
    await audit(user["id"], "zmiana_statusu_zgloszenia", "issue", issue_id,
                {"status": r["status"]}, {"status": body.status})
    await notify(r["user_id"], "decyzja_zgloszenie",
                 f"Zgłoszenie „{r['tytul']}”: {body.status}", action_url=f"/issue/{issue_id}")
    return clean(await db.issues.find_one({"id": issue_id}))


@api.delete("/issues/{issue_id}")
async def delete_issue(issue_id: str, user: dict = Depends(current_user)):
    await db.issues.delete_one({"id": issue_id})
    await audit(user["id"], "usuniecie_zgloszenia", "issue", issue_id)
    return {"deleted": True}


# ===========================================================================
# DELIVERIES
# ===========================================================================
@api.post("/deliveries", status_code=201)
async def create_delivery(body: DeliveryIn, user: dict = Depends(current_user)):
    doc = {
        "id": new_id(), "company_id": COMPANY_ID, "project_id": body.project_id,
        "autor_id": user["id"], "opis": body.opis, "transkrypcja": body.transkrypcja,
        "data_planowana": body.data_planowana, "zalacznik_url": body.zalacznik_url,
        "zalacznik_nazwa": body.zalacznik_nazwa, "status": "awizowana",
        "created_at": now_iso(),
    }
    await db.deliveries.insert_one(doc)
    await audit(user["id"], "utworzenie_dostawy", "delivery", doc["id"])
    members = await db.project_members.find({"project_id": body.project_id}).to_list(1000)
    project = await db.projects.find_one({"id": body.project_id})
    for m in members:
        u = await db.users.find_one({"id": m["user_id"]})
        if u and u.get("rola") in ("foreman", "admin"):
            await notify(u["id"], "nowa_dostawa",
                         f"Nowa awizacja dostawy: {project['nazwa'] if project else ''}",
                         obj_ref=doc["id"], action_url=f"/delivery/{doc['id']}")
    admins = await db.users.find({"rola": "admin", "status": "aktywny"}).to_list(100)
    for a in admins:
        await notify(a["id"], "nowa_dostawa", f"Nowa awizacja dostawy",
                     obj_ref=doc["id"], action_url=f"/delivery/{doc['id']}", push=False)
    return clean(doc)


@api.get("/deliveries")
async def list_deliveries(project_id: Optional[str] = None, mine: bool = False,
                          user: dict = Depends(current_user)):
    q = {"company_id": COMPANY_ID}
    if project_id:
        q["project_id"] = project_id
    if mine or user["rola"] == "contractor":
        q["autor_id"] = user["id"]
    rows = await db.deliveries.find(q).sort("created_at", -1).to_list(1000)
    out = []
    for r in rows:
        r = clean(r)
        p = await db.projects.find_one({"id": r["project_id"]})
        r["project_nazwa"] = p["nazwa"] if p else "?"
        out.append(r)
    return out


@api.get("/deliveries/{did}")
async def get_delivery(did: str, user: dict = Depends(current_user)):
    r = await db.deliveries.find_one({"id": did})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    r = clean(r)
    p = await db.projects.find_one({"id": r["project_id"]})
    r["project_nazwa"] = p["nazwa"] if p else "?"
    a = await db.users.find_one({"id": r["autor_id"]})
    r["autor"] = f"{a['imie']} {a['nazwisko']}" if a else "?"
    return r


@api.patch("/deliveries/{did}/status")
async def delivery_status(did: str, body: DeliveryStatusIn, user: dict = Depends(require("admin", "foreman"))):
    r = await db.deliveries.find_one({"id": did})
    if not r:
        raise HTTPException(404, "Nie znaleziono")
    await db.deliveries.update_one({"id": did}, {"$set": {"status": body.status}})
    await audit(user["id"], "decyzja_dostawa", "delivery", did,
                {"status": r["status"]}, {"status": body.status})
    await notify(r["autor_id"], "decyzja_dostawa", f"Awizacja dostawy: {body.status}",
                 action_url=f"/delivery/{did}")
    return {"status": body.status}


@api.delete("/deliveries/{did}")
async def delete_delivery(did: str, user: dict = Depends(current_user)):
    await db.deliveries.update_one({"id": did}, {"$set": {"status": "zarchiwizowana"}})
    await audit(user["id"], "archiwizacja_dostawy", "delivery", did)
    return {"archived": True}


# ===========================================================================
# NOTIFICATIONS
# ===========================================================================
@api.get("/notifications")
async def list_notifications(user: dict = Depends(current_user)):
    rows = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    return [clean(r) for r in rows]


@api.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(current_user)):
    n = await db.notifications.count_documents({"user_id": user["id"], "przeczytane": False})
    return {"count": n}


@api.patch("/notifications/{nid}/read")
async def read_notification(nid: str, user: dict = Depends(current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]},
                                      {"$set": {"przeczytane": True}})
    return {"ok": True}


@api.post("/notifications/read-all")
async def read_all(user: dict = Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"przeczytane": True}})
    return {"ok": True}


# ===========================================================================
# AUDIT LOG
# ===========================================================================
@api.get("/audit-log")
async def audit_log(project_id: Optional[str] = None, user_id: Optional[str] = None,
                    admin: dict = Depends(require("admin"))):
    q = {"company_id": COMPANY_ID}
    if user_id:
        q["user_id"] = user_id
    if project_id:
        q["obiekt_id"] = project_id
    rows = await db.audit_log.find(q).sort("created_at", -1).to_list(500)
    out = []
    for r in rows:
        r = clean(r)
        u = await db.users.find_one({"id": r["user_id"]})
        r["kto"] = f"{u['imie']} {u['nazwisko']}" if u else r["user_id"]
        out.append(r)
    return out


# ===========================================================================
# FILES (server-side storage, served via API)
# ===========================================================================
@api.post("/files", status_code=201)
async def upload_file(file: UploadFile = File(...), kind: str = Form("attachment"),
                      user: dict = Depends(current_user)):
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "Plik za duży (max 20MB) / File too large")
    fid = new_id()
    ext = Path(file.filename or "").suffix.lower() or (mimetypes.guess_extension(file.content_type or "") or "")
    path = UPLOAD_DIR / f"{fid}{ext}"
    with open(path, "wb") as f:
        f.write(data)
    doc = {"id": fid, "company_id": COMPANY_ID, "owner_id": user["id"], "kind": kind,
           "original_name": (file.filename or "plik")[:255], "content_type": file.content_type,
           "size_bytes": len(data), "path": str(path), "status": "active", "created_at": now_iso()}
    await db.files.insert_one(doc)
    base = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "")
    return {"id": fid, "name": doc["original_name"], "contentType": file.content_type,
            "sizeBytes": len(data), "url": f"/api/files/{fid}/content"}


@api.get("/files/{file_id}/content")
async def file_content(file_id: str, download: int = 0):
    doc = await db.files.find_one({"id": file_id, "status": "active"})
    if not doc:
        raise HTTPException(404, "Nie znaleziono pliku")
    p = Path(doc["path"])
    if not p.exists():
        raise HTTPException(404, "Plik nie istnieje")
    disp = "attachment" if download else "inline"

    def it():
        with open(p, "rb") as f:
            while chunk := f.read(65536):
                yield chunk
    return StreamingResponse(it(), media_type=doc.get("content_type") or "application/octet-stream",
                             headers={"Content-Disposition": f'{disp}; filename="{doc["original_name"]}"'})


# ===========================================================================
# TRANSCRIBE (OpenAI Whisper via Emergent key)
# ===========================================================================
@api.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("pl"),
                     user: dict = Depends(current_user)):
    from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Nagranie za duże (max 25MB)")
    ext = Path(file.filename or "audio.m4a").suffix.lower() or ".m4a"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(data)
    tmp.close()
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        resp = await stt.transcribe(file=tmp.name, model="whisper-1",
                                    response_format="json", language=language)
        text = getattr(resp, "text", None) or (resp.get("text") if isinstance(resp, dict) else "")
        return {"text": (text or "").strip()}
    except Exception as e:
        logger.error(f"transcription failed: {e}")
        raise HTTPException(502, "Transkrypcja nie powiodła się / Transcription failed")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


# ===========================================================================
# PUSH
# ===========================================================================
@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushIn):
    resp = await push_client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


# ===========================================================================
# ETAP 2A — MODELE / ZRZUTY (element types, folders, views, elements, receipts)
# ===========================================================================
class ElementTypeIn(BaseModel):
    nazwa_pl: str
    nazwa_en: str
    kolor: str = "#F97316"
    aktywny: bool = True


class FolderIn(BaseModel):
    nazwa: str
    opis: Optional[str] = ""


class ViewIn(BaseModel):
    nazwa: str
    plik_url: str
    plik_typ: str = "image"  # image | pdf
    szerokosc: Optional[float] = None
    wysokosc: Optional[float] = None


class ElementIn(BaseModel):
    kod: str
    typ_id: Optional[str] = None
    opis: Optional[str] = ""
    pozycja_x: float  # 0..1 relative to view
    pozycja_y: float


class ElementUpdateIn(BaseModel):
    kod: Optional[str] = None
    typ_id: Optional[str] = None
    opis: Optional[str] = None
    pozycja_x: Optional[float] = None
    pozycja_y: Optional[float] = None


class ReceiveIn(BaseModel):
    element_ids: List[str]


class UnreceiveIn(BaseModel):
    element_ids: List[str]
    powod: str


async def _log_element(element_id: str, akcja: str, before: str, after: str,
                       user_id: str, report_id: str = None):
    await db.element_history.insert_one({
        "id": new_id(), "company_id": COMPANY_ID, "element_id": element_id,
        "akcja": akcja, "status_przed": before, "status_po": after,
        "user_id": user_id, "report_id": report_id, "created_at": now_iso()})


# ---- Element types (admin dictionary) ----
@api.get("/element-types")
async def list_element_types(user: dict = Depends(current_user)):
    rows = await db.element_types.find({"company_id": COMPANY_ID, "aktywny": True}).to_list(200)
    return [clean(r) for r in rows]


@api.post("/element-types", status_code=201)
async def create_element_type(body: ElementTypeIn, admin: dict = Depends(require("admin"))):
    doc = body.model_dump(); doc.update({"id": new_id(), "company_id": COMPANY_ID})
    await db.element_types.insert_one(doc)
    await audit(admin["id"], "utworzenie_typu_elementu", "element_type", doc["id"])
    return clean(doc)


@api.put("/element-types/{tid}")
async def update_element_type(tid: str, body: ElementTypeIn, admin: dict = Depends(require("admin"))):
    await db.element_types.update_one({"id": tid}, {"$set": body.model_dump()})
    return clean(await db.element_types.find_one({"id": tid}))


@api.delete("/element-types/{tid}")
async def delete_element_type(tid: str, admin: dict = Depends(require("admin"))):
    await db.element_types.update_one({"id": tid}, {"$set": {"aktywny": False}})
    return {"deleted": True}


# ---- Folders ----
async def _folder_stats(fid: str) -> dict:
    views_n = await db.views.count_documents({"folder_id": fid, "status": "aktywny"})
    total = await db.elements.count_documents({"folder_id": fid, "status": {"$ne": "zarchiwizowany"}})
    recv = await db.elements.count_documents({"folder_id": fid, "status": "odebrany"})
    return {"widoki": views_n, "elementy": total, "odebrane": recv,
            "procent": round(recv / total * 100) if total else 0}


@api.get("/projects/{project_id}/folders")
async def list_folders(project_id: str, user: dict = Depends(current_user)):
    rows = await db.folders.find({"project_id": project_id, "status": "aktywny"}).sort("created_at", 1).to_list(500)
    out = []
    for f in rows:
        f = clean(f); f.update(await _folder_stats(f["id"])); out.append(f)
    return out


@api.post("/projects/{project_id}/folders", status_code=201)
async def create_folder(project_id: str, body: FolderIn, user: dict = Depends(require("admin", "foreman"))):
    doc = {"id": new_id(), "company_id": COMPANY_ID, "project_id": project_id,
           "nazwa": body.nazwa, "opis": body.opis, "status": "aktywny", "created_at": now_iso()}
    await db.folders.insert_one(doc)
    await audit(user["id"], "utworzenie_folderu", "folder", doc["id"], None, {"nazwa": body.nazwa})
    return clean(doc)


@api.put("/folders/{fid}")
async def update_folder(fid: str, body: FolderIn, user: dict = Depends(require("admin", "foreman"))):
    await db.folders.update_one({"id": fid}, {"$set": {"nazwa": body.nazwa, "opis": body.opis}})
    return clean(await db.folders.find_one({"id": fid}))


@api.patch("/folders/{fid}/archive")
async def archive_folder(fid: str, user: dict = Depends(require("admin", "foreman"))):
    await db.folders.update_one({"id": fid}, {"$set": {"status": "zarchiwizowany"}})
    await audit(user["id"], "archiwizacja_folderu", "folder", fid)
    return {"status": "zarchiwizowany"}


# ---- Views ----
@api.get("/folders/{fid}/views")
async def list_views(fid: str, user: dict = Depends(current_user)):
    rows = await db.views.find({"folder_id": fid, "status": "aktywny"}).sort("created_at", 1).to_list(500)
    out = []
    for v in rows:
        v = clean(v)
        v["elementy"] = await db.elements.count_documents({"view_id": v["id"], "status": {"$ne": "zarchiwizowany"}})
        v["odebrane"] = await db.elements.count_documents({"view_id": v["id"], "status": "odebrany"})
        out.append(v)
    return out


@api.post("/folders/{fid}/views", status_code=201)
async def create_view(fid: str, body: ViewIn, user: dict = Depends(require("admin", "foreman"))):
    folder = await db.folders.find_one({"id": fid})
    if not folder:
        raise HTTPException(404, "Nie znaleziono folderu")
    doc = {"id": new_id(), "company_id": COMPANY_ID, "folder_id": fid,
           "project_id": folder["project_id"], "nazwa": body.nazwa, "plik_url": body.plik_url,
           "plik_typ": body.plik_typ, "szerokosc": body.szerokosc, "wysokosc": body.wysokosc,
           "status": "aktywny", "created_at": now_iso()}
    await db.views.insert_one(doc)
    await audit(user["id"], "utworzenie_widoku", "view", doc["id"], None, {"nazwa": body.nazwa})
    return clean(doc)


@api.put("/views/{vid}")
async def update_view(vid: str, body: ViewIn, user: dict = Depends(require("admin", "foreman"))):
    await db.views.update_one({"id": vid}, {"$set": {
        "nazwa": body.nazwa, "plik_url": body.plik_url, "plik_typ": body.plik_typ}})
    return clean(await db.views.find_one({"id": vid}))


@api.get("/views/{vid}")
async def get_view(vid: str, user: dict = Depends(current_user)):
    v = await db.views.find_one({"id": vid})
    if not v:
        raise HTTPException(404, "Nie znaleziono widoku")
    v = clean(v)
    els = await db.elements.find({"view_id": vid, "status": {"$ne": "zarchiwizowany"}}).to_list(2000)
    v["elementy"] = [clean(e) for e in els]
    return v


@api.patch("/views/{vid}/archive")
async def archive_view(vid: str, user: dict = Depends(require("admin", "foreman"))):
    await db.views.update_one({"id": vid}, {"$set": {"status": "zarchiwizowany"}})
    await audit(user["id"], "archiwizacja_widoku", "view", vid)
    return {"status": "zarchiwizowany"}


# ---- Elements ----
@api.get("/views/{vid}/elements")
async def list_view_elements(vid: str, user: dict = Depends(current_user)):
    rows = await db.elements.find({"view_id": vid, "status": {"$ne": "zarchiwizowany"}}).to_list(2000)
    return [clean(r) for r in rows]


@api.get("/projects/{project_id}/elements")
async def list_project_elements(project_id: str, status: Optional[str] = None,
                                user: dict = Depends(current_user)):
    q = {"project_id": project_id, "status": {"$ne": "zarchiwizowany"}}
    if status:
        q["status"] = status
    rows = await db.elements.find(q).sort("kod", 1).to_list(3000)
    return [clean(r) for r in rows]


@api.post("/views/{vid}/elements", status_code=201)
async def create_element(vid: str, body: ElementIn, user: dict = Depends(require("admin", "foreman"))):
    view = await db.views.find_one({"id": vid})
    if not view:
        raise HTTPException(404, "Nie znaleziono widoku")
    kod = (body.kod or "").strip()
    if not kod:
        raise HTTPException(422, "Kod jest wymagany / Code required")
    dup = await db.elements.find_one({"project_id": view["project_id"], "kod": kod,
                                      "status": {"$ne": "zarchiwizowany"}})
    if dup:
        raise HTTPException(409, f"Kod '{kod}' jest już użyty w tym projekcie / Code already used")
    doc = {"id": new_id(), "company_id": COMPANY_ID, "view_id": vid,
           "folder_id": view["folder_id"], "project_id": view["project_id"],
           "kod": kod, "typ_id": body.typ_id, "opis": body.opis,
           "pozycja_x": body.pozycja_x, "pozycja_y": body.pozycja_y,
           "status": "do_wykonania", "zglosil_id": None, "zgloszony_at": None,
           "odebral_id": None, "odebrany_at": None, "ujete_w_rozliczeniu_id": None,
           "geometria_typ": "punkt", "geometria_json": None,
           "created_at": now_iso()}
    await db.elements.insert_one(doc)
    await _log_element(doc["id"], "utworzony", None, "do_wykonania", user["id"])
    return clean(doc)


class SeriesValidateIn(BaseModel):
    kody: List[str]


@api.post("/projects/{project_id}/elements/validate-codes")
async def validate_codes(project_id: str, body: SeriesValidateIn,
                         user: dict = Depends(require("admin", "foreman"))):
    """Pre-check a whole series/range of codes before placement (1.2)."""
    taken = []
    seen = set()
    for k in body.kody:
        k = (k or "").strip()
        if k in seen:
            taken.append(k)  # duplicate within the batch itself
            continue
        seen.add(k)
        ex = await db.elements.find_one({"project_id": project_id, "kod": k,
                                         "status": {"$ne": "zarchiwizowany"}})
        if ex:
            taken.append(k)
    return {"taken": taken, "ok": len(taken) == 0}


@api.put("/elements/{eid}")
async def update_element(eid: str, body: ElementUpdateIn, user: dict = Depends(require("admin", "foreman"))):
    el = await db.elements.find_one({"id": eid})
    if not el:
        raise HTTPException(404, "Nie znaleziono")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "kod" in upd:
        upd["kod"] = upd["kod"].strip()
        dup = await db.elements.find_one({"project_id": el["project_id"], "kod": upd["kod"],
                                          "status": {"$ne": "zarchiwizowany"}, "id": {"$ne": eid}})
        if dup:
            raise HTTPException(409, f"Kod '{upd['kod']}' jest już użyty w tym projekcie / Code already used")
    if upd:
        await db.elements.update_one({"id": eid}, {"$set": upd})
    return clean(await db.elements.find_one({"id": eid}))


@api.get("/projects/{project_id}/elements/duplicates")
async def element_duplicates(project_id: str, user: dict = Depends(require("admin", "foreman"))):
    """Groups of active elements that share the same code (1.2 repair screen)."""
    pipe = [
        {"$match": {"project_id": project_id, "status": {"$ne": "zarchiwizowany"}}},
        {"$group": {"_id": "$kod", "n": {"$sum": 1}, "ids": {"$push": "$id"}}},
        {"$match": {"n": {"$gt": 1}}},
    ]
    groups = []
    async for g in db.elements.aggregate(pipe):
        els = []
        for eid in g["ids"]:
            el = await db.elements.find_one({"id": eid})
            if el:
                v = await db.views.find_one({"id": el["view_id"]})
                els.append({"id": el["id"], "kod": el["kod"], "status": el["status"],
                            "widok_nazwa": v["nazwa"] if v else "?"})
        groups.append({"kod": g["_id"], "count": g["n"], "elementy": els})
    return groups


@api.delete("/elements/{eid}")
async def delete_element(eid: str, user: dict = Depends(require("admin", "foreman"))):
    el = await db.elements.find_one({"id": eid})
    if not el:
        raise HTTPException(404, "Nie znaleziono")
    if el.get("status") == "odebrany" or el.get("ujete_w_rozliczeniu_id"):
        # Protect evidentiary/financial records — archive instead of delete.
        await db.elements.update_one({"id": eid}, {"$set": {"status": "zarchiwizowany"}})
        await _log_element(eid, "zarchiwizowany", el.get("status"), "zarchiwizowany", user["id"])
        return {"archived": True, "message": "Element odebrany — zarchiwizowano zamiast usunięcia."}
    await db.elements.delete_one({"id": eid})
    await audit(user["id"], "usuniecie_elementu", "element", eid)
    return {"deleted": True}


@api.get("/elements/{eid}")
async def get_element(eid: str, user: dict = Depends(current_user)):
    el = await db.elements.find_one({"id": eid})
    if not el:
        raise HTTPException(404, "Nie znaleziono")
    el = clean(el)
    hist = await db.element_history.find({"element_id": eid}).sort("created_at", 1).to_list(500)
    out_hist = []
    for h in hist:
        h = clean(h)
        u = await db.users.find_one({"id": h.get("user_id")})
        h["kto"] = f"{u['imie']} {u['nazwisko']}" if u else "?"
        out_hist.append(h)
    el["historia"] = out_hist
    if el.get("typ_id"):
        typ = await db.element_types.find_one({"id": el["typ_id"]})
        el["typ"] = clean(typ) if typ else None
    return el


# ---- Receipts (odbiory) ----
@api.get("/projects/{project_id}/elements/pending-receipt")
async def pending_receipt(project_id: str, user: dict = Depends(require("admin", "foreman"))):
    rows = await db.elements.find({"project_id": project_id, "status": "zgloszony_gotowy"}).to_list(3000)
    out = []
    for e in rows:
        e = clean(e)
        v = await db.views.find_one({"id": e["view_id"]})
        f = await db.folders.find_one({"id": e["folder_id"]})
        e["widok_nazwa"] = v["nazwa"] if v else "?"
        e["folder_nazwa"] = f["nazwa"] if f else "?"
        out.append(e)
    return out


@api.post("/projects/{project_id}/elements/receive")
async def receive_elements(project_id: str, body: ReceiveIn, user: dict = Depends(require("admin", "foreman"))):
    n = 0
    for eid in body.element_ids:
        el = await db.elements.find_one({"id": eid, "project_id": project_id})
        if not el or el.get("status") == "odebrany":
            continue
        await db.elements.update_one({"id": eid}, {"$set": {
            "status": "odebrany", "odebral_id": user["id"], "odebrany_at": now_iso()}})
        await _log_element(eid, "odebrany", el.get("status"), "odebrany", user["id"])
        if el.get("zglosil_id"):
            await notify(el["zglosil_id"], "element_odebrany",
                         f"Element {el['kod']} odebrany.", action_url=f"/element/{eid}", push=False)
        n += 1
    await audit(user["id"], "odbior_elementow", "project", project_id, None, {"count": n})
    return {"odebrano": n}


@api.post("/projects/{project_id}/elements/unreceive")
async def unreceive_elements(project_id: str, body: UnreceiveIn, user: dict = Depends(require("admin", "foreman"))):
    if not body.powod.strip():
        raise HTTPException(422, "Powód wymagany / Reason required")
    n = 0
    for eid in body.element_ids:
        el = await db.elements.find_one({"id": eid, "project_id": project_id})
        if not el or el.get("status") != "odebrany":
            continue
        if el.get("ujete_w_rozliczeniu_id"):
            raise HTTPException(409, f"Element {el['kod']} jest ujęty w rozliczeniu — nie można cofnąć.")
        await db.elements.update_one({"id": eid}, {"$set": {
            "status": "zgloszony_gotowy", "odebral_id": None, "odebrany_at": None}})
        await _log_element(eid, "cofniecie_odbioru", "odebrany", "zgloszony_gotowy", user["id"])
        n += 1
    await audit(user["id"], "cofniecie_odbioru", "project", project_id, None, {"count": n, "powod": body.powod})
    return {"cofnieto": n}



@api.get("/")
async def root():
    return {"app": "B-ZONE 2.0", "status": "ok"}


# ---------------------------------------------------------------------------
# Startup: indexes + seed admin + default delay reasons
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    # Unique element code per project (1.2). Partial index over active elements only,
    # so archived duplicates never block re-use of a freed code.
    try:
        await db.elements.create_index(
            [("company_id", 1), ("project_id", 1), ("kod", 1)],
            unique=True, name="uniq_element_kod",
            partialFilterExpression={"status": {"$in": ["do_wykonania", "zgloszony_gotowy", "odebrany"]}},
        )
    except Exception as e:
        logger.warning(f"element unique index skipped: {e}")
    # Schema prep (Etap 3): geometry fields, migrate legacy rows to 'punkt'.
    mig = await db.elements.update_many(
        {"geometria_typ": {"$exists": False}},
        {"$set": {"geometria_typ": "punkt", "geometria_json": None}})
    if mig.modified_count:
        logger.info(f"migrated {mig.modified_count} elements to geometria_typ=punkt")
    # Seed the initial admin only when credentials are provided via environment.
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        admin = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
        if not admin:
            await db.users.insert_one({
                "id": new_id(), "company_id": COMPANY_ID, "email": ADMIN_EMAIL.lower(),
                "hash": hash_pw(ADMIN_PASSWORD), "imie": "Administrator", "nazwisko": "B-Zone",
                "rola": "admin", "avatar_url": None, "telefon": "", "status": "aktywny",
                "stawka_godz_eur": 0.0, "jezyk": "pl", "created_at": now_iso(),
            })
            logger.info(f"Seeded admin: {ADMIN_EMAIL}")
    if await db.delay_reasons.count_documents({"company_id": COMPANY_ID}) == 0:
        defaults = [
            ("Silny wiatr", "Strong wind"), ("Opady deszczu", "Rain"),
            ("Brak materiału", "Missing material"), ("Awaria sprzętu", "Equipment failure"),
            ("Oczekiwanie na decyzję", "Awaiting decision"),
        ]
        for pl, en in defaults:
            await db.delay_reasons.insert_one({
                "id": new_id(), "company_id": COMPANY_ID, "nazwa_pl": pl,
                "nazwa_en": en, "aktywna": True})
    if await db.element_types.count_documents({"company_id": COMPANY_ID}) == 0:
        el_types = [
            ("Okno", "Window", "#3B82F6"), ("Drzwi", "Door", "#10B981"),
            ("Płyta elewacyjna", "Facade panel", "#F97316"),
            ("Narożnik", "Corner", "#A855F7"), ("Parapet", "Windowsill", "#EAB308"),
        ]
        for pl, en, kolor in el_types:
            await db.element_types.insert_one({
                "id": new_id(), "company_id": COMPANY_ID, "nazwa_pl": pl,
                "nazwa_en": en, "kolor": kolor, "aktywny": True})


@app.on_event("shutdown")
async def shutdown():
    client.close()
    await push_client.aclose()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
