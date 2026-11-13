# M7 – Serverless and Performance Testing

## Before the Changes

The first test was done before changing `api/src/routes/photos.js`.

| Measurement | p50 | Max |
|---|---:|---:|
| Upload (POST /api/photos) | 3022 ms | 4686 ms |
| Health (GET /api/health) | 2682 ms | 4524 ms |
| Image processing (processingMs) | 117 ms | 410 ms |

- Successful uploads: 10/10
- Health requests: 39
- Total test time: 4692 ms
- The API did not return `apiMs` before the changes.

## After the Changes

The second test was done after moving image processing from the API to Azure Functions.

The Azure Function was running locally and returned HTTP 200 before the test.

Both tests used the same workload: 10 uploads at the same time, image dimensions of 4000 × 3000, and a health request every 100 ms.

| Measurement | p50 | Max |
|---|---:|---:|
| Upload (POST /api/photos) | 2405 ms | 2422 ms |
| Health (GET /api/health) | 23 ms | 231 ms |
| Image processing (processingMs) | 95 ms | 464 ms |
| API time (apiMs) | 2347 ms | 2365 ms |

- Successful uploads: 10/10
- Health requests: 23
- Total test time: 2426 ms
- Cold starts reported: 0

## Comparison

The maximum health response time decreased from 4524 ms to 231 ms, which is about a 94.9% improvement.

The median health response time (p50) decreased from 2682 ms to 23 ms.

The median upload time (p50) decreased from 3022 ms to 2405 ms.

Image processing now runs in Azure Functions instead of being handled directly by the API.


# Azure Function Platform and Cold Start

## Platform

Image processing runs as an Azure Function (`process-image`) instead of inside the API.

| Setting | Value |
|---|---|
| Function App | `hasta-la-vue-lta-image-fn` |
| Plan | Flex Consumption |
| Runtime | Node.js 22 |
| Region | `swedencentral` |
| Resource group | `utpost-maria-rios-rg` |
| Instance memory | 2048 MB |
| Maximum instances | 10 |
| Concurrent HTTP requests per instance | 2 |
| URL | `https://hasta-la-vue-lta-image-fn.azurewebsites.net/api/process-image` |

The function is created by `infra/azure/skapa-funktion.sh`. The function key is never stored in the repository. It is read at runtime and stored as the Azure Container Apps secret `image-function-key`.

The first function deployment (`hasta-la-vue-lta-fn`, used for the cold-start measurements) ran in `germanywestcentral` and not in `swedencentral`, where the resource group is. The current function `hasta-la-vue-lta-image-fn` runs in `swedencentral`. The policy "Allowed resource deployment regions" in the subscription of the first deployment only permits `italynorth`, `austriaeast`, `switzerlandnorth`, `germanywestcentral` and `denmarkeast`. Of these, Flex Consumption supports all except `denmarkeast`.

## Concurrency

Flex Consumption allows 16 concurrent HTTP requests per instance by default. The function does CPU work in Node.js, which has one thread, so 16 requests on one instance would still run one at a time.

The setting `perInstanceConcurrency=2` allows up to two concurrent HTTP requests per instance. This was the setting used for the confirmed cold-start measurement. A lower concurrency value can encourage scale-out, while a higher value can allow more requests to share an instance.

## Cold-start measurement

Measured on 2026-11-10 against a first deployment of the same function, `hasta-la-vue-lta-fn`, in a separate Azure subscription (created with the same script and settings), with an authenticated `curl` POST (`{"filename":"fjall.jpg","width":4000,"height":3000}`) from a developer laptop. The function returns four variants (1600, 800, 400 and 160 px).

| | Total time | Processing time |
|---|---:|---:|
| Cold start (11 of 13 calls) | 0.91–1.55 s | 66–98 ms |
| Warm (2 calls, `coldStart: false`) | 0.24–0.31 s | 66 ms |

