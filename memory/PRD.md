# B-ZONE 2.0 — PRD & Build Log

## Original Problem Statement
Mobile app (React Native/Expo + FastAPI/MongoDB REST) for managing facade/construction work. Etap 1 of 5. Build exactly Etap 1 scope but model the full data schema now so later stages don't rework it. Hard rules: single source of truth, ZERO mock data (aesthetic empty states only), no test-mode in build, every UI element clickable, full CRUD (archive for financial/evidentiary records), visual save confirmation + weak-network retry, PL/EN i18n, dark premium theme (#121212 + #F97316), audit log, push notifications, weather stamp on reports, photo GPS/timestamp metadata, multitenancy-ready (company_id everywhere), assistant-ready REST endpoints (one action = one endpoint).

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`), MongoDB (motor). String-uuid `id` fields, `_id` never exposed, `company_id` on every doc. JWT auth (PyJWT + bcrypt). Seeded admin on startup. Open-Meteo weather. emergentintegrations Whisper STT. Emergent push relay. Files stored server-side under `/uploads`, served via `/api/files/{id}/content`.
- **Frontend**: Expo Router file-based routing. Contexts: Auth, Projects, i18n (PL/EN), Toast. Design tokens in `src/theme/tokens.ts`. react-native-keyboard-controller for forms. Role-adaptive bottom tabs.

## Roles (5)
admin, foreman (brygadzista), subcontractor (podwykonawca), worker (pracownik), contractor (kontrahent/client). Registration → pending → admin approval assigns role + hourly rate.

## Core Requirements (static)
- Full CRUD everywhere with confirm-delete/archive modals
- Work-hour accrual engine (auto entries on working days, skip weekend unless soboty_auto; leaves/rotations tables ready but empty in Etap 1)
- Reports: voice→transcript into description, photos w/ timestamp+GPS, extra hours, weather stamp, approve/reject (reason mandatory)
- Issues with status history + decision reason
- Delivery notices with PDF/image attachment (contractor creates, foreman/admin decide)
- Audit log, notification center + push, PL/EN full i18n

## Implemented (2026-08-04) — Etap 1 COMPLETE
- Auth: register/login/reset, admin approval, JWT, role guards, seeded admin (admin@bzone.app / Admin12345!)
- Admin: dashboard metrics, Projects CRUD + archive + members, User management (approve/role/rate/edit/delete), Audit log, Archive (search)
- Foreman: day panel (crew on site), team hours (date strip, corrections, approve day/week), report approve/reject, issue status decisions, deliveries decisions
- Worker/Subcontractor: Today hours, new report (voice+photos+extra hours), report history, my hours, issues
- Contractor: project card (read-only), report archive, delivery notices with attachments
- Cross-cutting: notifications + unread badge, weather stamp (Open-Meteo), photo GPS/timestamp viewer, i18n PL/EN toggle, dark premium UI, empty/loading/error states, network retry, brand logo placeholder
- Verified: 40/40 backend pytest passing; frontend flows verified by testing agent

## Backlog / Next Stages (P-priorities)
- **P0 (Etap 2)**: Models/Views(zrzuty), elements (codes, sell price, geometry), price lists, financial engine, settlements/PDF (team & client), finances on dashboards
- **P1 (Etap 3-4)**: Accommodations + residents, costs, Gantt/phases, admin schedule (leaves + rotations wired to hour engine), materials, broadcasts
- **P2 (Etap 5)**: Reasoning/voice AI assistant calling the same REST endpoints + deep-link navigation
- **Tech debt**: migrate deprecated RN Web `shadow*`/`pointerEvents` style props (web-only warnings)

## Implemented (2026-08-09) — Etap 2A COMPLETE (Modele/Zrzuty)
- Backend: element_types (słownik, admin-only mutacje), folders→views→elements (admin+foreman CRUD), statusy do_wykonania/zgloszony_gotowy/odebrany, element_history z report_id, odbiory multi (receive/unreceive z powodem + 409 gdy ujęte w rozliczeniu), pending-receipt, modele_summary (postęp = odebrane/wszystkie). Pola projektu: tryb_rozliczenia (akordowy/godzinowy/mieszany) + stawka_sprzedazy_godz. ujete_w_rozliczeniu_id i geometria_json tylko utworzone, bez logiki.
- Frontend: ekrany models/[projectId], folder/[id] (upload zrzutu), view/[id] (canvas zoom/pan, tryb edycji + seria, panel odbioru multi), element/[id] (oś czasu), receipts/[projectId], element-types. Integracje: kafel Modele + Odbiory na karcie projektu, ElementPicker w report-new (2 tryby: lista + znaczniki na widoku), pola billing w project-form (stawka sprzedaży wymagana dla godz/mieszany), link "Słownik typów" w Więcej (admin-only).
- BEZPIECZEŃSTWO: strip_project_financials po stronie backendu — kontrahent NIE widzi stawka_sprzedazy_godz/bryg_widzi_stawki/termin_platnosci_*/vat_tryb (potwierdzone surową odpowiedzią API). Wszystkie tabele mają company_id.
- Weryfikacja: backend 33/33 test_etap2a_models.py + 70/70 regresja; frontend flow zielony (iteration_6.json). Cache Metro wyczyszczony przed zakończeniem.

## Notes / Not-yet-live
- Push notifications: structure implemented (register-push + server-side send_push on events). Requires `google-services.json` (Android) + deploy → build to actually deliver; does NOT work in Expo Go.
- App logo: bison-in-hard-hat placeholder ("BZ"/hammer) — swap in real PNG when provided (icon, splash, login).
