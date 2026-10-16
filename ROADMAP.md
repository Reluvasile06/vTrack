# ROADMAP.md — Plan de Dezvoltare Modulară pe Etape (Cursor Composer Guide)

> **Instrucțiune IMPORTANTĂ pentru Cursor Composer:**
> Dezvoltarea aplicației **vTrack** se va executa STRICT pe etapele definite mai jos. 
> **NU treceți la Etapa N+1 până când Etapa N nu este complet implementată, testată și validată de utilizator (Checkpoint).**

---

## 🎯 ETAPA 1: Baza de Date, Identitate, Multi-Tenancy & Stripe SaaS
**Obiectiv:** Implementarea schemei fundamentale, autentificării securizate și panoului B2B Admin.

### Task-uri de Execuție:
1. Rulează migrarea SQL `20261016_init_schema.sql` în Supabase (tabele `profiles`, `organizations`, `organization_members` cu roluri compozite, `missions`, `stripe_customers`, `subscriptions`).
2. Configurează Supabase Auth cu verificare SMS OTP prin **Twilio** și adaugă verificarea unicității numărului de telefon.
3. Construiește **B2B Admin Console** pe Web:
   - Configurare și salvare criptată a cheilor DJI OpenAPI (`X-User-Token`, `X-Project-Uuid`) în Supabase Vault.
   - Creare Edge Function `dji-verify-credentials` pentru testarea conexiunii cu DJI FlightHub 2.
   - Sincronizare subscripții Stripe API și gestionare cote resurse (`max_users`, `max_drones`, `max_vehicles`).
4. Configurare librărie i18n pe Mobil și Web (suport pentru ro, en, es, pt, fr) cu detectare automată a limbii telefonului/browser-ului și comutator manual în setările profilului.
🚦 **CHECKPOINT 1:**
- Testare creare cont mobil cu SMS OTP Twilio.
- Testare comutare roluri compozite (`b2b_admin`, `dispatcher`, `field_operator`).
- Testare validare chei DJI OpenAPI din B2B Admin Console.
- Testare comutare limbi în aplicație (RO, EN, ES, PT, FR) și verificare salvare în profilul utilizatorului.

---

## 🎯 ETAPA 2: Engine Hărți GIS, Tracking GPS Offline & UI Dual Theme
**Obiectiv:** Dezvoltarea modulului de hărți, colectarea datelor de localizare și interfețele grafice.

### Task-uri de Execuție:
1. **Aplicație Mobilă:**
   - Integrare MapLibre GL Native cu suport pentru straturi Standard, Satelit, Topo, Hibrid și Slider Opacitate ($0-100\%$).
   - Implementare Background Location Tracking cu eșantionare la 2.5s și filtru de distanță la **2 metri**.
   - Dezvoltare modul local de stocare (SQLite/WatermelonDB) pentru salvarea offline a punctelor GPS și resincronizare silențioasă în fundal.
   - Dezvoltare ecran **"Gestionare Hărți Offline"** (descărcare tile-uri vectoriale MapLibre `.mbtiles`).
   - Implementare comutator **Dark Tactical Mode / Day Outdoor Mode**.
2. **Dashboard Web Cockpit:**
   - Layout-ul cu 3 panouri restrânse (collapsible).
   - Manager Overlay-uri Custom (GeoJSON/MBTiles) cu scoping Global vs Privat per Organizație.

🚦 **CHECKPOINT 2:**
- Testare mișcare pe mobil și verificare stocare offline în SQLite când conexiunea GSM este oprită, urmată de resincronizare automată.
- Testare încărcare fișier GeoJSON (fond cinegetic/arie protejată) din Web și ajustare opacitate din mobil.

---

## 🎯 ETAPA 3: Misiuni, Colaborare, Alerte SOS & Push-to-Talk (PTT)
**Obiectiv:** Implementarea logicii de misiune, securității ad-hoc și comunicării de urgență.

