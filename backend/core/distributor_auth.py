"""
Shared distributor-user provisioning constants.

`DISTRIBUTOR_DEFAULT_PASSWORD` is the seed password set on a freshly-created
distributor user account (always bcrypt-hashed before persistence). It is NOT
a credential or secret — it is a default value that the user is expected to
change at first login. We centralise it here so the two call sites
(`routes/distributors.py` and `routes/distributor_contacts.py`) stay in lock-step
and so a tenant can override it without code changes via the
`DISTRIBUTOR_DEFAULT_PASSWORD` env var.
"""
import os

DISTRIBUTOR_DEFAULT_PASSWORD: str = os.environ.get("DISTRIBUTOR_DEFAULT_PASSWORD", "nyladist##")
