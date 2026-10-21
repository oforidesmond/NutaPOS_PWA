# NutaPOS Staff PWA — phased build prompt

This document is the handoff for building an offline-first Progressive Web App that behaves like the NutaPOS Staff mobile app (version 2.5.0). The Expo app in C:\Users\Admin\OneDrive\Desktop\developer\NutaPOS_Staff is the source of truth. The PWA is a new project. Do not convert that repo into a web app, and do not change its API.

Build one phase at a time. Later phases assume the earlier acceptance checks already pass.

Create the PWA as a sibling of the mobile app repo:

`../NutaPOS_Staff_PWA`

Do not put the PWA inside `NutaPOS_Staff`.

## Shared preamble

These rules apply to every phase. Read them at the start of every session.

### Product

NutaPOS Staff is an offline-first cashier. One staff member signs in, the browser installation is bound, the catalog and org settings are stored locally, and sales are written locally and uploaded later. Returns are online-only. There is no staff role or permission gate. Every signed-in screen is available to every staff user.

Currency shown in the cart UI is hardcoded `GHS`. The sale payload uses `organization.currency`, or `GHS` when that field is missing. Categories are stored and never shown. There is no category picker.

### Stack (locked)

- Vite + React + TypeScript + React Router.
- Installable PWA via `vite-plugin-pwa` (Workbox). Manifest name `NutaPOS Staff`, `display: standalone`, `background_color` and `theme_color` `#ffffff`. Light UI only. No dark theme.
- Local database: IndexedDB via Dexie. Schema is the final mobile schema after migrations v1–v9 (below). Do not replay SQLite `ALTER`s. Comment in the schema file that it matches `nutapos_staff.db` at `PRAGMA user_version` 9.
- Small prefs store in the same Dexie database for values the mobile app keeps in MMKV.
- HTTP: a single client equivalent to `src/api/client.ts`. Timeout 60 seconds. `Content-Type: application/json` except multipart backup upload. Every authenticated call sends `Authorization: Bearer <access>`.
- Env: `VITE_API_URL` (origin, no trailing slash) and `VITE_API_PREFIX` (default `/api/v1`). Same meaning as `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_API_PREFIX` in `src/lib/env.ts`. There is no Android emulator host rewrite.
- `getApiV1BaseURL()` = origin + prefix. Paths under v1 use that base. `GET /time` is on the origin only (`buildRootPath`), outside `/api/v1`.
- Unit tests: Vitest. When a phase ports a rule, port the matching tests under `src/**/*.test.ts` in this repo. Do not rewrite the assertions.

### Same backend

Port request and response shapes from `src/api/*`. Do not add endpoints, rename fields, or invent a BFF.

- Sale upload stays `POST /staff/sales`.
- Returns stay `POST /staff/returns` and are online-only.
- Do not call `/staff/inventory-events` or `/staff/stock-adjustments`. The server writes stock and ledger rows when `POST /staff/sales` and `POST /staff/returns` succeed. Local stock is a cache for offline UX.
- Read `docs/MOBILE_LIFECYCLE_ALIGNMENT.md` before any sale or return work. `branchId` is not required on the sale body; the server uses JWT `activeBranchId`. Still send `branch_id` on temporary-item and return bodies, as the mobile app does.

If `VITE_API_URL` is empty, block login with a clear message. Do not call the network.

### Local database (final shape)

Dexie tables. Integer flags are `0 | 1`, matching SQLite. Quantities and stock are numbers with 3 decimal places. Money is a number with 2 decimal places.

**products**

| Field | Notes |
| --- | --- |
| `id` | primary key, string |
| `barcode` | unique, nullable |
| `sku` | nullable, indexed |
| `name` | required, indexed |
| `price` | number |
| `cost_price` | number, nullable |
| `stock_quantity` | number, default 0 |
| `category_id` | string, nullable |
| `is_temporary` | 0 or 1 |
| `synced_at` | ISO string, nullable |
| `updated_at` | ISO string, required |
| `auto_convert_json` | stringified JSON, nullable |

Indexes: `barcode`, `sku`, `name`.

**sales**

| Field | Notes |
| --- | --- |
| `id` | primary key |
| `total_amount`, `tax_amount`, `discount_amount` | numbers; tax and discount default 0 |
| `payment_method` | string, nullable |
| `sold_at` | ISO, device time |
| `synced_at` | ISO, null until upload |
| `staff_id` | required |
| `branch_id` | nullable |
| `is_return` | 0 or 1, default 0 |
| `original_sale_id` | nullable, points at `sales.id` |
| `receipt_number` | nullable, indexed |

**sale_items**

| Field | Notes |
| --- | --- |
| `id` | primary key |
| `sale_id` | required |
| `product_id` | required |
| `quantity` | number |
| `unit_price`, `total_price` | numbers. `total_price` is the pre-tax line subtotal |
| `is_temporary_product` | 0 or 1 |
| `variance_reason`, `variance_note` | nullable strings |

**sync_queue**

| Field | Notes |
| --- | --- |
| `id` | autoincrement |
| `entity_type`, `entity_id`, `operation` | strings. Operation is `CREATE` |
| `payload` | JSON object (mobile stores a JSON string; store an object in Dexie) |
| `status` | default `PENDING` |
| `attempt_count` | default 0 |
| `created_at`, `last_attempt_at` | ISO |
| `last_error` | nullable |
| `failure_id`, `error_code`, `admin_message`, `last_failed_at` | DLQ |
| `resolution_action`, `resolution_status`, `resolved_at`, `admin_applied_sale_id` | admin resolution |

Statuses, not enforced by the database: `PENDING`, `SYNCING`, `COMPLETED`, `FAILED`, `PENDING_SUPER_ADMIN`, `CLEARED_ADMIN`.

**trial_usage** — single row `id = 1`: `sales_count` (default 0), `trial_limit` (default 50), `device_fingerprint_hash` (use `pending_initial_sync` until initial sync), `last_updated`.

**settings** — `key` primary key, `value` string. JSON values are stored as strings, same as SQLite.

Settings keys from `src/db/repositories/settingsRepository.ts`:

- `organization`
- `initial_sync_done` (`'1'` or `'0'`)
- `tax_settings`
- `categories`

**prefs** — `key` primary key, `value` JSON. Replaces MMKV id `nutapos-staff`. Keys used across phases:

- `last_sync_time`
- `last_master_data_pull`
- `last_sync_failure_resolution_pull`
- `default_printer` — `{ transport: 'usb' | 'ble' | 'browser', id: string }`
- `last_backup_date`
- `trial_warning_shown`
- `last_time_check`
- `low_storage_day`
- `installation_id` — stable UUID for this browser profile

Tokens and the user profile also live in Dexie (a `secrets` table or the prefs store). This is weaker than the mobile Keychain. Say that in a short comment next to the store. Do not put tokens in `localStorage` if IndexedDB is available. Do not log tokens.

### Session and device identity

`UserProfile` from `src/services/userProfileStore.ts`:

