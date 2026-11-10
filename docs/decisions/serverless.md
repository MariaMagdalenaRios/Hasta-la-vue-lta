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