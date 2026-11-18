import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { guidesRouter } from './routes/guides.ts';
import { toursRouter } from './routes/tours.js';
import { photosRouter } from './routes/photos.js';
import { pool } from './db/client.js';
import { mongo } from './db/mongo.js';
import { yoga } from './graphql/server.js';

if (!config.jwtSecret) {
  throw new Error(
    'JWT_SECRET is not set. Add it to the project .env file or provide it in the process environment.',
  );
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
// GraphQL endpoint
app.use(yoga.graphqlEndpoint, yoga);
app.get('/api/health', async (req, res) => {
  const check = async (fn) => {
    try {
      await fn();
      return 'ok';
    } catch (err) {
      return `fel: ${err.message}`;
    }
  };
  const postgres = await check(() => pool.query('select 1'));
  const mongodb = await check(async () => {
    await mongo.connect(); 
    await mongo.db().command({ ping: 1 });
  });
  const ok = postgres === 'ok' && mongodb === 'ok';
  //res.status(ok ? 200 : 503).json({ ok, version: '1.4.2', postgres, mongodb });
  res.status(ok ? 200 : 503).json({
    ok,
    version: '1.4.2',
    sha: config.gitSha,
    postgres,
    mongodb,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/guides', guidesRouter);
app.use('/api/tours', toursRouter);
app.use('/api/photos', photosRouter);

// Felhanterare (fyra argument). validate() i lib/validate.js skickar ZodError hit: 400 med vad
// som var fel, fält för fält. Övriga fel går vidare till Express standardhantering.
app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'ogiltig indata',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  next(err);
});


export { app };

// Servern dog i produktion en fredag när någon skrev in ett ogiltigt id.
// Det här håller den vid liv. Anropet får inget svar, men resten funkar. /marcus 2022-09-02
process.on('unhandledRejection', (err) => {
  console.error('Ohanterat fel:', err.message);
});
