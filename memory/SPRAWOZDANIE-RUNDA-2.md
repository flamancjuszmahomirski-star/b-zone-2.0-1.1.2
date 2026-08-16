# SPRAWOZDANIE — RUNDA 2 „Prostokąty i edytor pod mysz" (v1.2.0)

## PF — PRE-FLIGHT
- **PF.1 versionCode**: app.json = **132** (dolna granica; poprzednia binarka właściciela = 131; EAS może auto-inkrementować — faktyczny versionCode APK odczytaj z panelu buildu po Publish). Wersja: **1.2.0**.
- **PF.2 repo prawdy**: właściciel potwierdził w czacie: „preview jest aktualny, 1.0.11/vc131 to tylko przebicie numerów przy republish" — pracowałem na aktualnym kodzie.
- **PF.3 Runda 1.3 nietknięta**: Object Storage, lockout, rate-limit, keyboard-controller, role na endpointach, soft-delete — wszystko zachowane (przeczytane SPRAWOZDANIE-RUNDA-1.3.md przed startem; zero zmian w tych obszarach poza dodaniem NOWYCH endpointów).

## Zakazy — potwierdzenie przestrzegania
- ZERO liczenia powierzchni/długości/wartości z geometrii — nigdzie w kodzie; komentarz-strażnik w `normalize_geometry` i nagłówku edytora.
- ZERO nowych zależności graficznych (bez SVG/Skii) — kształty to zwykłe `View` z ramką i tłem; `yarn.lock` bez nowych pakietów w tej rundzie.
- ZERO wielokątów — tylko `punkt` i `prostokat` (Literal w Pydantic, walidacja 4 narożników).
- Moduł godzin NIETKNIĘTY (zero zmian w plikach godzin).

## I. Kryteria odbioru 1–16

| # | Kryterium | Status | Dowód / jak zweryfikowano |
|---|---|---|---|
| I.1 | Prostokąt 2 klikami + Shift-kwadrat + Esc + formularz (kod/typ/opis) | ✅ | Test przeglądarkowy: 2 kliki → podgląd przerywany → formularz → zapis OKN-99; Esc anuluje (iter14 PASS); Shift w kodzie (kwadrat w px obrazu) |
| I.2 | Powielanie w siatce z podglądem i kodami serii | ✅ | 3×2 z OKN-99: podgląd-duchy z kodami, „Utwórz serię" → 5 elementów (OKN-10..14), audyt `powielanie_elementow {liczba:5}` |
| I.3 | Kolizje kodów łapane PRZED zapisem | ✅ | Prefiks OKN- start 01 → modal pokazał „Kody zajęte: OKN-01" i NIE zapisał nic (walidacja `validate-codes` przed batch); dodatkowo backend batch sam waliduje całą serię przed insertem (409) |
| I.4 | Przesuwanie i zmiana rozmiaru myszą | ✅ | Pomiar px: drag +60 px → bbox 442→502; uchwyt narożny +36 px → szer. 118→157; commit `batch-geometry` |
| I.5 | Wyrównania/rozłożenie/ujednolicenie/lustro | ✅ | Ramka zaznaczenia (marquee) → 2 elementy → „Do góry" → oba y=250.0 px (identyczne); pozostałe 10 operacji ten sam mechanizm `arrange()` + jeden commit |
| I.6 | Undo/redo ≥20 kroków, siatka = 1 krok | ✅ | Bufor 30 operacji; Ctrl+Z po siatce 5 elem. cofnął WSZYSTKIE naraz (audyt `archiwizacja_elementow {liczba:5}`); undo/redo drag/resize/align zweryfikowane pomiarem px (wróciły dokładnie) |
| I.7 | Ctrl+C/V | ✅ | Kopiuj OKN-99 → wklej (offset +0.02) → formularz → KOPIA-2 zapisana → Delete z potwierdzeniem → archiwum |
| I.8 | Zoom do kursora / pan / dopasuj / 100% / współrzędne | ✅ | Kółko zoom do kursora (matematyka punktu stałego), pan środkowym/Spacja, przyciski Dopasuj/100%, wskaźnik `0.417 · 0.640 · 100%` widoczny na zrzutach |
| I.9 | Nie-admin odrzucony na zapisie geometrii (backend) | ✅ | SUROWE odpowiedzi (pytest iter14): brygadzista POST /views/{vid}/elements → **403** `{"detail":"Brak uprawnień / Insufficient role"}`; batch → 403; batch-archive → 403; worker i contractor → 403; PUT /elements/{id} z pozycja_x jako foreman → **403** `Edycja geometrii tylko dla administratora`; z samym `opis` → 200 (naprawa duplikatów działa dalej) |
| I.10 | Telefon: edytor NIEOBECNY | ✅ | `view/[id].tsx`: tryb edycji, editBar i modal „Dodaj element" USUNIĘTE z kodu mobilnego; ścieżka edytora renderowana wyłącznie przy `Platform.OS==="web" && rola==="admin"`; foreman na web (ta sama ścieżka co natywna) — editor-stage NIEOBECNY (iter14 PASS) |
| I.11 | Odbiory działają na prostokątach | ✅ | Foreman: „Odbiory" → tap w prostokąt OKN-99 → zaznaczony → „Odbierz (1)" → status `odebrany` + `odebral_id` w bazie; cofnięte przez `unreceive` (iter14 PASS) |
| I.12 | Punkty (regresja) działają | ✅ | Punkt TEST-PT-1: pinezka renderowana, tap → arkusz szczegółu → oś czasu (iter14 PASS); tworzenie punktu w edytorze web — narzędzie „Punkt" |
| I.13 | Wydajność 200+ prostokątów | ✅ | Widok „PERF 200" (200 prostokątów): web admin ładowanie 1296 ms, zoom płynny, bez crasha; mobile path: dokładnie 200 `shape-*` (iter14 PASS). Metoda: `React.memo` na kształt (brak re-renderu 200 elementów przy ruchu kursora), zwykłe View bez SVG |
| I.14 | Audyt: 1 wpis na operację zbiorczą | ✅ | `powielanie_elementow {liczba, kody}`, `edycja_geometrii {liczba}`, `archiwizacja_elementow {liczba}`, `przywrocenie_elementow {liczba}` — po jednym wpisie; pojedyncze utworzenie: `utworzenie_elementu` |
| I.15 | PL/EN kompletne | ✅ | 37 nowych kluczy ×2 języki; przełączenie na EN → toolbar „Select/Rectangle/Duplicate in grid" (iter14 PASS); skrypt kontrolny: 306/306 kluczy, 0 duplikatów |
| I.16 | Zero wartości liczonych z geometrii w UI | ✅ | Przegląd kodu: geometria używana wyłącznie do rysowania i pozycji środka; żadnych pól powierzchni/długości nigdzie |

