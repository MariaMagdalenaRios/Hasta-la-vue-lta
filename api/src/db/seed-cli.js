import { pool } from './client.js';
import { resetDatabase, seedDatabase } from './seed.js';

try {
  await resetDatabase();
  await seedDatabase();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}