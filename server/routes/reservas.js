const router = require('express').Router();
const { sql, getPool } = require('../db');
const { auth, requireRol } = require('../middleware/auth');
const { wrap, parseLocal, addMin, nowLocal, mapReserva } = require('../utils');

router.use(auth);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// POST /api/reservas  { mesa_id, inicio: 'YYYY-MM-DDTHH:mm', personas }   (HU05)
router.post('/', requireRol('cliente'), wrap(async (req, res) => {
  const mesaId = Number(req.body?.mesa_id);
  const personas = Number(req.body?.personas);
  const inicio = parseLocal(req.body?.inicio);
  if (!Number.isInteger(mesaId) || !inicio || !Number.isInteger(personas) || personas < 1) {
    return res.status(400).json({ error: 'Datos de reserva incompletos o inválidos' });
  }
  if (inicio <= nowLocal()) return res.status(400).json({ error: 'La fecha y hora deben ser futuras' });

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // UPDLOCK bloquea la fila de la mesa: dos clientes no pueden reservar la misma mesa a la vez.
    const m = await new sql.Request(tx).input('id', sql.Int, mesaId).query(`
      SELECT m.id, m.numero, m.capacidad, r.duracion_min
      FROM Mesas AS m WITH (UPDLOCK, ROWLOCK)
      JOIN Restaurantes r ON r.id = m.restaurante_id
      WHERE m.id = @id`);
    const mesa = m.recordset[0];
    if (!mesa) throw new HttpError(404, 'La mesa no existe');
    if (personas > mesa.capacidad) throw new HttpError(400, `La mesa ${mesa.numero} es para máximo ${mesa.capacidad} personas`);

    const fin = addMin(inicio, mesa.duracion_min); // respeta el tiempo definido por el dueño (HU11)

    const choque = await new sql.Request(tx)
      .input('mesa', sql.Int, mesaId).input('inicio', sql.DateTime2, inicio).input('fin', sql.DateTime2, fin)
      .query(`SELECT TOP 1 id FROM Reservas
              WHERE mesa_id = @mesa AND estado = 'activa' AND inicio < @fin AND fin > @inicio`);
    if (choque.recordset.length) throw new HttpError(409, 'La mesa ya está reservada en ese horario');

    const ins = await new sql.Request(tx)
      .input('mesa', sql.Int, mesaId).input('cliente', sql.Int, req.user.id)
      .input('inicio', sql.DateTime2, inicio).input('fin', sql.DateTime2, fin).input('personas', sql.Int, personas)
      .query(`INSERT INTO Reservas (mesa_id, cliente_id, inicio, fin, personas)
              OUTPUT INSERTED.id VALUES (@mesa, @cliente, @inicio, @fin, @personas)`);
    await tx.commit();

    res.status(201).json(mapReserva({
      id: ins.recordset[0].id, mesa_id: mesaId, mesa: mesa.numero, inicio, fin, personas, estado: 'activa',
    }));
  } catch (err) {
    await tx.rollback().catch(() => {});
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

// GET /api/reservas/mias  (HU06)
router.get('/mias', requireRol('cliente'), wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('uid', sql.Int, req.user.id).query(`
    SELECT rv.id, r.nombre AS restaurante, r.valor_reserva, m.numero AS mesa, rv.inicio, rv.fin,
           rv.personas, rv.estado, rv.motivo_cancelacion
    FROM Reservas rv
    JOIN Mesas m ON m.id = rv.mesa_id
    JOIN Restaurantes r ON r.id = m.restaurante_id
    WHERE rv.cliente_id = @uid
    ORDER BY rv.inicio DESC`);
  res.json(r.recordset.map(mapReserva));
}));

// PATCH /api/reservas/:id/cancelar  { motivo? }   (HU13: solo el dueño del restaurante)
router.patch('/:id/cancelar', requireRol('dueno'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Reserva inválida' });
  const motivo = (req.body?.motivo || 'Cancelada por el restaurante').toString().trim().slice(0, 200);

  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`
    SELECT rv.id, rv.estado, r.dueno_id
    FROM Reservas rv
    JOIN Mesas m ON m.id = rv.mesa_id
    JOIN Restaurantes r ON r.id = m.restaurante_id
    WHERE rv.id = @id`);
  const rv = r.recordset[0];
  if (!rv) return res.status(404).json({ error: 'La reserva no existe' });
  if (rv.dueno_id !== req.user.id) return res.status(403).json({ error: 'Esa reserva no pertenece a tu restaurante' });
  if (rv.estado === 'cancelada') return res.status(409).json({ error: 'La reserva ya estaba cancelada' });

  // Al pasar a 'cancelada' deja de contar en la validación de cruce: la mesa queda libre al instante.
  await pool.request().input('id', sql.Int, id).input('motivo', sql.NVarChar(200), motivo)
    .query(`UPDATE Reservas SET estado = 'cancelada', motivo_cancelacion = @motivo, cancelada_en = SYSUTCDATETIME()
            WHERE id = @id AND estado = 'activa'`);
  res.json({ id, estado: 'cancelada', motivo_cancelacion: motivo });
}));

module.exports = router;
