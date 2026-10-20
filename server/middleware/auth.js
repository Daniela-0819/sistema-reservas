const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion';

const sign = (u) =>
  jwt.sign({ id: u.id, rol: u.rol, nombre: u.nombre }, SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

const requireRol = (...roles) => (req, res, next) =>
  roles.includes(req.user.rol)
    ? next()
    : res.status(403).json({ error: 'No tienes permisos para esta acción' });

module.exports = { sign, auth, requireRol };
