# Image Upload Flow – Issue #126

## Overview

The tour detail page allows users to select an image and send its metadata to the API.

This issue implements the client-side flow. **The image file itself is not uploaded.**

## How it works

1. The user selects an image in `TourDetailView.vue`.
2. The client uses `createImageBitmap(file)` to read the image width and height.
3. The client sends a `POST` request to `/api/photos` using the existing `post` helper.

The request contains:

```json
{
  "tourId": 7,
  "filename": "bild.png",
  "width": 1200,
  "height": 800
}
```

## API response

The client displays:

- Four image variants (size and signature).
- Image processing time (`processingMs`).
- API response time (`apiMs`).
- A cold start indicator when `coldStart` is `true`.

If image processing fails and the API returns HTTP 502, the client displays a user-friendly error message.

## Shared types

The following TypeScript interfaces are defined in `shared/src/types.ts`:

- `PhotoUploadRequest`
- `PhotoVariant`
- `PhotoUploadResponse`

## Dependencies

The complete flow depends on the API changes in **Issue #125** and the Azure Function from **Issue #124**.

Until those changes are merged, the API on `main` does not return all the fields expected by this client.

## Verification

Run from the project root:

```bash
npm test
npm run typecheck
```

Verified locally: **92 tests passed**, with 1 existing todo, and TypeScript checks passed.