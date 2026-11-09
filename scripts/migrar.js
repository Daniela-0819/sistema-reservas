// Uso: npm run migrar
// Agrega a Reservas la columna grupo_id (combinación de mesas contiguas). Es idempotente.
require('dotenv').config();
const { getPool, closePool } = require('../server/db');

(async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF COL_LENGTH('Reservas', 'grupo_id') IS NULL
      ALTER TABLE Reservas ADD grupo_id INT NULL;
  `);
  console.log('Migración lista: Reservas.grupo_id disponible.');
  await closePool();
})().catch((e) => { console.error(e.message); process.exit(1); });
