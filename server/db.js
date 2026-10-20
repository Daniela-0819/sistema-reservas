require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false }, // Azure SQL exige cifrado
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 60000, // Azure SQL Serverless puede tardar en "despertar" tras la auto-pausa
  requestTimeout: 30000,
};

let poolPromise = null;

async function connectWithRetry(intentos = 4) {
  let ultimoError;
  for (let i = 1; i <= intentos; i++) {
    try {
      return await new sql.ConnectionPool(config).connect();
    } catch (err) {
      ultimoError = err;
      console.warn(`[db] intento ${i}/${intentos} falló: ${err.message}`);
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
  throw ultimoError;
}

function getPool() {
  if (!poolPromise) {
    poolPromise = connectWithRetry().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

module.exports = { sql, getPool, closePool };
