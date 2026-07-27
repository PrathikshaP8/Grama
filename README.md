# GramCare AI v2

Voice-first rural healthcare navigation for Karnataka — **ASHA-led village-wide registration**, unique health IDs + QR, bilingual (Kannada/English) assistant, and hospital QR scan for instant medical context.

> **Aadhaar disclaimer (required for judges):** Patient login uses a **demo/hackathon simulation** of Aadhaar-based verification. The platform stores only a **salted hash** of the Aadhaar number and shows **last 4 digits** in the UI. This is **not** UIDAI-authorized integration.

## Stack

- **Client:** React + Vite PWA, Tailwind v4, react-i18next (Kannada default)
- **Server:** Express + TypeScript + MongoDB (Mongoose)
- **AI:** Gemini Live API config + guided voice/text triage with confirmation-gated booking
- **Security:** bcrypt (cost 12), OTP (hashed, TTL), JWT access + httpOnly refresh, field encryption, hash-chained audit log

## Quick start

```bash
# 1. Prerequisites: Node 20+, MongoDB running locally (or set Atlas URI)
cp .env.example .env
# Edit .env — set MONGODB_URI and optionally GEMINI_API_KEY

npm install
npm run seed
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:4000/api/health  

## Seed credentials

| Role | Login | Password / Aadhaar |
|------|--------|---------------------|
| ASHA | `asha@gramcare.in` | `GramCare@2026` |
| Hospital | `hospital@gramcare.in` | `GramCare@2026` |
| Patient | Name `Ramesh Kumar` | Aadhaar `123456789012` |
| Patient | Name `Savitha Bai` | Aadhaar `234567890123` |

In development, OTP is returned in the API/UI response (`demoOtp`) and logged to the server console.

## Core flows

1. **ASHA registration** — Register every resident (name, Aadhaar, phone, blood group, address) → unique ID (`MNG01`…) + QR (encodes ID only) + baseline history + village coverage metric.
2. **Patient login** — Name + Aadhaar → OTP to linked phone → dashboard (voice or manual).
3. **Voice assistant** — Symptom capture → severity questions → urgency band + disclaimer → book only after yes/ಹೌದು.
4. **Hospital dashboard** — Doctor availability board + QR/ID scan → meds, conditions, vitals.
5. **Facility finder** — Nearby hospitals (gov/private), specialty recommendation with alternative.

## Unique ID rules

- Lookup table: Mangalore→`MNG`, Hassan→`HSN`, Mysore→`MYS`, Udupi→`UDP`, Bengaluru→`BLR`
- Unlisted towns: first 3 consonants (or `RUR` fallback) + zero-padded sequence
- QR payload = unique ID only; backend resolves profile after auth

## Environment

See [`.env.example`](.env.example). Important keys:

- `MONGODB_URI`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `AADHAAR_PEPPER` / `FIELD_ENCRYPTION_KEY`
- `GEMINI_API_KEY` (optional — enables Live key proxy; otherwise guided triage + Web Speech API)
- `CLIENT_ORIGIN=http://localhost:5173`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + PWA concurrently |
| `npm run seed` | Reset demo data |
| `npm run build` | Production build |

## Project layout

```
server/src/   models, routes, auth, uniqueId, QR, audit, recommend
client/src/   i18n, dashboards (patient / asha / hospital), voice, AR stub
```

## Live dashboard synchronization

MongoDB is the single source of truth. After mutations, the Express server emits Socket.IO events; clients refetch.

| Event | When | Rooms |
|-------|------|-------|
| `doctor:availability_changed` | Hospital patches doctor status | `role:patient`, `specialty:*`, facility |
| `slot:updated` | Slot booked/freed/upserted | patients + facility |
| `appointment:created` | Patient books | hospital + patient |
| `appointment:updated` | Hospital confirms/cancels | hospital + patient |
| `patient:updated` | ASHA register / hospital visit | asha/patient |

**Registered location:** Recommendations default to the patient's ASHA-saved `village`/`city`/`lat`/`lng`. Temporary geolocation is opt-in only and never overwrites the permanent address.

**Slot races:** `AppointmentSlot` is claimed with `findOneAndUpdate({ status: 'open' })` — concurrent bookings get `409 SLOT_TAKEN`.

### Demo script (live sync)

1. `npm run seed` then `npm run dev`
2. Patient: Ramesh Kumar / `123456789012` → Hospitals → Recommend **General Physician**
   - Expect **KMC** (farther, available) over **Belman PHC** (nearby, Dr. Priya unavailable)
3. Hospital tab: `hospital@gramcare.in` → set **Dr. Priya Shetty** → Available
4. Patient toast: “Doctor availability updated” → recommendation flips to **Belman PHC**
5. Patient books an open slot → Hospital “Appointment requests” shows it → Confirm → Patient status **confirmed**

See architecture notes in completion response for collections and APIs.

## Compliance notes

- No disease diagnosis from AI — urgency bands only, with disclaimer
- Passwords hashed with bcrypt cost ≥ 12
- OTPs hashed, single-use, rate-limited
- Audit log is hash-chained (tamper-evident), not a public blockchain
- AR symptom capture is a framing + blur-reject stub for future vision models
- Aadhaar is a demo hash simulation — not UIDAI integration
