// Uso: npm run crear-admin   (lee ADMIN_EMAIL y ADMIN_PASSWORD del .env)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, getPool, closePool } = require('../server/db');

(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 6) {
    console.error('Define ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 6 caracteres) en el .env');
    process.exit(1);
  }
  const pool = await getPool();
  const ya = await pool.request().input('e', sql.NVarChar(150), email).query('SELECT id FROM Usuarios WHERE email = @e');
  if (ya.recordset.length) {
    console.log('Ese correo ya existe, no se creó nada.');
  } else {
    const hash = await bcrypt.hash(password, 10);
    await pool.request()
      .input('e', sql.NVarChar(150), email).input('h', sql.NVarChar(100), hash)
      .query("INSERT INTO Usuarios (nombre, email, password_hash, rol) VALUES ('Admin Total', @e, @h, 'admin')");
    console.log('Admin creado:', email);
  }
  await closePool();
})().catch((e) => { console.error(e.message); process.exit(1); });
