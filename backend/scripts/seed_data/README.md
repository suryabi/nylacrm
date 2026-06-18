# Demo Seed Data (`demo-co` tenant)

`scripts/seed_sample_data.py` builds a fully-populated, self-contained **`demo-co`**
tenant by cloning the primary tenant (`nyla-air-water`) and remapping every primary
UUID so the demo tenant is completely decoupled from production data.

Globally-shared collections (product catalogue, location masters, lead statuses, etc.)
are intentionally **not** cloned — the app reads them across all tenants. Integration
secrets / OAuth state / API keys are excluded.

## Commands

```bash
cd /app/backend

# Clone nyla-air-water -> demo-co in the connected DB AND write the portable fixture
python scripts/seed_sample_data.py generate

# Re-create demo-co on a FRESH deployment DB from the committed fixture (no source needed)
python scripts/seed_sample_data.py load

# Remove all demo-co data
python scripts/seed_sample_data.py wipe
```

## Output

- `generate` writes `scripts/seed_data/demo_seed.json` (~4 MB) — commit this so a fresh
  deployment can be seeded with `load` without access to the source tenant.

## Demo logins

All demo users share the password **`demo123`**. Emails are rewritten to the
`@demo-co.com` domain (e.g. `surya.yadavalli@demo-co.com`, `admin@demo-co.com`).

## Serving the demo tenant

The app resolves the active tenant from the request host / `X-Tenant-ID` header.
To run a deployment as the demo tenant, set `DEFAULT_TENANT_ID=demo-co` in the backend
environment, or serve it on a host/subdomain that maps to `demo-co`.

## Env overrides

`SEED_SOURCE_TENANT`, `SEED_TARGET_TENANT`, `SEED_DEMO_PASSWORD`.
