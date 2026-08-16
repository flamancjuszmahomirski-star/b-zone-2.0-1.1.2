# SPRAWOZDANIE — RUNDA 1.3 (v1.0.9)

## 0. Kontra-audit (poprawki przed publikacją)
1. **E3**: potwierdzone — `setPendingUri(asset.uri)` zaginęło przy edycji; DODANE zaraz po wyborze zdjęcia, przed kompresją/uploadem. Ścieżka: zdjęcie → miniatura natychmiast + „Wysyłanie…" → po uploadzie nakładka znika (finalna miniatura z serwera).
2. **B6 strażnik**: `(tabs)/_layout.tsx` → `if (user?.must_change_password) return <Redirect href="/change-password" />` — deep-link do dowolnej karty nie ominie przymusu.
3. **C2b**: gałąź `Sharing.isAvailableAsync() === false` → jawny komunikat (decyzja: plik POZOSTAJE w cache aplikacji, komunikat błędu „Plik pobrano, ale to urządzenie nie obsługuje udostępniania — eksport pozostał w pamięci aplikacji. Użyj wersji web."). Żadna ścieżka nie kończy się ciszą.
4. **versionCode — FAKTY**: poprzednia binarka = **126** (nie 125 jak deklarował raport — rozjazd wynika z auto-inkrementacji EAS przy buildzie). app.json ustawione na **127**, aby build był zawsze > zainstalowanego 126 (Android odmawia aktualizacji przy wersji ≤). Faktyczny versionCode zbudowanego APK odczytaj z panelu buildu po Publish — jeśli EAS auto-inkrementuje, może być wyższy niż 127; wartość z app.json jest wtedy tylko dolną granicą. Ja nie buduję binarki — build wykonuje platforma przy Publish.


## 1. Status punktów

| Punkt | Status | Szczegóły |
|---|---|---|
| A1 magazyn plików | ✅ ZROBIŁEM | Emergent Object Storage (zaakceptowane). Upload → `b-zone-2.0/uploads/{userId}/{fileId}`. Odczyt: storage → fallback dysk (stare rekordy) → `status:"utracony"` + HTTP 410. Jednorazowy sweep sierot przy starcie (preview: 4 stare rekordy sprawdzone, 0 sierot — produkcja wykona własny sweep przy redeployu i zaloguje liczbę). UI: komunikat „Plik utracony" zamiast czarnego prostokąta. |
| A2 partial update projektu | ✅ ZROBIŁEM | `PUT /projects/{id}` używa `exclude_unset=True` — pola niewysłane nie są nadpisywane. Test: PUT tylko `{nazwa}` → vat_tryb/terminy/dni_tyg nietknięte. |
| B3 hasło w modalu | ✅ ZROBIŁEM | Hasło generuje BACKEND (`secrets`, 16 znaków, alfabet bez mylących znaków) — krypto-losowość bez nowych zależności natywnych. Modal z hasłem (selectable), „Kopiuj", „Zamknij" + info o wymuszonej zmianie. Błąd backendu → widoczny komunikat. |
| B5 lockout + rate-limit | ✅ ZROBIŁEM | Login: licznik `failed_logins` w bazie, 5 prób → `locked_until` +15 min → HTTP 423 (nawet z poprawnym hasłem). Reset po udanym logowaniu. Rejestracja: 3/h/IP → HTTP 429 (licznik in-memory — wystarczające anty-spam, restart czyści). Zweryfikowane: [401×5, 423], poprawne hasło w blokadzie → 423, po odblokowaniu → 200. |
| B6 zmiana hasła | ✅ ZROBIŁEM | Profil → wiersz „Zmień hasło" → ekran change-password (pole „stare hasło" wymagane przy dobrowolnej zmianie). Przymus przy 1. logowaniu zweryfikowany (redirect działa). |
| B7 | — NIC (zgodnie z decyzją) | |
| C2b eksport Android | ✅ ZROBIŁEM | `expo-file-system/legacy` (downloadAsync z nagłówkiem auth do cache) + `expo-sharing` (arkusz udostępniania). Toast sukcesu dopiero PO zapisaniu/udostępnieniu; błąd → „Zapis eksportu nie powiódł się". Web bez zmian. |
| C3 pogoda | ✅ ZROBIŁEM (diagnoza + fix) | Diagnoza: pogoda pobierana z adresu projektu (geokodowanie Open-Meteo). Puste pole = projekt bez adresu / geokodowanie nieudane / API zwróciło dane bez temperatury. Fix: backend odrzuca dane częściowe (brak temp → brak stempla), frontend ukrywa kartę gdy `temp == null`. Bez temperatury stempel nie ma wartości dowodowej. |
| C4 czytelne błędy 422 | ✅ ZROBIŁEM | `detailToMessage()` w client.ts — listę Pydantic zamienia na `pole: komunikat`. Zweryfikowane na loginie: „email: value is not a valid email address…" zamiast `[object Object]`. |
| D klawiatura/nakładanie | ✅ ZROBIŁEM | `softwareKeyboardMode: adjustResize` (app.json). Pasek kart: wysokość bazowa + `insets.bottom` (koniec nakładania na gesty/przyciski systemowe). Modale z polami (users, dodaj-element) → KeyboardAvoidingView. Formularze (login, rejestracja, raport, usterka, dostawa, projekt, hasła) już miały KeyboardAwareScrollView + przyklejoną stopkę — tabela niżej. |
| E1b audyt ról | ✅ ZROBIŁEM | POST /reports i POST /extra-hours → role bez contractor. Znalezione i załatane luki: DELETE /deliveries (brak kontroli właściciela!), POST /register-push (brak auth!). Tabela niżej. |
| E2 sumy tygodniowe | ⏸ ODŁOŻONE (decyzja właściciela) | Etap 3 zmieni model godzin — implementacja teraz = podwójna praca. |
| E3 miniatura zdjęcia | ✅ ZROBIŁEM | Miniatura z lokalnego URI pojawia się NATYCHMIAST po zrobieniu zdjęcia, z nakładką „Wysyłanie…" + spinner; znika po uploadzie (zastępuje ją finalna). |
| E4 audyt komunikatów | ✅ ZROBIŁEM | Wszystkie `catch` gubiące detail backendu naprawione (project/[id], delivery-new, folder/[id], profile) → `e.message \|\| error_generic`. |
| E5 dyktowanie — inwentarz | ✅ ZROBIŁEM | Pola Z mikrofonem: raport-opis, raport-godziny-extra-opis, usterka-opis, dostawa-opis. BEZ mikrofonu (celowo — dane strukturalne): kody elementów, e-maile, hasła, liczby/godziny, nazwy projektów. VoiceRecorder ma jawne stany: idle/nagrywanie/transkrypcja/błąd (tekst zachowany przy błędzie — z Rundy 1.1). |
| E6 Whisper w prod | ✅ ZROBIŁEM (narzędzie diagnostyczne) | `GET /api/admin/health` zwraca teraz `llm_key_configured: true/false` + statystyki plików. Po redeployu sprawdź to pole na produkcji — jeśli `false`, klucz nie został przeniesiony do środowiska prod. |
| G1 blockedPermissions | ✅ ZROBIŁEM | SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE zablokowane w app.json. |
| G2 CORS | ✅ ZROBIŁEM | Wybór: **wyłączenie credentials** (allow_credentials=False). Uzasadnienie: JWT idzie w nagłówku Authorization, nie w cookies — credentials nigdy nie były potrzebne; zawężenie originów groziłoby zablokowaniem podglądu web/Expo Go, a bez credentials `*` jest bezpieczne. |
| G3 martwy PIN | ✅ ZROBIŁEM | Przełącznik usunięty z profilu (nic nie robił). |
| H1 martwy nudge push | ✅ ZROBIŁEM | Wybór: USUNIĘTY (kod liczył czas, nic nie pokazywał). Właściwe pytanie o uprawnienia i tak jest przy logowaniu. |
| H2 „Harmonogram wkrótce" | ✅ ZROBIŁEM | Kafelek + klucz tłumaczenia usunięte. |
| H3 kafelek Dostawy | ✅ ZROBIŁEM | Dashboard brygadzisty: wartość = LICZBA aktywnych dostaw projektu, etykieta „Dostawy". |
| H4 st_zatwierdzone | ✅ ZROBIŁEM | Klucz dodany (PL/EN), duplikat `new_password` usunięty (0 duplikatów kluczy — zweryfikowane skryptem). |
| H5 i18n literały | ✅ ZROBIŁEM | Dni tygodnia, „od"/„do", hint adresu, placeholder e-maila, `toLocaleDateString` wg języka (dashboard + godziny), „tys."/„k" w formatCurrency. |
| H6 martwe endpointy | ✅ ZROBIŁEM (1+2 wdrożone) | Tabela decyzji niżej. |
| H7 element → zrzut | ✅ ZROBIŁEM | Ekran elementu: „Pokaż na zrzucie" → widok z `?focus=` → auto-zoom 2× i wycentrowanie, marker z białą obwódką 3px, arkusz szczegółu otwarty. Odbiory: ikona celownika przy wierszu → ekran elementu (bez przełączania checkboxa). Raport → chip elementu → oś czasu → „Pokaż na zrzucie". |
| PF wersja | ✅ ZROBIŁEM | app.json: version 1.0.9, versionCode 125. |

