# Azure Staging Deployment Evidence

## Verified deployment baseline

**Status:** Successful  
**Workflow run ID:** `42299081282`  
**Deployed commit:** `300a2d5e5d49aa6087f824012f8e0537aea5d053`  
**API image:** `ghcr.io/mariamagdalenarios/hasta-la-vue-lta-api:sha-300a2d5`  
**Client image:** `ghcr.io/mariamagdalenarios/hasta-la-vue-lta-client:sha-300a2d5`

### Deployment verification

- GitHub Actions workflow: Passed
- API image pushed to GHCR: Confirmed
- Client image pushed to GHCR: Confirmed
- Azure deployment: Passed
- PostgreSQL connection: OK
- MongoDB connection: OK

### Live health response

```json
{
  "ok": true,
  "sha": "300a2d5e5d49aa6087f824012f8e0537aea5d053",
  "postgres": "ok",
  "mongodb": "ok"
}
```

### Startup migration evidence

```text
boot: running Postgres-to-MongoDB log migration
Tours:  Postgres 200, MongoDB 200
Points: Postgres 6010, MongoDB 6010
Verifierat: inget tappades på vägen.
boot: log migration verified
```

### Migration verification

| Collection | PostgreSQL | MongoDB | Result |
|---|---:|---:|---|
| Tours | 200 | 200 | Match |
| Points | 6,010 | 6,010 | Match |

**Data integrity:** No records were lost during migration verification.

### Final decision

This deployment is the verified baseline for Azure staging.

- No workflow changes are required.
- Preserve the current deployment configuration.
- Use commit `300a2d5` and workflow run `42299081282` as the reference when investigating future staging deployment issues.

### Evidence provenance

This record documents the workflow results, live health response, and startup logs reported for run `42299081282`. Retain the original GitHub Actions run and Azure logs as the primary supporting evidence.
