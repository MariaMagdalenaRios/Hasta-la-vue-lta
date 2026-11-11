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
| Concurrent HTTP requests per instance | 1 |
| URL | `https://hasta-la-vue-lta-image-fn.azurewebsites.net/api/process-image` |

The function is created by `infra/azure/skapa-funktion.sh`. The function key is never stored in the repository. It is read at runtime and stored as the Azure Container Apps secret `image-function-key`.

The first function deployment (`hasta-la-vue-lta-fn`, used for the cold-start measurements) ran in `germanywestcentral` and not in `swedencentral`, where the resource group is. The current function `hasta-la-vue-lta-image-fn` runs in `swedencentral`. The policy "Allowed resource deployment regions" in the subscription of the first deployment only permits `italynorth`, `austriaeast`, `switzerlandnorth`, `germanywestcentral` and `denmarkeast`. Of these, Flex Consumption supports all except `denmarkeast`.

## Concurrency

Flex Consumption allows 16 concurrent HTTP requests per instance by default. The function does CPU work in Node.js, which has one thread, so 16 requests on one instance would still run one at a time.

The setting `perInstanceConcurrency=1` gives each simultaneous request its own instance. This is the scale-out behaviour we want to measure. An I/O-heavy API would use a higher value.

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