### Task-uri de Execuție:
1. Implementare Meniu *Quick Join* (Cod 6 caractere + Telefon + PIN 4 cifre), generare cod QR și Deep Links.
2. Implementare creare Pini/POI-uri georeferențiate cu imagini și tag-uri rapide (`#PersoanăRănită`, `#PistăGăsită`).
3. Construiește **Sistemul de Alertă SOS**:
   - Buton SOS mobil (Hold 2 secunde) $\rightarrow$ Trimitere iOS Critical Alert / Android Alarm Channel (trece peste modul Silent).
   - Banner roșu clipitor pe Web Cockpit cu alertă sonoră ce persistă până la apăsarea butonului **"Acknowledge / Preluat"**.
4. Implementare modul **Push-to-Talk (PTT Walkie-Talkie)** audio pe WebSockets/WebRTC.

🚦 **CHECKPOINT 3:**
- Creare misiune ad-hoc B2C, invitare membru secundar prin cod alfanumeric și PIN.
- Testare buton SOS de pe telefon setat pe "Silent" și confirmare sunet de urgență pe Web Cockpit.

---

## 🎯 ETAPA 4: Hardware IoT — DJI OpenAPI, Autonomous Dispatch & Streaming
**Obiectiv:** Integrarea completă a flotei de drone DJI, stațiilor Dock și controlului video live.

### Task-uri de Execuție:
1. **Autonomous Dispatch Edge Function (`dji-autonomous-dispatch`):**
   - Verificări pre-zbor (rază max 10 km Haversine, verificare senzor meteo Dock vânt $<12\text{ m/s}$ și ploaie).
   - Generare dinamică cale WPML și lansare task `immediate` via DJI OpenAPI.
2. **Video & Cockpit Controls:**
   - Redare stream nativ WebRTC DJI (`/live-stream/start`) în **Ferestre Plutitoare (Pop-out Floating Windows)** sau grilaj 2x2.
   - Preluare control (*First-Come, First-Served* + Buton Renunțare + Master Override Dispecer).
   - Joystick virtual + emulare tastatură (`WASD`, `Q/E`, `Space` brake/RTH). Comutare lentile Wide/Zoom/Thermal IR (izoterme).
   - Controale PSDK: Reflector (Searchlight) și Megafon/Difuzor.
3. **Fail-Safe Watchdog Edge Function (`telemetry-watchdog`):**
   - Verificare pierdere telemetrie $>15\text{s} \rightarrow$ Comandă automată `return_home`.
   - Modul **Fleet Health (HMS)**: Afișare cicluri baterie, temp, celule, și buton *One-Click Hot Swap*.

🚦 **CHECKPOINT 4:**
- Simulare decolare dronă din DJI Dock la coordonatele GPS ale mobilului.
- Oprire intenționată telemetrie timp de 15 secunde și confirmare declanșare automată RTH.

---

## 🎯 ETAPA 5: Audit Log, Mission Replay, Export & Politici de Retenție
**Obiectiv:** Trasabilitate imutabilă, analiză post-misiune și rapoarte de conformitate.

### Task-uri de Execuție:
1. Implementare tabelă imutabilă `mission_audit_logs` protejată de trigger PostgreSQL.
2. Construire **Mission Replay Player** pe Web cu Timeline Slider ($1\times, 2\times, 5\times, 10\times$) și traiectorii pe culori unice (`custom_color`).
3. Generare **Raport PDF de Misiune** (Edge Function `generate-pdf-report`) cu matricea de prezență detaliată (ore intrări/ieșiri) și export trasee GPX/KML/GeoJSON.
4. Configurare `pg_cron` pentru retenția datelor (15 zile B2C / 1 an B2B) și alerte zilnice persistente de avertizare ștergere începând cu ziua 30 și ziua 7.

🚦 **CHECKPOINT 5:**
- Închidere misiune, generare raport PDF și verificare matrice de sesiuni prezență.
- Verificare redare Replay cu derulare temporală și export fișiere GPX/KML.