## Dopiski (warstwa procesowa)
1. **versionCode**: patrz PF.1 — raportuję fakty: app.json 132; binarka = wynik buildu EAS (właściciel odczyta z panelu).
2. **Egzekwowanie na backendzie**: tworzenie elementów i WSZYSTKIE operacje geometrii = wyłącznie admin (`require("admin")`); brygadzista zachował: naprawę kodów/typów/opisów (PUT bez pól geometrii), odbiory, unreceive.
3. **Nowe endpointy** (wszystkie admin, wszystkie soft): `POST /views/{vid}/elements/batch` (walidacja CAŁEJ serii przed insertem, limit 500), `PUT /elements/batch-geometry`, `POST /elements/batch-archive`, `POST /elements/batch-restore` (409 gdy kod zajęty przez nowszy element). Zero twardych DELETE.
4. **Sesja web**: web używa `src/utils/storage/index.web.ts` (localStorage) — niezależna od SecureStore na telefonie; równoległa praca web+telefon bez interferencji.

## Wykryte i naprawione podczas weryfikacji (uczciwy zapis)
1. **Remount przycisków toolbara** — komponenty definiowane w renderze → przerwany cykl kliknięcia przy ruchu myszy. Naprawa: komponenty na poziomie modułu.
2. **Stale closures** w listenerach klawiatury (Ctrl+C/V/Z działały na stanie z pierwszego renderu). Naprawa: wzorzec `actionsRef` (zawsze świeże funkcje).
3. **Natywny drag obrazka `<img>`** — przeglądarka porywała strumień myszy po pierwszym ruchu (drag&drop obrazu), przez co przesuwanie/resize ucinały się po ~6 px. Naprawa: `e.preventDefault()` na mousedown + `pointerEvents="none"` na obrazie. Po naprawie pomiary px idealne (drag +60→+60, resize +36→+36, undo wraca 1:1).

## Załączniki obowiązkowe
- **Z1 surowe odpowiedzi 403**: pytest `/app/backend/tests/test_runda2_r2.py`, JUnit `/app/test_reports/pytest/iter14_runda2.xml`; przykład: `POST /api/views/{vid}/elements` (foreman) → 403 `{"detail":"Brak uprawnień / Insufficient role"}`.
- **Z2 audyt**: wpisy w `audit_log` (baza preview): `powielanie_elementow {liczba:5, kody:[OKN-10..14]}`, `powielanie_elementow {liczba:200}`, `edycja_geometrii {liczba:1}`, `archiwizacja_elementow {liczba:5}`.
- **Z3 dane testowe w preview**: projekt **TEST_R2_EDITOR** → folder „Elewacje" → widok „Elewacja płd." (OKN-01, OKN-99 + rastrowa makieta elewacji) i widok „PERF 200" (200 prostokątów P-001..P-200). Zostawione do Twojej inspekcji.
- **Z4 raporty testów**: `/app/test_reports/iteration_14.json` (backend 9/9, frontend flows PASS) + weryfikacja przeglądarkowa 4 przepływów myszy przez agenta głównego (pomiary px w logach czatu).
- **Z5 adres web (preview)**: `https://app-builder-11766.preview.emergentagent.com` → login admin → Projekty → TEST_R2_EDITOR → Modele → Elewacje → „Elewacja płd.". Adres PRODUKCYJNY web: do potwierdzenia po Publish (zaakceptowane przez właściciela w czacie).

## Ograniczenia znane
- Weryfikacja dotykowa (48dp, pinch-zoom na prostokątach) — do potwierdzenia na S24 FE po buildzie; ścieżka kodu identyczna z web-foremanem, która przeszła testy.
- „Stała grubość ramki" na telefonie aktualizuje się po zakończeniu gestu pinch (nie w trakcie) — kompromis wydajnościowy dla 200+ kształtów (bez SVG); na web grubość stała w pełni.
