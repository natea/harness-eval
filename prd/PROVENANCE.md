# PRD Provenance

| Field | Value |
|---|---|
| File | `prd/symphony-SPEC.md` |
| Upstream | https://github.com/openai/symphony/blob/main/SPEC.md |
| Pinned commit | `b4ccf7b55327821ca6d9b1b8b9e4ab5ac7f30e15` (2026-06-05T22:56:44Z) |
| SHA-256 | `fa9d7c252cc72d10afdaf4e46e0d890aae28cf4331dc531c94413bc8ea199452` |
| Vendored | 2026-06-09 |

Verify integrity:

```sh
shasum -a 256 prd/symphony-SPEC.md
# must equal the SHA-256 above
```

The orchestrator validates this hash at run start and records it in every run's provenance. Do not edit the vendored spec; to move to a newer upstream revision, re-vendor, update this file, and treat results across PRD revisions as non-comparable.