```ts
{ userId, staffId, branchId, organizationId, needsPasswordChange }
```

Build it the way `AuthContext.normalizeUser` does: `user.id`, `staffProfile.staffId` or `staff_profile`, `branchId`, `organizationId` or `organization_id`. Temporary password is true when any of `isTemporaryPassword`, `is_temporary_password`, `needsPasswordChange`, `needs_password_change` is true.

Login response (`src/types/session.ts`) accepts both `access_token` / `accessToken` and `refresh_token` / `refreshToken`. Missing access token throws `Login response missing access token`.

Device fingerprint (`src/services/deviceFingerprint.ts`), key order fixed because the hash is `SHA-256` hex of `JSON.stringify` in this order:

```ts
{
  installationId, // persisted UUID created once per browser profile
  deviceId,       // same UUID on the web
  model,          // a short readable string, e.g. "Web"
  systemVersion,  // navigator.platform or ua platform
  buildNumber,    // "pwa"
  appVersion      // "2.5.0"
}
```

`deviceUuid` on bind and on sale `deviceInfo` is `installationId`. `SaleDeviceInfo`:

```ts
{ deviceUuid, model?, systemVersion?, appVersion?, fingerprintHash? }
```

### Design

Match the shipped staff app, not the looser marketing values in `DESIGN_LANGUAGE.md`. Tokens:

- Brand `#1e5aff`, pressed `#1746cc`, ring `rgba(30,90,255,0.12)`.
- Page `#fafafa` (zinc50), cards white, borders `#f4f4f5` / hairline `#e4e4e7`.
- Text zinc900 `#18181b` down to zinc400 `#a1a1aa`.
- Error `#b91c1c` on `#fef2f2`, border `#fecaca`. Success `#15803d`. Warn `#ca8a04`. Offline icon `#a1a1aa`.
- Inter 400, 500, 600. Type scale from `src/theme/typography.ts` `text` (large title 32/38 through caption 12/16).
- Spacing: 4, 8, 12, 16, 24, 32. Radii 12, 16, 20, 24. Buttons min height 52, radius 20. Variants: primary, secondary, ghost, danger outline.
- Glass header: light translucent bar, blur, 1px zinc200 hairline, connection icon (online / poor / offline).

Phone (under 768px): one column, horizontal padding 16, the same order as `app/pos.tsx`. Tablet and desktop (768px and up): the same flows, with a split POS — catalog and search on one side, cart and checkout on the other. Do not invent a sidebar product that the mobile app does not have. Light theme only.

Empty states, skeletons, and toasts should feel like the mobile app. Use a toast for failures. Do not use `alert()` for routine errors.

### Standing rules

- Read the source files named in the phase before writing code. If this document and the source disagree, follow the source and note the difference in the phase summary.
- Implement only the phase you were asked for. Do not start the next phase.
- Do not stub a current-phase feature with fake success, empty handlers, or `TODO` comments. A placeholder route from an earlier phase is fine until the phase that fills it.
- If a later phase needs a hook, add the smallest real extension inside the current phase and say so. Example: Phase 3 may render a sale-complete sheet that only has **Not now**. Phase 4 adds **Print receipt** to that sheet.
- Do not invent business rules. Copy them from the named files.
- Service-worker cache is for the app shell (HTML, JS, CSS, fonts, icons). Do not cache API GET responses as the source of truth. Catalog, sales, and settings live in IndexedDB.
- The sync worker runs only while the app is open and online. That matches the mobile app, which has no background task. The Background Sync API may wake an upload when the browser supports it, but the in-app worker is still required.
- Out of scope for the whole project: Android APK self-update, the USB OTG native module, API changes, dark mode, a category browser, printing a return as its own slip, reports, and Z-reports.

### Routes

| Path | Mobile file | Filled in |
| --- | --- | --- |
| `/` | `app/index.tsx` | Phase 2 session router. Phase 1 may render a splash shell. |
| `/login` | `app/login.tsx` | Phase 2 |
| `/change-password` | `app/change-password.tsx` | Phase 2 |
| `/pos` | `app/pos.tsx` | Chrome in Phase 1, cashier in Phase 3 |
| `/scanner` | `app/scanner.tsx` | Phase 3 |
| `/product-search` | `app/product-search.tsx` | Phase 3 |
| `/returns` | `app/returns.tsx` | Phase 5 |
| `/sales-history` | `app/sales-history.tsx` | Phase 4 |
| `/settings` | `app/settings.tsx` | Shell in Phase 1, sync actions in Phase 5, rest in Phase 6 |
| `/backups` | `app/backups.tsx` | Phase 6 |
| `/printer-settings` | `app/printer-settings.tsx` | Phase 4 |
| `/notifications` | `app/notifications.tsx` | Phase 6 |
| `/sync-failures` | `app/sync-failures.tsx` | Phase 5 |

---

## Phase 1 — App shell, design system, local database

### Goal

An installable PWA with the staff visual language, every route rendering real chrome, and an IndexedDB database that opens on the final schema. No login and no catalog.

### In scope

