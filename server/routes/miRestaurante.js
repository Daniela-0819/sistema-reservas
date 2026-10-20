const router = require('express').Router();
const { sql, getPool } = require('../db');
const { auth, requireRol } = require('../middleware/auth');
const { wrap, mapReserva } = require('../utils');

router.use(auth, requireRol('dueno'));

async function getRestauranteDe(pool, duenoId) {
  const r = await pool.request().input('uid', sql.Int, duenoId)
    .query('SELECT id, nombre, ubicacion, descripcion, valor_reserva, duracion_min FROM Restaurantes WHERE dueno_id = @uid');
  return r.recordset[0] || null;
}

// GET /api/mi-restaurante -> restaurante + mesas (o restaurante null si aún no lo registra)
router.get('/', wrap(async (req, res) => {
  const pool = await getPool();
  const restaurante = await getRestauranteDe(pool, req.user.id);
  if (!restaurante) return res.json({ restaurante: null, mesas: [] });
  const mesas = await pool.request().input('rid', sql.Int, restaurante.id)
    .query('SELECT id, numero, capacidad FROM Mesas WHERE restaurante_id = @rid ORDER BY numero');
  res.json({ restaurante, mesas: mesas.recordset });
}));

// PUT /api/mi-restaurante  (HU08 registrar, HU09 valor, HU11 duración)
router.put('/', wrap(async (req, res) => {
  const { nombre, ubicacion, descripcion } = req.body || {};
  const valor = Number(req.body?.valor_reserva);
  const duracion = Number(req.body?.duracion_min);
  if (typeof nombre !== 'string' || nombre.trim().length < 2) return res.status(400).json({ error: 'Escribe el nombre del restaurante' });
  if (typeof ubicacion !== 'string' || ubicacion.trim().length < 3) return res.status(400).json({ error: 'Escribe la ubicación del restaurante' });
  if (!Number.isFinite(valor) || valor < 0) return res.status(400).json({ error: 'El valor de la reserva debe ser 0 o mayor' });
  if (!Number.isInteger(duracion) || duracion < 30 || duracion > 480) return res.status(400).json({ error: 'La duración debe estar entre 30 y 480 minutos' });

  const pool = await getPool();
  const existente = await getRestauranteDe(pool, req.user.id);
  const rq = pool.request()
    .input('uid', sql.Int, req.user.id)
    .input('nombre', sql.NVarChar(100), nombre.trim())
    .input('ubicacion', sql.NVarChar(200), ubicacion.trim())
    .input('descripcion', sql.NVarChar(500), (descripcion || '').toString().trim().slice(0, 500) || null)
    .input('valor', sql.Decimal(10, 2), valor)
    .input('duracion', sql.Int, duracion);

  if (existente) {
    await rq.query(`UPDATE Restaurantes SET nombre=@nombre, ubicacion=@ubicacion, descripcion=@descripcion,
                    valor_reserva=@valor, duracion_min=@duracion WHERE dueno_id=@uid`);
  } else {
    await rq.query(`INSERT INTO Restaurantes (dueno_id, nombre, ubicacion, descripcion, valor_reserva, duracion_min)
                    VALUES (@uid, @nombre, @ubicacion, @descripcion, @valor, @duracion)`);
  }
  res.status(existente ? 200 : 201).json({ restaurante: await getRestauranteDe(pool, req.user.id) });
}));

// POST /api/mi-restaurante/mesas  { capacidad, numero? }  (HU10)
router.post('/mesas', wrap(async (req, res) => {
  const capacidad = Number(req.body?.capacidad);
  if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 20) {
    return res.status(400).json({ error: 'La capacidad debe ser un número entre 1 y 20' });
  }
  const pool = await getPool();
  const restaurante = await getRestauranteDe(pool, req.user.id);
  if (!restaurante) return res.status(400).json({ error: 'Primero registra tu restaurante' });

  let numero = Number(req.body?.numero);
  if (!Number.isInteger(numero) || numero < 1) {
    const m = await pool.request().input('rid', sql.Int, restaurante.id)
      .query('SELECT ISNULL(MAX(numero), 0) + 1 AS siguiente FROM Mesas WHERE restaurante_id = @rid');
    numero = m.recordset[0].siguiente;
  }
  const dup = await pool.request().input('rid', sql.Int, restaurante.id).input('n', sql.Int, numero)
    .query('SELECT id FROM Mesas WHERE restaurante_id = @rid AND numero = @n');
  if (dup.recordset.length) return res.status(409).json({ error: `Ya existe la mesa ${numero}` });

  const r = await pool.request().input('rid', sql.Int, restaurante.id).input('n', sql.Int, numero).input('c', sql.Int, capacidad)
    .query('INSERT INTO Mesas (restaurante_id, numero, capacidad) OUTPUT INSERTED.id VALUES (@rid, @n, @c)');
  res.status(201).json({ id: r.recordset[0].id, numero, capacidad });
}));

// GET /api/mi-restaurante/reservas  (HU12)
router.get('/reservas', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('uid', sql.Int, req.user.id).query(`
    SELECT rv.id, u.nombre AS cliente, m.numero AS mesa, rv.inicio, rv.fin, rv.personas, rv.estado, rv.motivo_cancelacion
    FROM Reservas rv
    JOIN Mesas m ON m.id = rv.mesa_id
    JOIN Restaurantes r ON r.id = m.restaurante_id
    JOIN Usuarios u ON u.id = rv.cliente_id
    WHERE r.dueno_id = @uid
    ORDER BY rv.inicio DESC`);
  res.json(r.recordset.map(mapReserva));
}));

module.exports = router;
