
import { Router } from 'express';
import { pool } from '../db/client.js';
import { sign } from '../lib/auth.js';
import { validate } from '../lib/validate.js';
import { loginSchema, registerSchema } from '../lib/schemas.js';
import { wrap } from '../lib/wrap.js';

export const authRouter = Router();

const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  display_name: user.display_name,
  role: user.role,
  created_at: user.created_at,
});

authRouter.post('/login', validate(loginSchema), wrap(async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('select * from users where email = $1', [email]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'fel uppgifter' });
  if (user.password_hash !== `plaintext:${password}`) {
    return res.status(401).json({ error: 'fel uppgifter' });
  }
  res.json({ token: sign(user), user: toPublicUser(user) });
}));

authRouter.post('/register', validate(registerSchema), wrap(async (req, res) => {
  const { email, password, displayName } = req.body;
  const result = await pool.query(
    'insert into users (email, password_hash, display_name) values ($1,$2,$3) returning *',
    [email, `plaintext:${password}`, displayName],
  );
  res.json({ token: sign(result.rows[0]), user: toPublicUser(result.rows[0]) });
}));