- Processing takes about 66–98 ms in both cases. Almost all of the cold-start time is instance start-up.
- Cold-start overhead is about 0.7–1.3 s on top of the warm time.
- Warm total time includes network and TLS from the laptop to Azure, about 0.17 s.
- Eleven of thirteen calls were cold because of `perInstanceConcurrency=1` and the gap between calls.

Limitation: there are only two warm samples (0.24 s and 0.31 s). For a firmer warm figure, run 10 or more back-to-back calls and use the median.

The function response includes `coldStart`, `instance` and `node`, so the staging upload response can show which instance handled the request.

## Staging integration

Status: done. The staging Container App `hasta-la-vue-lta-staging` (resource group `utpost-maria-rios-rg`, `swedencentral`) is connected to `hasta-la-vue-lta-image-fn`. The api container has `IMAGE_FUNCTION_URL` and `IMAGE_FUNCTION_KEY`, and the key is stored as the Container Apps secret `image-function-key` (`secretref:`). `/api/health` returns HTTP 200.

Function authentication works, and the function returns four variants, `processingMs`, `coldStart` and `instance`.

A direct POST to the public staging API (`/api/photos`) returns the function's `instance` field in its response.

Load test against staging, run by Malena (staging owner): 10 concurrent uploads with 4000 × 3000 image dimensions. The test sends image metadata (`filename`, `width`, `height`), not image bytes.

| Measurement | p50 | Max |
|---|---:|---:|
| Upload (POST /api/photos) | 1237 ms | 1598 ms |
| Image processing (processingMs) | 75 ms | 92 ms |
| API time (apiMs) | 1153 ms | 1506 ms |
| Health (GET /api/health) | 20 ms | not reported |

- Successful uploads: 10/10
- Cold starts reported: 0

## Original Problem and Technical Debt

Before the change, image processing ran inside the Express API when handling `POST /api/photos`.

Image processing is CPU-intensive JavaScript work. Because Node.js executes JavaScript on its event loop, this work could delay other API requests, including `GET /api/health`. In the baseline load test, the maximum health response time was 4524 ms.

Moving image processing out of the API allows the API to remain responsive while the function handles the processing workload independently.

Technical debt #8 in `docs/debt.md` concerned inconsistent API error handling in the old React views (`web/src/pages/*.jsx`). It was later marked as resolved after the Vue migration improved error handling. It is historical context, not the cause of the image-processing performance problem.

## Architecture Decision

**Decision: use Azure Functions for image processing.**

The Express API sends image metadata to an independently deployed Azure Function and receives the generated image variants. The API remains responsible for HTTP requests and application logic; the function handles image processing.

### Alternatives Considered

Exactly two alternatives were considered.

#### 1. Azure Functions — selected

Azure Functions is Microsoft's managed serverless compute platform. It runs code in response to triggers, such as HTTP requests, without requiring the project to manage servers.

It was selected because:

- It integrates directly with the project's existing Azure environment.
- It supports the Node.js 22 runtime used by this project.
- It allows image processing to scale independently of the API.
- It supports independent deployment through the existing GitHub Actions workflow.
- It avoids introducing another deployment framework or hosting platform.

#### 2. Serverless Framework — not selected

Serverless Framework is a framework and command-line tool for defining, packaging and deploying serverless applications and their cloud resources. It is not a hosting platform itself; the functions still run on a cloud provider.

It can be useful when a project manages many functions and infrastructure resources, needs a shared deployment workflow across services, or benefits from its established integrations with providers such as AWS.

It was not selected for Utpost because this project needs one Azure-hosted image-processing function and already uses Azure Functions directly. Adding Serverless Framework would introduce another configuration and deployment abstraction without providing a necessary capability. The native Azure Functions tooling and existing GitHub Actions workflow are a simpler fit for this Azure-specific implementation.

### Why Azure Functions Is Sufficient

