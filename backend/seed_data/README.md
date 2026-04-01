# Seed Data

Test data exported from the preview environment for bootstrapping new deployments.

## Quick Start

```bash
# From the backend directory:

# Seed all collections into default database (from .env)
python seed_data/seed.py --drop

# Seed into a specific database
python seed_data/seed.py --db-name my_new_db --drop

# Seed only specific collections
python seed_data/seed.py --drop --collections users tenants leads accounts

# Custom MongoDB URL
python seed_data/seed.py --mongo-url "mongodb://user:pass@host:27017" --db-name production_db --drop
```

## Options

| Flag | Description |
|------|-------------|
| `--drop` | Drop existing collections before inserting (required for re-seeding) |
| `--db-name` | Override database name (default: `DB_NAME` from `.env`) |
| `--mongo-url` | Override MongoDB connection string (default: `MONGO_URL` from `.env`) |
| `--collections` | Only seed specific collections (space-separated) |

## Collections (67 total)

| Category | Collections |
|----------|-------------|
| **Core** | users, tenants, roles, designations |
| **Leads** | leads, lead_statuses, lead_activities, lead_proposals, follow_ups, scoring_models |
| **Accounts** | accounts, account_contracts, account_distributor_assignments |
| **Activities** | activities, meetings, daily_status |
| **Invoices** | invoices, credit_notes, resource_invoice_summary |
| **Targets** | target_plans_v2, target_allocations_v2, city_targets, territory_targets, resource_targets, sku_targets |
| **Distribution** | distributors, distributor_stock, distributor_shipments, distributor_deliveries, distributor_settlements, etc. |
| **Expenses** | expense_requests, expense_categories, expense_types, budget_requests |
| **Tasks** | tasks, tasks_v2, task_activities, task_comments_v2, task_labels, task_milestones |
| **Master Data** | master_cities, master_states, master_territories, master_skus, business_categories, contact_categories |
| **Other** | documents, document_categories, travel_requests, leave_requests, cogs_data, comparison_overrides |

## Test Credentials

- **Admin**: `surya.yadavalli@nylaairwater.earth` / `test123`
- **Tenant ID**: `nyla-air-water`

## Notes

- Passwords are stored as bcrypt hashes — the seed data preserves them as-is
- `user_sessions` and `user_activity` are excluded (runtime logs, not needed for seeding)
- Empty collections are excluded
- All `_id` fields are stripped (MongoDB auto-generates on insert)
