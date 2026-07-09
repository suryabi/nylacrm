# Mobile App — Backend API Contract

Companion **native Expo/React Native app** for **delivery drivers** and **distributors**.
This is the spec to hand to the Emergent **Mobile Agent** (separate project). The
mobile app consumes the ALREADY-DEPLOYED backend — no backend changes needed to start.

- **Base URL (production):** `https://warehouse-qc-engine.emergent.host`
- **API prefix:** every path below is prefixed with `/api`.
- **Tenant header:** send `X-Tenant-ID: nyla-air-water` on every request (multi-tenant).
- **Auth:** token-based. Login once, then send `Authorization: Bearer <token>` on every request.
  Tokens are opaque session tokens (UUID) with a **7-day** expiry.

---

## 1. Auth (unified for both roles)

### POST `/api/mobile/login`
Body: `{ "identifier": "<email OR phone>", "password": "<password>" }`
- If `identifier` contains `@` → matched as a **staff/distributor** user by email.
- Else (digits) → matched as a **Driver** by phone (last 10 digits).

Response `200`:
```json
{
  "token": "d0f1...uuid",
  "role": "Driver | Distributor | CEO | ...",
  "user": { "id": "...", "name": "...", "email": "...", "phone": "...",
             "role": "...", "distributor_id": "... or null",
             "driver_id": "... or null", "home_screen": "driver|distributor|staff" }
}
```
- `home_screen` tells the app which UI to route to: `driver`, `distributor`, or `staff`.
- Failures return `401 {"detail":"Invalid credentials"}` (no user enumeration) or
  `403` if the account is inactive.

### GET `/api/mobile/me`  (auth)
Returns `{ role, user }` (same `user` shape as login). Use on app launch to validate the stored token.

### POST `/api/mobile/logout`  (auth)
Invalidates the current session token.

---

## 2. Push notifications (Expo)

The backend fans out **every in-app notification** to registered devices via Expo Push
(https://exp.host) — no server key needed. The app must register its Expo push token.

### POST `/api/mobile/push/register`  (auth)
Body: `{ "token": "ExponentPushToken[...]", "platform": "ios|android", "device": "Pixel 8" }`
→ `{ "ok": true }`. Call after `Notifications.getExpoPushTokenAsync()` and on token refresh.

### POST `/api/mobile/push/unregister`  (auth)
Body: `{ "token": "ExponentPushToken[...]" }` → `{ "ok": true }`. Call on logout.

Push payload `data` includes `{ link, kind, category, entity_type, entity_id }` for deep-linking.
Client setup: `expo-notifications` (Android needs an FCM key in EAS; iOS needs APNs via Apple Developer account for standalone builds).

---

## 3. Offline sync

### GET `/api/mobile/sync?since=<ISO-8601>`  (auth)
Role-based delta. Omit `since` for a full snapshot; pass the previous response's
`server_time` as the next `since`.

Response:
```json
{
  "role": "Driver",
  "server_time": "2026-07-09T02:00:00+00:00",
  "notifications": [ ... ],
  "schedules":  [ ... ],   // Drivers only
  "deliveries": [ ... ]    // Distributors only
}
```
Store `server_time` locally as the cursor. Delta relies on `updated_at`/`created_at`;
a record with neither only appears on a full (no-`since`) sync.

Recommended offline strategy: full sync on login → cache in SQLite/AsyncStorage →
incremental `?since=` on foreground → queue mutations (e.g. stop-complete, GPS pings)
and replay when back online.

---

## 4. Driver endpoints (role = Driver)  — prefix `/api/driver`

| Method & Path | Purpose |
|---|---|
| `POST /api/driver/login` | (legacy) phone+password login — prefer `/api/mobile/login` |
| `GET  /api/driver/schedules?on_date=YYYY-MM-DD` | Approved schedules (default: today + tomorrow) |
| `GET  /api/driver/schedules/{schedule_id}` | Schedule detail with stops, addresses, SKU line items |
| `POST /api/driver/schedules/{schedule_id}/start` | Start route (begins GPS window) |
| `POST /api/driver/schedules/{schedule_id}/end` | End route |
| `POST /api/driver/schedules/{schedule_id}/stops/{delivery_id}/complete` | Mark a stop delivered (flips delivery → delivered) |
| `POST /api/driver/tracking/ping` | Push a GPS coordinate `{schedule_id, lat, lng, ...}` |
| `GET  /api/driver/tracking/settings` | GPS ping cadence + config |

Native features: **background GPS** → `expo-location` background task posting to `/tracking/ping`
at the cadence from `/tracking/settings`. **Camera** (proof-of-delivery) → `expo-image-picker`;
upload photos to the delivery/complaint photo endpoints.

---

## 5. Distributor endpoints (user linked via `distributor_id`)

| Method & Path | Purpose |
|---|---|
| `GET  /api/distributor-portal/home` | Dashboard: profile, stock summary, pending counts, outstanding, recent activity |
| `GET  /api/distributor-portal/my-facilities` | Warehouses/locations the user can access |
| `POST /api/distributor-portal/switch-facility` | Switch active facility |
| `GET  /api/distributor-chat/threads` | Chat threads with HQ |
| `GET  /api/distributor-chat/unread-count` | Unread badge count |
| `GET  /api/distributor-chat/distributors/{distributor_id}/messages` | Message history |
| `POST /api/distributor-chat/distributors/{distributor_id}/messages` | Send message |
| `POST /api/distributor-chat/distributors/{distributor_id}/mark-read` | Mark thread read |
| `GET  /api/distributors/{id}/stock-dashboard` | Live stock by SKU / warehouse |
| `GET  /api/distributors/{id}/shipments` | Stock In list (`status`, `location_id` filters) |
| `GET  /api/distributors/{id}/deliveries` | Stock Out / deliveries list |
| `GET  /api/distributor/stock-transfers` | Inter-warehouse transfers |

(Full distributor surface lives in `routes/distributors.py`, `distributor_portal.py`,
`distributor_chat.py`, `distributor_stock_transfers.py`.)

---

## 6. Auth flow summary (mobile client)

1. `POST /api/mobile/login` → store `token` securely (SecureStore).
2. Add `Authorization: Bearer <token>` + `X-Tenant-ID` to an axios/fetch interceptor.
3. `POST /api/mobile/push/register` with the Expo token.
4. Route by `user.home_screen` (`driver` / `distributor` / `staff`).
5. `GET /api/mobile/sync` (no `since`) → cache; then `?since=server_time` incrementally.
6. On 401 → token expired (7 days) → send user back to login.

## 7. Gotchas
- CORS is `*` in production — native clients are unaffected regardless.
- Cookies are set but native apps should rely on the **Bearer token**, not cookies.
- iOS "install from a link" needs an Apple Developer account (TestFlight/ad-hoc);
  Android APK installs directly from a link. Native push/GPS require an **EAS standalone build** (not Expo Go).