Utpost currently needs one independently scalable function for image processing. It does not need a multi-cloud deployment abstraction or a larger serverless orchestration framework.

Azure Functions provides the required HTTP trigger, Node.js runtime, independent scaling and deployment.

A change could be considered if the application needs to support multiple cloud providers, grows to a point where a shared deployment framework provides clear value, or Azure Functions no longer meets measured performance, scaling, cost or reliability requirements.

## Code Location and Vendor Lock-in

The function implementation is in `functions/`. The HTTP-triggered handler is in `functions/src/process-image.js`, and image-processing logic is in `functions/src/image.js`.

The image-processing logic is largely portable Node.js code. The function adapter and deployment are Azure-specific, including:

- The `@azure/functions` programming model and `host.json`.
- Azure Function App hosting and Flex Consumption configuration.
- Azure function-key authentication.
- Azure-specific resource configuration and deployment through `Azure/functions-action@v1`.

Moving to another cloud would require replacing the function entry point, authentication, deployment configuration and hosting integration. The core image-processing logic could potentially be reused.

## Operational Consequences

### Azure Costs

The function has its own Azure resource usage and billing, separate from the Container Apps API. Costs depend on execution count, execution duration, memory allocation and the applicable Azure pricing.

Usage and costs should be monitored in Azure Cost Management. No specific cost saving is claimed without measured billing data.

### Function Key Storage and Rotation

The function uses function-key authentication. The key must not be committed to the repository or printed in CI logs.

The API receives the key through `IMAGE_FUNCTION_KEY`, backed by the Azure Container Apps secret `image-function-key`.

When rotating the key:

1. Generate or regenerate the function key in Azure.
2. Update the Container Apps secret `image-function-key`.
3. Ensure the API container receives the updated secret.
4. Verify that image-processing requests still succeed.

The key must remain out of source control and application logs.

### Independent Deployments

The GitHub Actions workflow has separate deployment jobs for Azure Container Apps and Azure Functions:

- The Container Apps deployment publishes the API and client.
- The Azure Functions deployment publishes the code in `functions/` to the Function App.

The jobs can succeed or fail independently. A successful API deployment does not prove that the function deployment succeeded, and vice versa. Each deployment therefore needs its own verification or smoke test.

## Cold-Start Acceptability

Cold-start impact should be evaluated using the total image-upload request time together with the function's `coldStart` value. The internal `processingMs` alone does not represent the delay experienced by the user.

The November 10 measurements against the earlier Function App showed cold-start totals of 0.91–1.55 seconds and warm totals of 0.24–0.31 seconds. These results are useful as an initial indication, but they were not measured against the current staging Function App.

The current staging app has `alwaysReady` set to an empty list and uses Flex Consumption. A confirmed cold-start measurement was completed against the current staging Function App on November 13. The first request took 1.045 seconds and the second warm request took 0.229 seconds. This confirms that the cold-start behaviour is measurable and that the warm response is substantially faster.

If cold-start delay proves unacceptable, possible mitigations include keeping an instance ready, reducing initialization work and dependencies, or reviewing the hosting and memory configuration. These options should be evaluated against their additional cost and operational complexity. The client can also provide upload progress or a clear loading state while processing takes place.

### Confirmed measurement on the current Function App (13 November 2026)

After 25 minutes of inactivity, two consecutive authenticated requests were sent to the current Function App, `hasta-la-vue-lta-image-fn`, in `swedencentral`.

| Metric | First request | Second request |
|---|---:|---:|
| `coldStart` | `true` | `false` |
| Total response time | 1,045 ms | 229 ms |
| `processingMs` | 93 ms | 65 ms |
| Instance ID | Same | Same |

Both requests were handled by instance `2--1c1400c8-78c6-4c6b-8a3b-091382871251`.

The measurement confirms that the first request was a cold start and the second request was handled by the already-warm process. The HTTP per-instance concurrency was configured to 2 for this test.