import { Router } from 'express';
import { pool } from '../db/client.js';
import { config } from '../config.js';

export const photosRouter = Router();

// Skalar om uppladdade bilder till fyra storlekar och räknar ut en enkel
// bildsignatur så att vi kan hitta dubbletter. Ligger i request-tråden.
const SIZES = [1600, 800, 400, 160];

const resize = (pixels, width, height, targetWidth) => {
  const scale = width / targetWidth;
  const targetHeight = Math.round(height / scale);
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.floor(x * scale);
      const sy = Math.floor(y * scale);
      const src = (sy * width + sx) * 4;
      const dst = (y * targetWidth + x) * 4;
      out[dst] = pixels[src];
      out[dst + 1] = pixels[src + 1];
      out[dst + 2] = pixels[src + 2];
      out[dst + 3] = pixels[src + 3];
    }
  }
  return { pixels: out, width: targetWidth, height: targetHeight };
};

const signature = (pixels) => {
  let hash = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
    hash = (hash * 31 + Math.round(gray)) % 2147483647;
  }
  return hash.toString(16);
};

// M7: anropar bildfunktionen i Azure. Nyckeln kommer ur miljön (secret i Azure) – aldrig ur en fil.
const processInFunction = async (filename, width, height) => {
  const response = await fetch(config.imageFunctionUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-functions-key': config.imageFunctionKey ?? '' },
    body: JSON.stringify({ filename, width, height }),
  });
  if (!response.ok) throw new Error(`bildfunktionen svarade ${response.status}`);
  return response.json();
};

photosRouter.post('/', async (req, res) => {
  const { tourId, filename, width, height } = req.body;

  let variants;
  let processingMs;
  let fn;

  if (config.imageFunctionUrl) {
    try {
      const { variants: v, processingMs: ms, coldStart, instance, node } = await processInFunction(filename, width, height);
      variants = v;
      processingMs = ms;
      fn = { coldStart, instance, node };
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  } else {
    // Klienten skickar inte pixeldata än, så vi genererar en platshållare
    // med samma dimensioner. Samma arbete, samma tid.
    const pixels = new Uint8Array(width * height * 4).fill(128);

    const started = Date.now();
    variants = SIZES.map((size) => {
      const scaled = resize(pixels, width, height, size);
      return { size, signature: signature(scaled.pixels) };
    });
    processingMs = Date.now() - started;
  }

  const result = await pool.query(
    'insert into photos (tour_id, filename, width, height) values ($1,$2,$3,$4) returning *',
    [tourId, filename, width, height],
  );

  res.json({ ...result.rows[0], variants, processingMs, ...(fn && { function: fn }) });
});

photosRouter.get('/tour/:tourId', async (req, res) => {
  const result = await pool.query('select * from photos where tour_id = $1', [req.params.tourId]);
  res.json(result.rows);
});