## 2. Zmienione pliki → co → weryfikacja

| Plik | Zmiana | Weryfikacja |
|---|---|---|
| backend/server.py | A1 (storage put/get/sweep, upload/download), A2, B3 (secrets), B5 (lockout+rate-limit), C3, E1b (role+łaty), G2, health+ | pytest (agent testujący, 10/10 po poprawce B5) + testy ręczne curl |
| frontend/app.json | 1.0.9 / 125, adjustResize, blockedPermissions | inspekcja |
| app/(tabs)/_layout.tsx | pasek kart + insets.bottom | web preview + właściciel na urządzeniu |
| app/users.tsx | B3 modal hasła + KeyboardAvoidingView | agent testujący (iter13) |
| app/profile.tsx | G3 usunięty PIN, B6 wiersz „Zmień hasło", E4 | agent testujący (iter12) |
| app/view/[id].tsx | H7 focus/zoom/highlight, A1.4 fallback obrazu, klawiatura w modalu | agent testujący (iter13) |
| app/element/[id].tsx | H7 „Pokaż na zrzucie", H6.1 „Cofnij odbiór" (admin/foreman, powód wymagany) | agent testujący (iter13) |
| app/receipts/[projectId].tsx | H7 ikona celownika | agent testujący (iter13) |
| app/report-new.tsx | H6.2 tryb edycji (?edit=), prefill, PUT | agent testujący (iter13) |
| app/report/[id].tsx | C3 (ukrycie pustej pogody), H6.2 przycisk „Edytuj" | agent testujący (iter13) |
| app/(tabs)/index.tsx | H2, H3, H5 | agent testujący (iter13) |
| app/(tabs)/more.tsx | C2b eksport natywny | code review + web PASS; arkusz udostępniania — do potwierdzenia na urządzeniu |
| app/(tabs)/hours.tsx, project-form.tsx, login.tsx | H5 | inspekcja + web |
| app/_layout.tsx | H1 usunięty nudge | inspekcja |
| src/api/client.ts | C4 detailToMessage | agent testujący (iter12) |
| src/components/PhotoStrip.tsx | E3 miniatura natychmiast | code review (kamera wymaga urządzenia) |
| src/i18n/translations.ts | H4, H5, nowe klucze | skrypt kontroli duplikatów: PL/EN po 271 kluczy, 0 duplikatów |
| src/utils/format.ts | H5 tys./k | inspekcja |
| app/project/[id].tsx, delivery-new.tsx, folder/[id].tsx | E4 | inspekcja |

