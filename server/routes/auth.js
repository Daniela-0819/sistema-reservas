const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const { sign, auth } = require('../middleware/auth');
const { wrap } = require('../utils');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROL_LABEL = { cliente: 'Cliente', dueno: 'Dueño', admin: 'Administrador' };

// POST /api/auth/register  { nombre, email, password, rol: 'cliente' | 'dueno' }
router.post('/register', wrap(async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!['cliente', 'dueno'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  if (typeof nombre !== 'string' || nombre.trim().length < 2) return res.status(400).json({ error: 'Escribe tu nombre (mínimo 2 caracteres)' });
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'El correo no es válido' });
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });

  const pool = await getPool();
  const correo = email.trim().toLowerCase();
  const existe = await pool.request().input('email', sql.NVarChar(150), correo)
    .query('SELECT id FROM Usuarios WHERE email = @email');
  if (existe.recordset.length) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });

  const hash = await bcrypt.hash(password, 10);
  const r = await pool.request()
    .input('nombre', sql.NVarChar(100), nombre.trim())
    .input('email', sql.NVarChar(150), correo)
    .input('hash', sql.NVarChar(100), hash)
    .input('rol', sql.VarChar(10), rol)
    .query('INSERT INTO Usuarios (nombre, email, password_hash, rol) OUTPUT INSERTED.id VALUES (@nombre, @email, @hash, @rol)');

  const user = { id: r.recordset[0].id, nombre: nombre.trim(), rol };
  res.status(201).json({ token: sign(user), user });
}));

// POST /api/auth/login  { email, password, rol }
router.post('/login', wrap(async (req, res) => {
  const { email, password, rol } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Ingresa un correo válido y tu contraseña' });
  }
  const pool = await getPool();
  const r = await pool.request().input('email', sql.NVarChar(150), email.trim().toLowerCase())
    .query('SELECT id, nombre, rol, password_hash FROM Usuarios WHERE email = @email');
  const u = r.recordset[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  if (rol && u.rol !== rol) {
    return res.status(403).json({ error: `Esta cuenta es de ${ROL_LABEL[u.rol]}. Elige ese perfil para ingresar.` });
  }
  const user = { id: u.id, nombre: u.nombre, rol: u.rol };
  res.json({ token: sign(user), user });
}));

// GET /api/auth/me  (sesión persistente: valida el token guardado)
router.get('/me', auth, wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, req.user.id)
    .query('SELECT id, nombre, rol FROM Usuarios WHERE id = @id');
  if (!r.recordset.length) return res.status(401).json({ error: 'La cuenta ya no existe' });
  res.json({ user: r.recordset[0] });
}));

module.exports = router;