- Scaffold Vite, React, TypeScript, React Router, and `vite-plugin-pwa`. Dev server, production build, and Vitest all run.
- `.env.example` with `VITE_API_URL=` and `VITE_API_PREFIX=/api/v1`.
- PWA manifest and icons (a simple wordmark or the existing app icon if you copy it from this repo). Workbox precaches the shell so a second load works offline after one online visit. Register the service worker in production. In dev, document how to verify the offline shell (`vite preview` or the plugin's dev mode).
- Theme module ported from `src/theme/colors.ts`, `src/theme/spacing.ts`, `src/theme/fonts.ts`, and the `text` scale in `src/theme/typography.ts`. Load Inter.
- Shared chrome: `Screen` (zinc50, horizontal 16), `GlassHeader` (title, optional back, trailing slot, connection icon), `Button`, `TextField`. Connection icon reads `navigator.onLine` and updates on `online` / `offline` events. Do not call the API to decide online state in this phase.
- Responsive frame: under 768px, a single phone column capped at a comfortable reading width and centered on large monitors when the page is not POS. At 768px and up, `/pos` renders a two-pane frame (left pane and right pane) with placeholder copy. Other routes stay a single column with a max width so they do not stretch edge to edge on a desktop.
- Routes listed above. Each page shows the glass header and one honest empty state such as "Available in a later phase." `/` shows the app name and a primary button that links to `/login`. `/login` shows Staff ID and password fields and a disabled or inert submit button. Do not call the network.
- Dexie database `nutapos_staff` with the tables in the shared preamble. Opening the app creates them. Export a typed repository module with `get` / `set` / `getJson` / `setJson` for `settings`, and get/set for `prefs`. No seed products.
- API client skeleton: `getApiBaseUrl`, `getApiPrefix`, `getApiV1BaseURL`, `buildApiPath`, `buildRootPath`, axios instance with 60s timeout and a Bearer interceptor that reads the access token from Dexie (it may be null). No refresh logic yet. If there is no token, omit the header.

### Out of scope

Login, bind, sync, cart, checkout, printing, notifications, backups, returns. Do not invent sample products.

### Source files

- `src/theme/colors.ts`
- `src/theme/spacing.ts`
- `src/theme/typography.ts`
- `src/theme/fonts.ts`
- `src/lib/env.ts`
- `src/api/client.ts` (shape only: base URL, timeout, auth header)
- `src/db/migrations/v1.ts` through `v9.ts`
- `src/db/repositories/settingsRepository.ts`
- `DESIGN_LANGUAGE.md` (philosophy only; the shipped tokens win)
- `app.config.ts` (name `NutaPOS Staff`, light UI)

### Implementation notes

- Dexie `sync_queue.id` is `++id`. Everything else uses the string ids from the server or `crypto.randomUUID()`.
- `products.barcode` uniqueness: Dexie does not enforce SQL `UNIQUE` the same way. Check before insert and document the helper. Temporary products may have a null barcode.
- Add a one-line schema comment: "Matches NutaPOS Staff SQLite user_version 9."
- Header states: online uses the success color, offline uses zinc400. A "poor" cellular state does not exist on the web; online and offline are enough in Phase 1.
- App shell routes must be reachable with the network disabled after the first production load. API calls are not part of this phase.

### Acceptance checks

1. `npm run dev` opens the app. `npm run build` succeeds. `npm test` runs (a smoke test that the database module opens is enough).
2. The manifest is valid. After one production load, reloading with the network disabled still shows the shell.
3. Every route in the table renders a header and an empty state. No route is blank.
4. IndexedDB `nutapos_staff` contains `products`, `sales`, `sale_items`, `sync_queue`, `trial_usage`, `settings`, and `prefs`.
5. Going offline and online flips the header icon without a refresh.
6. `/pos` is one column on a narrow viewport and two panes at 768px and wider.
7. No request is sent to `VITE_API_URL` during this phase.

**Prompt the agent with:** Implement Phase 1 only, from `docs/PWA_AGENT_PROMPT.md`. Follow the shared preamble. Stop when the Phase 1 acceptance checks pass.

---

## Phase 2 — Login, device bind, initial sync

### Goal

A staff member can sign in. POS stays blocked until the device is bound and the catalog is stored locally. Refresh keeps the session. Logout returns to login without deleting sales or products.

### In scope

- `POST /auth/staff/login` with `{ staffId, password }`. Store access and refresh tokens. Persist `UserProfile`. Wrong credentials (HTTP 401 or 403) show "Incorrect Staff ID or Password." Empty fields are blocked before the request. Missing `VITE_API_URL` is blocked before the request.
- Password change screen. Fields: current, new, confirm. New password length at least 8. Confirm must match. `POST /auth/staff/change-password` with `{ currentPassword, newPassword }`. On success set `needsPasswordChange` to false and go to `/` so bind and sync can run.
- Token refresh, ported from `src/api/client.ts` and `src/services/tokenRefreshScheduler.ts`:
  - Reactive: one retry on HTTP 401. Single-flight `POST {origin}{prefix}/auth/refresh` with `{ refresh_token }`. Store the new access token only. Retry the original request. On refresh failure, reject the 401 and do not clear tokens.
  - Proactive: every 10 minutes while a user exists. Then update `branchId` from the new access token.
- After login or refresh, decode the JWT payload (do not verify the signature) and copy `activeBranchId` onto `profile.branchId` using the rules in `src/lib/jwtClaims.ts`. `undefined` means the token could not be decoded; leave `branchId` unchanged. `null` or a non-empty string replaces it.
- Installation id: create a UUID once, store it in prefs `installation_id`, and reuse it. Build the fingerprint and `fingerprintHash` as specified in the preamble.
- Bind once per login until logout. `POST /auth/staff/bind-device` with:

```ts
{
  deviceFingerprint: { installationId, deviceId, model, systemVersion, buildNumber, appVersion },
  deviceUuid,       // installationId
  fingerprintHash,  // SHA-256 hex of JSON.stringify(fingerprint) in that key order
  timestamp         // ISO
}
```

  On HTTP 400 whose message is `Malformed body` or `Bad Request`, retry once with the fingerprint fields flattened at the top level plus `deviceUuid`, `fingerprintHash`, and `timestamp`. Persist a binding flag. Skip the request when the flag is already set.

- Initial sync, ported from `src/services/initialDataSync.ts`. Prefer `GET /sync/initial-pull`. If that response has no products, fall back, in order, to `GET /staff/inventory`, `GET /staff/pricing`, `GET /staff/settings/tax`, `GET /staff/categories`. Retry each step up to 3 times. Show a blocking overlay: title "Setting up NutaPOS", the step label, a progress bar, and on failure **Retry** and **Back to sign in**. Hardware or browser back must not dismiss the error overlay by navigating away.
  Step labels: "Downloading inventory…", "Fetching prices…", "Loading tax settings…", "Syncing categories…", "Preparing app…".
- Write organization JSON to settings key `organization` when the payload includes it. Write tax settings to `tax_settings`. Write categories to `categories`. Upsert products. Seed `trial_usage` id 1: `trial_limit` from org `salesLimit` or `sales_limit`, otherwise 50; `device_fingerprint_hash` from the fingerprint hash; `sales_count` 0 unless the payload already has a count. Set `initial_sync_done` to `'1'` only after success.
- Session router on `/`, in the spirit of `app/index.tsx`:
  1. No profile → `/login`.
  2. `needsPasswordChange` → `/change-password`.
  3. Not bound, or `initial_sync_done !== '1'` → run bind and initial sync under the overlay.
  4. Success → `/pos`.
- Logout: disconnect nothing yet (socket is Phase 6), clear tokens, clear profile, clear the binding flag, set `initial_sync_done` to `'0'`. Do not delete products, sales, sale items, or the sync queue. There is no server logout call.
- Guard authenticated routes. A missing profile redirects to `/login`. POS is not usable until initial sync has finished.

### Out of scope

Cart, barcode scanning, checkout, printing, the sync worker, master-data polling, returns, notifications, backups. Do not upload sales. Do not pull `GET /staff/master-data` on a timer yet.

### Source files

- `src/api/auth.ts`
- `src/api/client.ts`
- `src/api/deviceApi.ts`
- `src/api/syncAdapter.ts`
- `src/context/AuthContext.tsx`
- `src/services/userProfileStore.ts`
- `src/services/deviceBindingService.ts`
- `src/services/deviceFingerprint.ts`
- `src/services/initialDataSync.ts`
- `src/services/tokenRefreshScheduler.ts`
- `src/lib/jwtClaims.ts`
- `src/types/session.ts`
- `src/types/organization.ts`
- `app/index.tsx`
- `app/login.tsx`
- `app/change-password.tsx`
- `src/components/InitialSyncOverlay.tsx`

### Implementation notes

- Normalize both camelCase and snake_case on login and organization payloads. The mobile app accepts either.
- Store an organization stub in settings when login includes an org id but initial sync has not written the full org yet, matching `AuthContext`.
- Bind and initial sync run only after a real session exists. The overlay is not a marketing screen.
- Product upsert must tolerate the field names used by `normalizeProductsFromInitialPull` and `normalizeProductsFromList` in `src/api/syncAdapter.ts`. Read those functions and copy the mapping. Do not guess product JSON keys.
- Failed initial sync leaves `initial_sync_done` unset so the next open retries. Products partially written may remain; the retry upserts again.
- Logout must not wipe the catalog. The next login runs bind and initial sync again because the binding flag and `initial_sync_done` were cleared.

### Acceptance checks

1. Empty Staff ID or password does not call the API. A wrong password shows "Incorrect Staff ID or Password."
2. A real staff login stores tokens and profile. A temporary password lands on change-password and cannot open POS until the change succeeds.
3. After a successful password (or when no change is required), the overlay runs and products appear in IndexedDB. `initial_sync_done` is `'1'`. Organization and tax settings are stored.
4. Reloading the page keeps the session and opens POS without asking for the password again.
5. A failed initial sync offers Retry and Back to sign in. Back to sign in logs out.
6. Logout returns to login. Products and any sales rows are still in IndexedDB. Signing in again runs setup again.
7. An expired access token refreshes once and retries the request. A failed refresh does not delete the local database.

**Prompt the agent with:** Implement Phase 2 only, from `docs/PWA_AGENT_PROMPT.md`. Follow the shared preamble. Assume Phase 1 acceptance checks pass. Stop when the Phase 2 acceptance checks pass.

---

## Phase 3 — Offline cashier

### Goal

After one successful online setup, a sale can be completed with the network off. The sale, stock change, and sync-queue rows are committed together. Nothing is printed and nothing is uploaded in this phase.

### In scope

**Catalog search.** Port `productRepository.search`. Rank: exact barcode, exact SKU, SKU prefix, name prefix, name contains. Debounce about 180ms. Limit 30. The search screen adds the chosen product to the cart and returns to POS. A "One-off item" action opens the temporary-item sheet with no barcode.

**Barcode.** `/scanner` uses the camera (`BarcodeDetector` when present, ZXing or a similarly small decoder as fallback). Symbologies: EAN-13, EAN-8, Code 128, QR, UPC-A, UPC-E. Debounce repeats of the same code for 500ms. A known barcode calls `addProduct` and returns to POS. An unknown barcode opens the temporary-item sheet in scanned mode. Also accept a keyboard-wedge scanner on POS: characters that arrive quickly, ending in Enter, are treated as a barcode scan. Do not require the search field to be focused if a wedge listener on POS can do it safely; if focus is required, make that obvious in the UI.

**Cart.** In-memory Zustand store, ported from `src/stores/cartStore.ts`. It is not persisted. Line key is the product id. Adding the same product increments quantity by 1. Quantity uses `src/lib/quantity.ts`: scale 1000, min 0.001, max 999999.999. Below the minimum, remove the line. UI: minus and plus by 1, chips for ¼ and ½, a decimal editor (0 removes the line), trash removes the line. Show the product name, unit price prefixed `GHS`, and the line amount. Tapping the name shows the full name and, when `auto_convert_json` is present, the tip from `src/lib/autoConvertTip.ts` ("From {parent} · May share pack stock with {siblings}"). That tip is display-only. Do not convert packs in the client. After a catalog refresh (later phases), `rehydrateFromDb` drops lines whose products were deleted and refreshes snapshots. Call that helper at the end of this phase even if nothing refreshes the catalog yet.

**Temporary products.** Port `createTemporaryProduct`. UUID, `is_temporary = 1`, stock 0, `synced_at` null, optional barcode, price required. Copy on the sheet: the owner can add it to inventory later.

**Checkout.** Port `previewTotals`, `validateDiscount`, and `saleService.completeSale`.

- Subtotal is the sum of `price * normalizeQty(qty)`, not rounded as a single step.
- Tax is 0 unless tax is enabled and the rate is greater than 0. Then tax is `round(subtotal * rate / 100)` to 2 decimals (`Math.round(n * 100) / 100`).
- Discount at or below 0 is ignored. Total is `roundMoney(subtotal + taxAmount - discountAmount)`. Total below 0 throws `Discount exceeds sale total`.
- Discount is an amount, not a percent. The cap applies only when `discountEnabled === true`. If discounts are disabled, the max percent is 0 or less, or the subtotal is 0 or less, the message is "Discounts are not permitted. Contact your administrator." If the rounded percent of subtotal exceeds the rounded max percent, the message is `Maximum discount is {n}%. Contact your administrator to request a higher limit.` Do not clamp. Reject the sale. Use the cached tax settings while offline.
- Read tax from settings key `tax_settings`, falling back to organization fields, as in `src/lib/checkoutSettings.ts`. Accept both `defaultTaxRate` / `tax_rate`, `taxEnabled` / `tax_enabled`, `maxDiscountPercent` / `max_discount_percent`, and `discountEnabled` / `discount_enabled`.
- Payment methods in the UI: Cash, MoMo, Card, Split. Map them to `CASH`, `MOBILE_MONEY`, `CARD`, `MIXED`. Cash tender must cover the total when compared in cents. Quick cash amounts: 10, 20, 50, 100, 200, and Exact. Show change. An offline sale that includes a discount still proceeds; show a short note that the discount will be checked again when the sale uploads.
- Stock variance, ported from `computeStockShortages`. Non-temporary lines whose quantity exceeds local `stock_quantity` need a reason. A missing product blocks checkout. Temporary lines skip the shortage modal. Wire values, not labels:

  - `PHYSICAL_STOCK_PRESENT` — Item was on the shelf / in store physically
  - `PACK_BROKEN` — Sold from opened pack / box
  - `STOCK_NOT_RECEIVED` — Goods here but not received in system
  - `EMERGENCY_SALE` — Urgent / customer-critical
  - `SYSTEM_ERROR` — Known app / system mismatch
  - `OTHER` — Other (explain below). Note required when the reason is `OTHER`.

  On the sale payload, every temporary line sends `varianceReason: 'PHYSICAL_STOCK_PRESENT'` even though the modal skipped it. Omit `varianceReason` on lines that are not short and are not temporary. Omit `varianceNote` when it is empty after trim.

- Trial gate, ported from `src/services/trialManager.ts`. The trial is active when organization `planType` (or `plan_type`) uppercases to `TRIAL`. If `planType` is missing, treat it as `TRIAL`. Allowed while `sales_count < trial_limit`. When blocked, throw `TRIAL_LIMIT` and show the upgrade modal. The modal copy is the 50-sale trial limit and it only dismisses. There is no payment flow. When the sale is allowed and the trial is active, increment `sales_count` in the same transaction as the sale. If the remaining count is exactly 10 after a successful check, show a warning once (prefs `trial_warning_shown`). Do not call `GET /staff/trial/status` in this phase; that refresh belongs with online sync.

**Commit.** One Dexie transaction:

1. Require `organization.id`. Otherwise throw `Missing organization - run initial sync`.
2. New sale UUID, receipt number `RCP-YYYYMMDD-XXXXXX` from `src/lib/receiptNumber.ts` (date from `new Date().toISOString()`, six characters from `Math.random().toString(36)` uppercased).
3. `soldAt` is device time ISO. `syncedAt` on the **payload** is also set to now, matching `saleService`, but the **local sales row** `synced_at` stays null until a later phase uploads it.
4. For each line: `lineSub = round(price * qty)`, `lineTax = round(lineSub * rate / 100)` when tax applies, API `lineTotal = round(lineSub + lineTax)`. Local `sale_items.total_price` stores `lineSub` only.
5. Decrement `stock_quantity` by the sold quantity for non-temporary products. Do not move stock for temporary products.
6. Enqueue one `temporary_item` row per temporary line, then one `sale` row. Payload shapes:

Temporary item (`entity_type: 'temporary_item'`, `entity_id: '${saleId}_${productId}'`):

```ts
{
  body: {
    barcode?, // omit when blank
    name, price, sold_at, staff_id, branch_id,
    local_product_id, local_sale_id
  }
}
```

Sale (`entity_type: 'sale'`, `entity_id` and idempotency key are the sale UUID):

```ts
{
  idempotencyKey: saleId,
  body: {
    id, receiptNumber, receipt_number,
    organizationId, createdById,
    subtotal, taxRate, taxAmount, discountAmount, totalAmount,
    paymentMethod, currency, soldAt, syncedAt, deviceInfo, items
  }
}
```

Each item: `id`, `productId`, `productName`, `quantity`, `unitPrice`, `unitCost` (`cost_price` or 0), `taxRate`, `taxAmount`, `lineTotal`, and optional `varianceReason` / `varianceNote`.

`deviceInfo` comes from the same fingerprint helper as bind.

7. Clear the cart.
8. Show a "Sale complete" sheet with the receipt number and a single button, **Not now**. Do not add **Print receipt** in this phase. Dismissing the sheet leaves the sale saved.

POS layout, phone: glass header (connection, title, notifications placeholder, overflow with Settings and Sign out), primary "Scan barcode" card, two-up "Search products" and "Returns" (Returns may navigate to a still-empty route), "Sales history & filters" row, cart, sticky "Complete sale • GHS {total}". Desktop and tablet: search or scan and the cart are visible together in the two panes from Phase 1. Checkout is a sheet on phone and a panel or sheet on desktop.

Port unit tests for `src/lib/quantity.ts`, `src/lib/discount.ts`, `src/lib/checkoutTotals.ts`, and the sale math covered by `src/services/saleService.test.ts` and `src/services/saleService.fractional.test.ts`. Adapt imports. Do not weaken expectations.

### Out of scope

Printing, sales-history UI (the route may stay an empty state), uploading the queue, master-data refresh, returns processing, notifications, backups, discount-repair UI. The Returns entry may exist and land on the Phase 1 empty state.

### Source files

- `src/stores/cartStore.ts`
- `src/lib/quantity.ts`
- `src/lib/discount.ts`
- `src/lib/checkoutTotals.ts`
- `src/lib/checkoutSettings.ts`
- `src/lib/receiptNumber.ts`
- `src/lib/autoConvertTip.ts`
- `src/lib/saleDeviceInfo.ts`
- `src/services/saleService.ts`
- `src/services/temporaryProductService.ts`
- `src/services/trialManager.ts`
- `src/services/stockVarianceService.ts`
- `src/types/stockVariance.ts`
- `src/api/salesApi.ts` (payload types only; do not POST)
- `src/db/repositories/saleRepository.ts` (`insertLocalSaleTx`)
- `src/db/repositories/productRepository.ts` (search and stock update)
- `app/pos.tsx`
- `app/scanner.tsx`
- `app/product-search.tsx`
- `src/components/TemporaryItemSheet.tsx`
- `src/components/UpgradeModal.tsx`
- Matching `*.test.ts` files for quantity, discount, checkout totals, and sale service

### Implementation notes

- Checkout must not call `fetch`. Assert that in a test or by completing a sale with the browser offline.
- The sale queue row is written even when offline. Phase 5 will send it. Do not mark it `COMPLETED` locally.
- Cash comparison is in cents so `10.00` covers `10`.
- `createdById` is `UserProfile.userId`. `staff_id` on the temporary-item body is also `userId`, matching `completeSale` (`input.staffUserId`).
- Keep the queue payload complete, including `deviceInfo`. A later retry must resend that object, not a stripped body.

### Acceptance checks

1. Search by exact barcode, SKU prefix, and a name fragment returns the expected order.
2. Camera scan or a typed barcode adds a known product. An unknown barcode creates a temporary product only after a price is entered.
3. Quantity supports 0.25, 0.5, and a typed decimal. `0` removes the line. Merging the same product increments quantity.
4. A discount above the cached percent is rejected with the mobile copy. A discount of 0 is allowed. A negative total is rejected.
5. Selling more than local stock opens the variance step. `OTHER` without a note is blocked. The saved payload contains the wire reason, not the label.
6. At the trial limit, checkout is blocked and the upgrade modal only dismisses. A successful trial sale increments `sales_count` by 1.
7. With the network disabled, complete a sale. Reload. The sale row exists, `synced_at` is null, stock dropped for non-temporary lines, a `sale` queue row exists, and any temporary line has a `temporary_item` queue row created first (lower `id` or earlier `created_at`).
8. The cart is empty after commit. **Not now** closes the sheet. No print dialog appears.
9. Ported unit tests pass.

**Prompt the agent with:** Implement Phase 3 only, from `docs/PWA_AGENT_PROMPT.md`. Follow the shared preamble. Assume Phases 1 and 2 acceptance checks pass. Stop when the Phase 3 acceptance checks pass.

---

## Phase 4 — Receipts and printing

### Goal

The same 32-column receipt as the phone app, printed on a thermal printer when the browser allows it, and always printable through the system print dialog. Skipping print does not undo the sale.

### In scope

**Receipt text.** Port `src/lib/receiptLayout.ts` and `src/lib/receiptLayout.test.ts` without changing the layout.

- Paper width `32`. Rule line is 32 hyphens.
- Header: centered bold organization name, or `Store` when the name is missing. Centered phone when present. Centered `businessLocation` or `business_location` when present.
- `Receipt` and the receipt number, right-aligned on one line. If `receipt_number` is null, use the first 8 characters of the sale id, uppercased.
- Local datetime from `formatReceiptDateTime` (example shape `27 Jun 2026, 2:14 PM`). This line is not padded.
- Each line: `{name} x{qty}` with `formatQty`, right-aligned pre-tax `total_price`. Truncate the left side with `…` via `padReceiptLine`.
- Subtotal is the sum of item `total_price` (this can differ from checkout subtotal by rounding; keep that behavior).
- Discount row only when discount is greater than 0, shown as a negative amount. Tax row only when tax is greater than 0.
- Total, then Paid label: `CASH` → Cash, `MOBILE_MONEY` → MoMo, `CARD` → Card, `MIXED` → Split. Unknown methods print the trimmed raw value.
- Footer: centered `Built by NutaSolutions` and `0541298861 · Call / WhatsApp`.
- Money is `toFixed(2)` with no currency symbol on paper.
- Missing sale: a left block `Sale {id}` and `(not found locally)`.
- Test slip: the org header, centered `Test print`, centered `Connection OK`, and the same footer.

The mobile printer consumes tags `<C>`, `<CB>`, and `<L>`. Keep those tags in the string the tests assert. For paper output, translate them:

- `<C>` center, `<CB>` bold center, `<L>` left.
- Untagged lines are already padded to 32 characters. Print them in a monospace face and do not reflow them.

**Three print paths, in this order.**

1. **WebUSB thermal.** Chromium browsers that expose `navigator.usb`. Let the user pick a USB device, claim the bulk OUT endpoint, and send ESC/POS bytes: initialize, the translated text, feed, and partial cut. Remember the device (vendor id and product id, or the serial when the browser provides one) in prefs `default_printer` with `transport: 'usb'`.
2. **Web Bluetooth thermal.** When Web Bluetooth exists, let the user pick a paired-style BLE thermal printer (common ESC/POS services). Write the same bytes. Remember `transport: 'ble'` and the device id.
3. **Browser print.** Always available. Open a print document that is only the receipt: monospace, `white-space: pre`, about 58mm wide, `@page { size: 58mm auto; margin: 0 }`. Call `window.print()`. Remember `transport: 'browser'` when the user chooses this as the default.

Try the saved default first if that API still exists and the device is available. Otherwise try USB, then Bluetooth, then the browser sheet. A failure names the path that failed (USB permission, Bluetooth unavailable, connect error) and offers **Print with browser** so the sale is never stuck. There is no 80mm mode and no network/IP printer. Cut and beep have no browser equivalent; the browser path does not pretend to cut.

Do not emit a different layout for the browser. The characters on paper match the thermal string with tags rendered, not a new invoice design.

**Printer settings.** List the saved printer. Actions: choose USB, choose Bluetooth, use browser printing, and **Test print** (`buildTestThermalReceipt`). Failures are toasts. This screen replaces the Phase 1 empty state.

**Sale-complete sheet.** Add **Print receipt** beside **Not now**. Print calls the receipt builder for the sale id just committed. **Not now** still completes nothing extra; the sale is already saved.

**Sales history.** Replace the empty state. Local sales only, `is_return = 0`, limit 200. Chips: today, week, month, all. Default week. Date bounds use UTC ISO, matching `app/sales-history.tsx`. Optional receipt substring and min/max total. Payment filter is a client-side substring. Reprint uses the same printer flow. Empty state sends the user to `/pos`. Do not print returns as their own document. Sync-status badges may show `synced_at` when it is already set, but do not build the repair UI here.

### Out of scope

The sync worker, returns, notification socket, backup upload, discount repair. Do not change checkout math.

### Source files

- `src/lib/receiptLayout.ts`
- `src/lib/receiptLayout.test.ts`
- `src/lib/quantity.ts` (`formatQty` only)
- `src/services/printerService.ts`
- `app/printer-settings.tsx`
- `app/sales-history.tsx`
- `src/components/PrintReceiptPromptModal.tsx`
- `src/db/repositories/saleRepository.ts` (`getSaleWithItems`, `searchSales`)

### Implementation notes

- ESC/POS text encoding: ASCII for this receipt. The footer and org name in the live app are ASCII. If a name contains a character outside ASCII, replace it for the thermal path and keep it in the browser path, and show that in the printer settings note.
- USB and Bluetooth require a user gesture. The print button is that gesture. Do not connect on page load.
- iOS Safari and Firefox will not implement WebUSB or Web Bluetooth. The browser sheet is the supported path there. Do not hide print on those browsers.
- A successful thermal print may store that device as the default. A USB-only default must still display as the default on the settings row (the mobile settings subtitle has a bug where it reads only a legacy MAC key; do not copy that bug).
- Reprint loads the sale from IndexedDB. It does not ask the server for a PDF.

### Acceptance checks

1. Ported receipt tests pass, including padding, missing org name, discount and tax rows, and payment labels.
2. For a known local sale, the browser print preview shows the 32-column slip: org header, receipt number, lines, totals, and the NutaSolutions footer. No currency symbol on the amounts.
3. With no printer paired, **Print receipt** still produces the browser sheet. **Not now** does not open it.
4. On a browser with WebUSB or Web Bluetooth, a test print from printer settings reaches the device or fails with a message that names the path and still offers the browser sheet.
5. Sales history lists a sale made in Phase 3, filters by the week chip, and reprints it.
6. Completing a sale while skipping print leaves the sale in IndexedDB.

**Prompt the agent with:** Implement Phase 4 only, from `docs/PWA_AGENT_PROMPT.md`. Follow the shared preamble. Assume Phases 1–3 acceptance checks pass. Stop when the Phase 4 acceptance checks pass.

---

## Phase 5 — Sync, returns, and failure repair

### Goal

Sales made offline upload when the app is open and online. Temporary items upload before the sale that references them. Returns require the network. Failed business rules can be repaired and retried.

### In scope

**Worker.** Port `src/services/syncWorker.ts`. It runs only when an access token exists and the browser is online. Trigger it when the app comes online, about every 30 minutes while online and a session exists, after checkout (fire and forget), and from **Retry failed uploads**. Up to 3 passes per run. Up to 50 rows whose status is `PENDING`, or `FAILED` with `attempt_count < 3`. Order by `created_at`, then `id`.

- `temporary_item` → `POST /staff/temporary-items`. Treat HTTP 2xx and 409 as success. Set `products.synced_at` for `local_product_id`. Mark the queue row `COMPLETED`.
- `sale` → if any line product is temporary and that product's `synced_at` is null, leave the sale `PENDING` and do not count it as a failed attempt. Otherwise `POST /staff/sales` using `postStaffSale` classification from `src/api/salesApi.ts`:
  - 2xx → success.
  - Body with both non-empty `errorCode` and `failureId` (HTTP 400, 403, or 409) → DLQ. Status `PENDING_SUPER_ADMIN`. Store `failure_id`, `error_code`, `admin_message` from `message` when it is a string, and `last_failed_at`. Keep the payload.
  - HTTP 409 with `syncedAt` or `synced_at` and no `errorCode` → duplicate success. Do not create a second sale.
  - Anything else throws and stays on the retry path.
  - Success or duplicate: set `sales.synced_at` from the server value or now, and set the queue row `COMPLETED`.
- Transport or thrown errors: status `FAILED`, `attempt_count + 1`, `last_error`. After 3 attempts the row leaves the automatic loop until **Retry failed uploads** sets failed rows back to `PENDING` and zeroes `attempt_count` (`resetAllFailed`).
- Unknown `entity_type` values are marked `COMPLETED` and dropped. Do not invent handlers for `inventory_event`.
- Before each worker run, pull admin resolutions (below).

**Master data.** Port `src/services/masterDataPull.ts`. `GET /staff/master-data?since=&limit=`. Cursor prefs `last_master_data_pull`. Use epoch on the first pull. HTTP 304 means unchanged. Follow `has_more` for at most 50 pages. Upsert products. If a product payload omits stock, keep the local `stock_quantity`. If it omits auto-convert, keep `auto_convert_json`. Then `GET /staff/inventory` overwrites stock and auto-convert for the branch (inventory is the source of truth). Apply `deleted_product_ids` and `deleted_category_ids`. Update organization and tax settings when present. `full_resync_recommended` only shows a toast telling the user to sign out and sign back in. Do not wipe the database automatically. Rehydrate the cart after a pull. Also run this pull on POS pull-to-refresh, then resolutions, then the worker. Update prefs `last_sync_time` when a cycle finishes.

**Resolutions.** `GET /staff/sync-failures/resolutions?since=` from `src/api/syncFailuresApi.ts`. Cursor `last_sync_failure_resolution_pull`. Compare `entityType` case-insensitively (`sale` and `SALE`).

- `RETRY` → clear DLQ fields, status `PENDING`, `attempt_count` 0. The next worker run resends the original body, including `deviceInfo`.
- `IGNORE_CLEAR` → `CLEARED_ADMIN`.
- `FIX_AND_APPLY` → `CLEARED_ADMIN`. Set the local sale `synced_at` only when `appliedSaleId` equals the local sale id.

**POS banners.** One banner when any row is `PENDING_SUPER_ADMIN` (opens sync failures). One banner when any row is `FAILED` and out of automatic retries (retry action).

**Returns.** Port `src/services/returnService.ts`. If offline, throw and show that internet is required. Do not write a local return first.

- Cannot return a return (`is_return === 1`).
- Per product, quantity cannot exceed sold quantity minus quantity already returned.
- Refund is the sum of `round(qty * unitPrice)` to cents.
- Local receipt `RET-` plus 8 hex characters from the return UUID.
- API body (`src/api/returnsApi.ts`): `id`, `original_sale_id`, `refund_amount`, `returned_items[{product_id, quantity, unit_price}]`, `sold_at`, `staff_id`, `branch_id`, `receipt_number` set to the **original** sale receipt, `refund_method` mapped from the original payment: `CASH`→`cash`, `MOBILE_MONEY`→`mobile_money`, `CARD`→`card`, `TRANSFER`→`transfer`, `MIXED`→`mixed`.
- Timeout 30 seconds. On success, write the local return with `is_return = 1`, `payment_method = 'RETURN'`, `original_sale_id`, tax 0, and `synced_at` set. Increase local stock for non-temporary lines. Do not enqueue a sync row on the happy path. HTTP 409 is success, matching `postStaffReturn`.

**Sync failures screen.** List `PENDING_SUPER_ADMIN` and exhausted `FAILED` rows. For `DISCOUNT_EXCEEDS_LIMIT` and `DISCOUNT_NOT_ALLOWED`, port `repairFailedSaleDiscount`: edit the discount, rewrite the payload and the local `discount_amount` / `total_amount`, and requeue. For variance errors, allow editing `varianceReason` / `varianceNote` on the payload and requeue, as `app/sync-failures.tsx` does. Show `parseStaffSaleErrorMessages` only as display text. Never classify a failure by the message string.

**Settings actions for this phase only.** Last sync time ("about every 30 minutes"), the admin-review card (runs the resolution pull), and **Retry failed uploads**. Leave clear-old-sales, CSV, and backup for Phase 6.

**Trial refresh.** When online, `GET /staff/trial/status` may overwrite local `sales_count` when the server value differs. Do this alongside master data, not during the offline checkout transaction.

### Out of scope

Notifications, Socket.IO, backups, CSV export, clearing old sales, clock warnings, database integrity UI, low-storage warnings. Do not print a return slip.

### Source files

- `src/services/syncWorker.ts`
- `src/services/masterDataPull.ts`
- `src/services/syncFailureResolutionPull.ts`
- `src/services/discountRepairService.ts`
- `src/services/returnService.ts`
- `src/services/postAuthBackgroundJobs.ts`
- `src/api/salesApi.ts`
- `src/api/temporaryItemsApi.ts`
- `src/api/returnsApi.ts`
- `src/api/masterDataApi.ts`
- `src/api/syncFailuresApi.ts`
- `src/api/trialApi.ts`
- `src/db/repositories/syncQueueRepository.ts`
- `docs/MOBILE_LIFECYCLE_ALIGNMENT.md`
- `app/sync-failures.tsx`
- `app/returns.tsx`
- `app/settings.tsx` (only the sync actions)
- Tests: `src/api/salesApi.test.ts`, `src/services/discountRepairService.test.ts`, `src/services/syncFailureResolutionPull.test.ts`, `src/db/repositories/syncQueueRepository.test.ts`

### Implementation notes

- Classify sale responses by body shape, never by the words inside `message`.
- A sale must not be POSTed while its temporary products are unsynced.
- Duplicate 409 must not increment the trial counter again. The counter already moved at checkout.
- Pull-to-refresh on POS is master data, then resolutions, then the worker. It is not a full sign-out resync.
- Returns search the local database for non-return sales. The user picks lines and quantities. Submitting while offline shows the internet-required error and writes nothing.
- Port the listed tests. Where they mock SQLite, point them at the Dexie repositories or at pure functions extracted from the worker.

### Acceptance checks

1. A sale completed offline stays `PENDING`. When the network returns, the worker posts it and sets `sales.synced_at`. The queue row is `COMPLETED`.
2. A sale with a temporary item posts `/staff/temporary-items` before `/staff/sales`. If the item post fails, the sale stays `PENDING` and is not marked failed solely because the product is unsynced.
3. A second worker run after a duplicate 409 does not create another local sale and does not increment `sales_count` again.
4. A response that includes both `errorCode` and `failureId` becomes `PENDING_SUPER_ADMIN` and stops auto-retry. The POS banner appears.
5. `RETRY` from the resolutions endpoint puts the row back to `PENDING` with the original `deviceInfo` still in the payload. `IGNORE_CLEAR` becomes `CLEARED_ADMIN`.
6. An over-limit discount can be edited on the sync-failures screen and requeued. The local sale total matches the new discount.
7. A return while offline writes no row. A return while online posts, then stores `is_return = 1` with `payment_method` `RETURN`, and local stock increases. The API `receipt_number` is the original receipt, not the `RET-` number.
8. Pull-to-refresh updates a changed product price from master data without wiping unsynced sales.
9. Ported sync and discount-repair tests pass.

**Prompt the agent with:** Implement Phase 5 only, from `docs/PWA_AGENT_PROMPT.md`. Follow the shared preamble. Assume Phases 1–4 acceptance checks pass. Stop when the Phase 5 acceptance checks pass.

---

## Phase 6 — Notifications, backups, and remaining settings

### Goal

The operational screens around a cashier that already sells, prints, and syncs. Tablet and desktop layouts are checked against the real flows, not just the empty chrome.

### In scope

**Notifications.** Port `src/api/notificationsApi.ts` and the socket client.

- `GET /notifications?cursor&limit=20` and optional `unread`.
- `GET /notifications/unread-count`.
- `PATCH /notifications/:id/read`.
- Socket.IO at `{origin}/notifications`, path `/socket.io/`, auth `{ token: accessToken }`. Events `notification:new` and `notification:count-updated`. Reconnect after a proactive token refresh.
- List screen with a detail modal. Badge on the POS header. Deep links only for staff actions that resolve to scanner, POS, history, or returns (`src/lib/notificationActions.ts`). Hub-only URLs (`/sales/`, `/products/`, `/branches/`, `/audit`, `/reports`, or `metadata.hub_only`) do not navigate, except where the notification type already maps to a staff screen.
- On logout, disconnect the socket and clear the in-memory notification list.

**Settings remainder and backups.**

- Clear synced sales whose `synced_at` date is older than 90 days (`date(synced_at) < date('now', '-90 days')` in the mobile SQL). Do not delete unsynced sales.
- CSV export of sales, columns: Receipt, Sold at, Product, Qty, Unit price, Sale total, Sale tax, Payment, Synced. Download a file. One row per sale item, matching `batchOperationsService.exportSalesCSV`.
- Local backup: export the Dexie tables as one JSON file (or a SQLite dump if you already have a WASM SQLite build; JSON is the expected web format). File name `backup_{deviceId}_{timestamp}.json`. Keep the newest 5 in IndexedDB or the Origin Private File System. Restore replaces local tables and does not call the server. Warn the user to reload after restore.
- Cloud backup when online: `POST /staff/backup` multipart fields `device_id`, `app_version`, `build_number`, `created_at`, and file field `backup`.
- After login, if prefs `last_backup_date` is not today, create a local backup and try the cloud upload. A cloud failure does not fail login.
- Account row shows Staff ID initials only.
- Do not add an Android APK update check.

**Clock, integrity, storage, trial copy.**

- `GET /time` on the API origin (try with the bearer token, then without). If the device clock differs by more than 5 minutes, warn. Do not block sales. `POST /staff/time-warning` with `{ staff_id, device_time, offset_minutes, device_model }`.
- Integrity: required tables exist, every `sale_items.sale_id` has a sale, and the trial `sales_count` is compared with the number of non-return sales while the plan is trial. If the counts differ by more than 5, auto-fix `sales_count` to the local non-return count and record the error. There is no SQLite `PRAGMA integrity_check`; say that in the UI copy. A failed check offers Continue or Open backups. When online after login, `POST /staff/database-warning` with `{ healthy, errors }`.
- Storage: if `navigator.storage.estimate` shows less than 100 MB free, warn once per day (prefs `low_storage_day`). Under 500 MB, a softer warning. `POST /staff/device-warning` when online, matching `src/api/staffWarningsApi.ts`. If the browser cannot estimate quota, skip the warning.
- Trial warning at 10 remaining stays as built in Phase 3. Confirm the upgrade modal still only dismisses.

**Responsive pass.** On a phone-width viewport, POS still matches the single column: scan, search, returns, history, cart, sticky complete-sale. On a tablet and desktop width, search and cart are usable together, checkout can be completed without horizontal scrolling, history filters wrap, and the print sheet is readable. Do not add features during this pass.

**Offline shell.** Confirm the production service worker still serves the app after the network is cut, and that a sale completed in that state remains in IndexedDB and uploads after Phase 5's worker runs on reconnect.

### Out of scope

New payment methods, a category browser, dark mode, server APIs that do not already exist, printing returns, Android update checks, and any change to receipt wording.

### Source files

- `src/api/notificationsApi.ts`
- `src/services/notificationsSocket.ts`
- `src/services/notificationsSocketLifecycle.ts`
- `src/stores/notificationStore.ts`
- `src/lib/notificationActions.ts`
- `src/lib/notificationPresentation.ts`
- `app/notifications.tsx`
- `src/components/NotificationDetailModal.tsx`
- `app/settings.tsx`
- `app/backups.tsx`
- `src/services/databaseBackupService.ts`
- `src/services/batchOperationsService.ts`
- `src/api/staffBackupApi.ts`
- `src/services/timeValidationService.ts`
- `src/api/timeApi.ts`
- `src/services/databaseIntegrityService.ts`
- `src/api/staffWarningsApi.ts`
- `src/components/IntegrityLaunchGate.tsx`
- `src/components/UpgradeModal.tsx`

### Implementation notes

- Socket auth uses the current access token. After refresh, reconnect. Do not put the token in the query string.
- Backup JSON must include every Dexie table needed to sell again: products, sales, sale items, sync queue, trial usage, settings, and prefs except secrets. Tokens stay out of the backup file. Restore must not import a file that contains an access token; strip those keys if present.
- Cloud backup is best-effort. Local backup is the one the user can restore offline.
- `POST /staff/time-warning` and the warning posts must not block checkout when they fail.
- The responsive pass is allowed to adjust layout CSS only. If a flow is broken, fix that flow. Do not redesign the receipt.

### Acceptance checks

1. The unread badge on POS matches `GET /notifications/unread-count`. Opening a notification marks it read. A socket event updates the badge without a manual reload.
2. A hub-only link does not navigate. A staff action for history, returns, scanner, or POS does.
3. Logout disconnects the socket. The next login does not show the previous user's notifications.
4. CSV columns match the list above. Synced and unsynced sales both export.
5. A local backup downloads. Restore replaces products and sales. A reload after restore still opens POS when the session is valid. Tokens are not inside the file.
6. Clearing old data deletes only synced sales older than 90 days.
7. A clock skew over 5 minutes shows a warning, and checkout still works.
8. An integrity failure offers backups. A healthy database does not block POS.
9. At phone width and at 1024px width, a user can search, add a line, complete a sale, skip or print, and find it in history.
10. After one online production load, disabling the network still opens the shell. A sale saved offline uploads when the network returns.

**Prompt the agent with:** Implement Phase 6 only, from `docs/PWA_AGENT_PROMPT.md`. Follow the shared preamble. Assume Phases 1–5 acceptance checks pass. Stop when the Phase 6 acceptance checks pass.

---

## Phase index

| Phase | Builds | Stop when |
| --- | --- | --- |
| 1 | Shell, theme, routes, Dexie, API client skeleton | The app installs and opens offline as an empty shell |
| 2 | Login, refresh, bind, initial sync, logout | A real login lands on POS with a local catalog |
| 3 | Search, scan, cart, checkout, offline sale | A sale survives reload with the network off |
| 4 | 32-column receipt, thermal and browser print, history | The slip matches the phone app and can be skipped |
| 5 | Upload queue, master data, returns, repair | An offline sale uploads, and returns need the network |
| 6 | Notifications, backups, settings, layout pass | The full cashier works on a phone and on a desktop |

Start with Phase 1. Do not ask an agent to implement every phase in one session.
