# Serverless Image Function

## 1. Platform

Image processing runs as an Azure Function (`process-image`) instead of inside the API.

| Setting | Value |
|---|---|
| Function App | `hasta-la-vue-lta-fn` |
| Plan | Flex Consumption |
| Runtime | Node.js 22 |
| Region | `germanywestcentral` |
| Resource group | `utpost-maria-rios-rg` |
| Instance memory | 2048 MB |
| Maximum instances | 10 |
| Concurrent HTTP requests per instance | 1 |
| URL | `https://hasta-la-vue-lta-fn.azurewebsites.net/api/process-image` |

The function is created by `infra/azure/skapa-funktion.sh`. The function key is never stored in the repository. It is read at runtime and stored as the Azure Container Apps secret `image-function-key`.

The function runs in `germanywestcentral` and not in `swedencentral`, where the resource group is. The subscription policy "Allowed resource deployment regions" only permits `italynorth`, `austriaeast`, `switzerlandnorth`, `germanywestcentral` and `denmarkeast`. Of these, Flex Consumption supports all except `denmarkeast`.

## 2. Concurrency

Flex Consumption allows 16 concurrent HTTP requests per instance by default. The function does CPU work in Node.js, which has one thread, so 16 requests on one instance would still run one at a time.

The setting `perInstanceConcurrency=1` gives each simultaneous request its own instance. This is the scale-out behaviour we want to measure. An I/O-heavy API would use a higher value.

## 3. Cold-start measurement

Measured on 2026-11-10 with an authenticated `curl` POST (`{"filename":"fjall.jpg","width":4000,"height":3000}`) from a developer laptop. The function returns four variants (1600, 800, 400 and 160 px).

| | Total time | Processing time |
|---|---:|---:|
| Cold start (7 of 8 calls) | 0.91–1.45 s | 66–98 ms |
| Warm (1 call, `coldStart: false`) | 0.24 s | 66 ms |

- Processing takes about 66–98 ms in both cases. Almost all of the cold-start time is instance start-up.
- Cold-start overhead is about 0.7–1.2 s on top of the warm time.
- Warm total time includes network and TLS from the laptop to Azure, about 0.17 s.
- Seven of eight calls were cold because of `perInstanceConcurrency=1` and the gap between calls.

Limitation: there is only one warm sample. For a firmer warm figure, run 10 or more back-to-back calls and use the median.

The function response includes `coldStart`, `instance` and `node`, so the staging upload response can show which instance handled the request.

## 4. Staging integration

Status: not done yet. The staging Container App `hasta-la-vue-lta-staging` did not exist when the function was deployed.

When staging exists, rerun the script with `CONTAINER_APP=hasta-la-vue-lta-staging`. It sets `IMAGE_FUNCTION_URL`, adds the secret `image-function-key` and sets `IMAGE_FUNCTION_KEY` with `secretref:`.
