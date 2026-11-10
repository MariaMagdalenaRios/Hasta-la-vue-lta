
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

vi.mock('../db/client.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../config.js', () => ({
  config: {
    imageFunctionUrl: 'http://localhost:7071/api/process-image',
    imageFunctionKey: 'test-function-key',
  },
}));

import { pool } from '../db/client.js';
import { config } from '../config.js';
import { photosRouter } from './photos.js';

// Keep the real fetch for requests to the test API.
const realFetch = globalThis.fetch;

const photo = {
  tourId: 1,
  filename: 'test.jpg',
  width: 400,
  height: 300,
};

describe('Photo upload API', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    config.imageFunctionUrl = 'http://localhost:7071/api/process-image';
    config.imageFunctionKey = 'test-function-key';

    pool.query.mockResolvedValue({
      rows: [{ id: 1, tour_id: 1, filename: 'test.jpg' }],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/photos', photosRouter);

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const uploadPhoto = (baseUrl) =>
    realFetch(`${baseUrl}/api/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(photo),
    });

  it('forwards image dimensions and function key', async () => {
    const functionFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        variants: [{ size: 400 }],
        processingMs: 50,
        coldStart: false,
        instance: 'test-instance',
      }),
    });

    vi.stubGlobal('fetch', functionFetch);

    const response = await uploadPhoto(baseUrl);

    expect(response.status).toBe(200);

    expect(functionFetch).toHaveBeenCalledWith(
      config.imageFunctionUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-functions-key': 'test-function-key',
        }),
        body: JSON.stringify({ width: 400, height: 300 }),
      }),
    );

    const result = await response.json();

    expect(result.variants).toEqual([{ size: 400 }]);
    expect(result.processingMs).toBe(50);
    expect(result.coldStart).toBe(false);
    expect(result.apiMs).toEqual(expect.any(Number));
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it('returns 502 when Azure Function fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    const response = await uploadPhoto(baseUrl);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Image processing failed',
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 502 when the function URL is missing', async () => {
    config.imageFunctionUrl = undefined;

    const functionFetch = vi.fn();
    vi.stubGlobal('fetch', functionFetch);

    const response = await uploadPhoto(baseUrl);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'IMAGE_FUNCTION_URL is not configured',
    });

    expect(functionFetch).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
