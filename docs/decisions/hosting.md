# Azure Hosting

## 1. Hosting platform

The project uses Azure Container Apps as its staging platform. The staging
environment is deployed in Sweden Central and runs the client, API,
PostgreSQL and MongoDB as containers in one Container App.

The application is deployed using Docker container images for the client and API.

The staging configuration is defined in:

- `infra/azure/staging.yaml`
- `infra/azure/skapa-staging.sh`
- `infra/azure/identitet.sh`

## 2. Architecture

The staging configuration defines four containers within one Azure Container App:

| Container | Technology | CPU | Memory |
|---|---|---:|---:|
| Client | Nginx/client image | 0.25 | 0.5 GiB |
| API | Node.js/API image | 0.5 | 1 GiB |
| Database | PostgreSQL 16 | 0.5 | 1 GiB |
| Database | MongoDB 8.2 | 0.5 | 1 GiB |

The client is exposed externally through HTTP ingress.

The API is not exposed directly. The client communicates with the API internally using `http://localhost:4000`.

## 3. Scaling and cold starts

The staging configuration specifies:

- Minimum replicas: 0
- Maximum replicas: 1

This allows the application to scale to zero when idle.

When a request arrives after the application has scaled to zero, Azure must start the containers again. This causes a cold start.

The deployment script estimates that the first wake-up can take approximately one minute. In the observed test on 2026-11-08, the cold-start request took 33.95 seconds.

The maximum of one replica keeps the application and database containers together.

## 4. Database configuration and persistence

The staging configuration runs PostgreSQL 16 and MongoDB 8.2 as containers alongside the application.

Local development uses named Docker Compose volumes:

- `utpost_pgdata`
- `utpost_mongodata`

These provide persistent local database storage.

The Azure staging configuration does not define equivalent persistent volumes. No persistent Azure volume is configured for the staging database containers. Staging database data is therefore ephemeral and may be lost when containers are recreated.

The PostgreSQL and MongoDB containers start as part of the Container App revision. The API connects to these database services during startup. `SEED_ON_START=1` enables seed data to be loaded when the application starts.

## 5. Secrets and authentication

The staging configuration uses Azure Container Apps secrets for:

- JWT signing secret
- PostgreSQL password
- MongoDB credentials

GitHub Actions deployment authentication is designed to use OpenID Connect (OIDC).

OIDC allows GitHub Actions to authenticate to Azure without storing Azure credentials as GitHub secrets.

## 6. Azure region

The deployed staging environment uses:

- **Azure Container App:** `hasta-la-vue-lta-staging`
- **Resource group:** `utpost-maria-rios-rg`
- **Container Apps environment:** `utpost-env`
- **Region:** Sweden Central
- **Subscription:** Pay-As-You-Go
- **Minimum replicas:** 0
- **Maximum replicas:** 1
- **Public URL:** https://hasta-la-vue-lta-staging.wittycliff-f2acc780.swedencentral.azurecontainerapps.io


## 7. Resource usage and costs

The configured CPU and memory allocations listed above are resource
limits, not measurements of actual usage.

Azure Cost Analysis was checked on 2026-11-08 for November 2026:

- **Actual cost:** No cost reported during this period.
- **Forecast:** Unavailable.
- **Budget:** None configured.
- **Scope:** Pay-As-You-Go subscription.
- **Granularity:** Daily.

No cost was reported by Azure for the selected period at the time of checking. This does not necessarily mean that the deployment has no cost, since billing data may be delayed.

### Cold-start measurement

Tested on 2026-11-08 against `/api/health`, when the
Container App had scaled to zero:

- **Initial request (cold start):** 33.95 seconds.
- **Immediate second request (warm):** 0.076 seconds.
- **HTTP status:** 200 for both requests.
- **Replica state:** 0 active replicas before the first request;
  configured minimum 0 and maximum 1.

This is one observed test, not an average. The first request took considerably longer because the application had to start from zero replicas.

## 8. Deployment verification

Verified on 2026-11-08:

- **Git branch:** `main`
- **Deployed commit:** `b844d49c00ebb419fd7cedba612685a4f3b4aa01`
- **Container App revision:** `hasta-la-vue-lta-staging--0000015`
- **API version:** `1.4.2`
- **Health endpoint:** HTTP 200
- **PostgreSQL:** healthy
- **MongoDB:** healthy
- **GraphQL smoke test:** `{ guides { slug } }` returned 40 guides.

The deployed API health response confirmed that the running version and commit SHA matched the latest commit on `main`.

## 9. Staging vs production

The current Azure deployment is a staging environment, not a production setup.

Staging is configured for low-cost development and verification:
- One Container App contains the client, API, PostgreSQL and MongoDB containers.
- The app can scale to zero replicas when idle.
- The maximum replica count is one.
- `SEED_ON_START=1` allows seed data to be loaded when the application starts.
- No persistent Azure volume is configured for the database containers.
  Database data must therefore be treated as ephemeral and may be lost when containers are recreated.

For production, this architecture should be reviewed before launch. Production
should use durable managed database services or explicitly configured persistent
storage, backups, monitoring, appropriate availability and scaling settings,
and production-specific secrets. Production should not rely on seed data being
loaded at every application startup.

No production environment is currently deployed by this project.

## 10. Alternatives considered

| Option | Region | Advantages | Why not selected |
|---|---|---|---|
| Azure Container Apps | Sweden Central | Existing Azure environment; supports multiple containers, internal communication and scale-to-zero. | Selected because the team already had a working Azure setup and GitHub OIDC deployment. |
| AWS ECS with Fargate | Stockholm (`eu-north-1`) | Runs containers as tasks and charges for requested compute resources. | Would require setting up AWS accounts, permissions, networking and image publishing. |
| Google Cloud Run | Stockholm (`europe-north2`) | Supports multi-container services and usage-based billing. | Would require a separate GCP project, permissions and deployment pipeline. |

Azure was selected because the team already had access to an Azure subscription
and resource group, and the GitHub Actions deployment using OIDC was working.
The decision was based on the existing team setup and reduced operational work,
not on a verified claim that Azure is the cheapest provider.

## 11. Inlåsning

The following files contain Azure-specific deployment or infrastructure
configuration and would need to be reviewed when moving to another hosting
provider:

- `infra/azure/staging.yaml` — Azure Container Apps configuration.
- `infra/azure/skapa-staging.sh` — creates or updates the Azure staging app.
- `infra/azure/identitet.sh` — Azure identity and authentication setup.
- `.github/workflows/ci.yml` — GitHub Actions deployment steps and Azure login.

The replacement would also need equivalent container image publishing, environment variables, secrets management, networking, health checks and deployment configuration.