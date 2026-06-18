# Production Batch API — Integration Spec (for External Systems)

Create a production batch in the CRM from an external system (e.g. a plant/MES
or ERP). The external system identifies the product using **its own SKU
identifier** (`external_sku_id`); the CRM resolves the internal SKU, auto-fills
packaging, and applies the QC route automatically.

---

## 1. Base URL

```
Production:  https://crm.nylaairwater.earth
```

All endpoints are prefixed with `/api`.

---

## 2. Authentication

Every request must include an **API key** issued by the CRM administrator.

Send it as **either** header:

```
X-API-Key: ak_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
or
```
Authorization: Bearer ak_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Notes:
- Keys look like `ak_live_<48 hex chars>`.
- The key is shown **only once** at creation — store it securely (e.g. an
  environment variable on your side).
- The key is scoped: it is only allowed to call the endpoints granted to it
  (this integration requires the **Create Production Batch** scope).
- Keep the key server-side. Do not expose it in browsers or mobile apps.

---

## 3. Endpoint

### Create a production batch

```
POST /api/production/batches
Content-Type: application/json
```

#### Request body

| Field              | Type    | Required | Description |
|--------------------|---------|----------|-------------|
| `external_sku_id`  | string  | yes\*    | **Your** SKU identifier, as mapped in the CRM SKU master. Use this — external systems do not have the CRM's internal id. |
| `sku_code`         | string  | yes\*    | Alternative: the CRM SKU code (if you use it). |
| `sku_id`           | string  | yes\*    | Alternative: the CRM internal SKU id (normally not available to external systems). |
| `batch_code`       | string  | **yes**  | Your unique batch/lot code. Must be unique within the tenant. |
| `production_date`  | string  | **yes**  | Production date. Recommended format `YYYY-MM-DD` (e.g. `2026-06-14`). |
| `total_crates`     | integer | **yes**  | Number of crates produced. Must be > 0. |
| `bottles_per_crate`| integer | no       | Bottles per crate. If omitted, taken from the SKU's default production packaging. |
| `ph_value`         | number  | no       | Optional pH reading for the batch. |
| `notes`            | string  | no       | Optional free-text notes. |

\* **SKU identification:** provide **exactly one** of `external_sku_id`,
`sku_code`, or `sku_id`. Resolution order is `sku_id` → `sku_code` →
`external_sku_id`. External systems should send `external_sku_id`.

> `total_bottles` is computed by the server as `total_crates × bottles_per_crate`.
> `skip_qc` is **not** available to API-key callers — omit it.

#### Example request

```bash
curl -X POST "https://crm.nylaairwater.earth/api/production/batches" \
  -H "X-API-Key: ak_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
        "external_sku_id": "B660",
        "batch_code": "PLANT-2026-06-14-001",
        "production_date": "2026-06-14",
        "total_crates": 5
      }'
```

#### Success response — `200 OK`

Returns the created batch. Key fields:

```json
{
  "id": "bd1c718d-751a-44e1-82c3-30b336efcc39",
  "batch_code": "PLANT-2026-06-14-001",
  "sku_id": "20d525e8-c4af-4f40-965a-549dcd50c0a9",
  "sku_name": "Nyla – 600 ml / Silver",
  "production_date": "2026-06-14",
  "total_crates": 5,
  "bottles_per_crate": 12,
  "total_bottles": 60,
  "status": "created",
  "qc_route_id": "….",
  "created_at": "2026-06-14T05:21:09.123456+00:00"
}
```

| Field            | Description |
|------------------|-------------|
| `id`             | CRM internal batch id (store this for reconciliation). |
| `sku_id` / `sku_name` | The internal SKU the `external_sku_id` resolved to. |
| `bottles_per_crate` | Resolved value (provided or from the SKU default packaging). |
| `total_bottles`  | `total_crates × bottles_per_crate`. |
| `status`         | `created` (the batch then flows through the QC route in the CRM). |
| `qc_route_id`    | The QC route applied automatically for the SKU (may be `null` if none configured). |

---

## 4. Error responses

| HTTP | When | Example body |
|------|------|--------------|
| `400` | No SKU identifier provided | `{"detail": "Provide sku_id, sku_code, or external_sku_id."}` |
| `400` | `total_crates` ≤ 0 | `{"detail": "total_crates must be greater than 0."}` |
| `400` | Duplicate `batch_code` | `{"detail": "Batch code 'PLANT-2026-06-14-001' already exists"}` |
| `400` | SKU has no default packaging and `bottles_per_crate` omitted | `{"detail": "bottles_per_crate is required (the SKU has no default production packaging configured)."}` |
| `401` / `403` | Missing/invalid/disabled API key, or key not allowed this endpoint | `{"detail": "..."}` |
| `404` | SKU not found for the given identifier | `{"detail": "SKU not found for the given sku_id/sku_code/external_sku_id."}` |

---

## 5. Integration checklist

1. Ask the CRM admin to **issue an API key** scoped to **Create Production Batch**, and to **map each SKU's `external_sku_id`** to your system's identifier.
2. Store the API key securely on your server.
3. For each produced batch, `POST /api/production/batches` with `external_sku_id`, a unique `batch_code`, `production_date`, and `total_crates`.
4. On `200`, persist the returned `id` (and `batch_code`) for reconciliation.
5. Handle `4xx` errors (duplicate batch code, unknown SKU) and retry/alert as appropriate.

> **Idempotency:** `batch_code` must be unique. Re-posting the same `batch_code`
> returns `400`. Use this to make retries safe (a duplicate means it was already created).
