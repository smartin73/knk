export function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Unauthorised' });
}

export function requireAdmin(req, res, next) {
  if (req.session?.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required' });
}

export function requireFinanceAccess(req, res, next) {
  const role = req.session?.role;
  if (role === 'admin' || role === 'finance') return next();
  res.status(403).json({ error: 'Finance access required' });
}
