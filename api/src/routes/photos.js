
import { Router } from 'express';
import { pool } from '../db/client.js';
import { config } from '../config.js';

export const photosRouter = Router();

photosRouter.post('/', async (req, res) => {
  const apiStarted = Date.now();
  const { tourId, filename, width, height } = req.body;

  if (!config.imageFunctionUrl) {
    return res.status(502).json({
      error: 'IMAGE_FUNCTION_URL is not configured',
    });
  }

  let processed;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (config.imageFunctionKey) {
      headers['x-functions-key'] = config.imageFunctionKey;
    }

    const response = await fetch(config.imageFunctionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ width, height }),
    });

    if (!response.ok) {
      throw new Error(`Image Function returned ${response.status}`);
    }

    processed = await response.json();
  } catch (error) {
    console.error('Image processing failed:', error);

    return res.status(502).json({
      error: 'Image processing failed',
    });
  }

  const result = await pool.query(
    'insert into photos (tour_id, filename, width, height) values ($1,$2,$3,$4) returning *',
    [tourId, filename, width, height],
  );

  res.json({
    ...result.rows[0],
    variants: processed.variants,
    processingMs: processed.processingMs,
    coldStart: processed.coldStart,
    instance: processed.instance,
    apiMs: Date.now() - apiStarted,
  });
});

photosRouter.get('/tour/:tourId', async (req, res) => {
  const result = await pool.query(
    'select * from photos where tour_id = $1',
    [req.params.tourId],
  );

  res.json(result.rows);
});