## 3. TABELA D — ekrany (37)

Z KeyboardAwareScrollView + przyklejoną stopką (już wcześniej): login, register, forgot, change-password, report-new, issue-new, delivery-new, project-form.
Naprawione w 1.3: pasek kart (globalnie insets.bottom), modal edycji użytkownika (users), modal „Dodaj element" (view/[id]), adjustResize globalnie na Androidzie.
Ekrany tylko-do-odczytu (listy/szczegóły) mają padding dolny `insets.bottom + xxl` w ScrollView: dashboard, reports, hours, issues, more, projects, project/[id], report/[id], issue/[id], delivery/[id], deliveries, users, audit, pending, element-types, models, folder/[id], element/[id], receipts, profile, fix-duplicates — bez pól tekstowych na dole, brak ryzyka nakładania.

## 4. TABELA E1b — audyt endpointów zapisu (skrót; pełne 64 endpointy w kodzie)

| Endpoint | Przed | Po |
|---|---|---|
| POST /reports | każdy zalogowany | admin/foreman/subcontractor/worker (bez contractor) |
| POST /extra-hours | każdy zalogowany | admin/foreman/subcontractor/worker |
| DELETE /deliveries/{id} | **KAŻDY zalogowany mógł archiwizować cudze!** | autor lub admin/foreman |
| POST /register-push | **BEZ AUTORYZACJI, dowolny user_id!** | auth wymagane, user_id wymuszone = własne |
| PUT/DELETE /reports, /issues, /extra-hours | OK (autor/manager — z Rundy 1.1) | bez zmian |
| Elementy/widoki/foldery/typy/odbiory/unreceive | OK (admin/foreman) | bez zmian |
| Projekty, użytkownicy, audyt, export, health | OK (admin) | bez zmian |
| Godziny (PUT/approve) | OK (admin/foreman) | bez zmian |
| /auth/* (me, change-password) | OK (self-service) | login: +lockout; register: +rate-limit |
| /files POST | każdy zalogowany (celowo: awatary, załączniki dostaw) | bez zmian + object storage |

## 5. TABELA H6 — decyzje

| Endpoint bez UI | Decyzja | Uzasadnienie |
|---|---|---|
| POST /projects/{id}/elements/unreceive | **WDROŻONE** | Przycisk „Cofnij odbiór" na ekranie elementu (admin/foreman, tylko status „odebrany", powód wymagany, wpis w osi czasu). |
| PUT /reports/{id} | **WDROŻONE** | „Edytuj" w szczegółach raportu (autor/admin, tylko PRZED zatwierdzeniem). Formularz prefill, zapis PUT. Godziny extra edytowane osobnym flow (nie w edycji raportu). |
| pozostałe nieużywane | BEZ ZMIAN | Brak endpointów całkiem martwych po powyższym — reszta używana przez aplikację. |

## 6. Znane ograniczenia / do weryfikacji przez właściciela na urządzeniu
- Klawiatura/pasek kart na fizycznym Androidzie (web preview nie odda adjustResize).
- C2b: arkusz udostępniania ZIP na Androidzie (wymaga urządzenia).
- E3: miniatura z kamery (wymaga urządzenia).
- E6: po redeployu sprawdź `GET /api/admin/health` → `llm_key_configured` na produkcji.
- Stare pliki na produkcji: sweep przy starcie oznaczy sieroty jako „utracony" i zaloguje liczbę — nowe uploady są już trwałe.
