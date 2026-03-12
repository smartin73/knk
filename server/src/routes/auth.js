import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';

const router = Router();

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const { rows } = await query(
      'SELECT * FROM users WHERE username = $1', [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session error' });
      }
      res.json({ ok: true, username: user.username });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /auth/me
router.get('/me', (req, res) => {
  if (!req.session?.userId)
    return res.status(401).json({ error: 'Not authenticated' });
  res.json({ userId: req.session.userId, username: req.session.username });
});

export default router;
