import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// PUT /users/me/password — change own password (any authenticated user)
// Must be defined BEFORE /:id to avoid route conflict
router.put('/me/password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Both passwords required' });

    const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.session.userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [hash, req.session.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /users — list all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /users — create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, role = 'member' } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3) RETURNING id, username, role, is_active, created_at`,
      [username, hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /users/:id/password — reset another user's password (admin only)
router.put('/:id/password', requireAdmin, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(new_password, 12);
    const { rows } = await query(
      'UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2 RETURNING id',
      [hash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /users/:id — update role or active status (admin only, cannot demote self)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { role, is_active } = req.body;
    if (req.params.id === req.session.userId && role !== 'admin')
      return res.status(400).json({ error: 'Cannot remove your own admin role' });
    const { rows } = await query(
      `UPDATE users SET role=$1, is_active=$2, updated_at=now()
       WHERE id=$3 RETURNING id, username, role, is_active, created_at`,
      [role, is_active, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /users/:id — delete user (admin only, cannot delete self)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.session.userId)
      return res.status(400).json({ error: 'Cannot delete your own account' });
    await query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
