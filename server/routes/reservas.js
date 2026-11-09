const router = require('express').Router();
const { sql, getPool } = require('../db');
const { auth, requireRol } = require('../middleware/auth');
const { wrap, parseLocal, addMin, nowLocal, mapReserva } = require('../utils');

router.use(auth);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// POST /api/reservas  { mesa_id | mesa_ids: [..], inicio: 'YYYY-MM-DDTHH:mm', personas }   (HU05)
// mesa_ids combina varias mesas CONTIGUAS (números consecutivos) en una sola reserva.
const MAX_MESAS_COMBINADAS = 4;

router.post('/', requireRol('cliente'), wrap(async (req, res) => {
  const personas = Number(req.body?.personas);
  const inicio = parseLocal(req.body?.inicio);
  const ids = Array.isArray(req.body?.mesa_ids)
    ? [...new Set(req.body.mesa_ids.map(Number))]
    : [Number(req.body?.mesa_id)];
  if (!ids.length || !ids.every(Number.isInteger) || !inicio || !Number.isInteger(personas) || personas < 1) {
    return res.status(400).json({ error: 'Datos de reserva incompletos o inválidos' });
  }
  if (ids.length > MAX_MESAS_COMBINADAS) {
    return res.status(400).json({ error: `Puedes combinar máximo ${MAX_MESAS_COMBINADAS} mesas` });
  }
  if (inicio <= nowLocal()) return res.status(400).json({ error: 'La fecha y hora deben ser futuras' });

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // UPDLOCK bloquea las filas de las mesas: dos clientes no pueden reservar la misma mesa a la vez.
    const rq = new sql.Request(tx);
    const params = ids.map((id, i) => { rq.input('id' + i, sql.Int, id); return '@id' + i; });
    const m = await rq.query(`
      SELECT m.id, m.numero, m.capacidad, m.restaurante_id, r.duracion_min
      FROM Mesas AS m WITH (UPDLOCK, ROWLOCK)
      JOIN Restaurantes r ON r.id = m.restaurante_id
      WHERE m.id IN (${params.join(',')})
      ORDER BY m.numero`);
    const mesas = m.recordset;
    if (mesas.length !== ids.length) throw new HttpError(404, 'La mesa no existe');

    if (mesas.length === 1) {
      if (personas > mesas[0].capacidad) throw new HttpError(400, `La mesa ${mesas[0].numero} es para máximo ${mesas[0].capacidad} personas`);
    } else {
      if (new Set(mesas.map((x) => x.restaurante_id)).size !== 1) throw new HttpError(400, 'Las mesas deben ser del mismo restaurante');
      for (let i = 1; i < mesas.length; i++) {
        if (mesas[i].numero !== mesas[i - 1].numero + 1) throw new HttpError(400, 'Solo puedes combinar mesas contiguas (números consecutivos)');
      }
      if (personas < mesas.length) throw new HttpError(400, 'Necesitas al menos una persona por mesa combinada');
      if (personas > mesas.reduce((a, x) => a + x.capacidad, 0)) {
        throw new HttpError(400, 'Las mesas combinadas no alcanzan para tu grupo');
      }
    }

    const fin = addMin(inicio, mesas[0].duracion_min); // respeta el tiempo definido por el dueño (HU11)

    for (const mesa of mesas) {
      const choque = await new sql.Request(tx)
        .input('mesa', sql.Int, mesa.id).input('inicio', sql.DateTime2, inicio).input('fin', sql.DateTime2, fin)
        .query(`SELECT TOP 1 id FROM Reservas
                WHERE mesa_id = @mesa AND estado = 'activa' AND inicio < @fin AND fin > @inicio`);
      if (choque.recordset.length) throw new HttpError(409, mesas.length === 1
        ? 'La mesa ya está reservada en ese horario'
        : `La mesa ${mesa.numero} ya está reservada en ese horario`);
    }

    // Reparte las personas entre las mesas (mínimo 1 por mesa, sin pasar la capacidad de cada una)
    let extra = personas - mesas.length;
    const reparto = mesas.map((mesa) => {
      const add = Math.min(extra, mesa.capacidad - 1);
      extra -= add;
      return 1 + add;
    });
    if (mesas.length === 1) reparto[0] = personas;

    let primeraId = null;
    for (let i = 0; i < mesas.length; i++) {
      const ins = await new sql.Request(tx)
        .input('mesa', sql.Int, mesas[i].id).input('cliente', sql.Int, req.user.id)
        .input('inicio', sql.DateTime2, inicio).input('fin', sql.DateTime2, fin).input('personas', sql.Int, reparto[i])
        .input('grupo', sql.Int, primeraId)
        .query(`INSERT INTO Reservas (mesa_id, cliente_id, inicio, fin, personas, grupo_id)
                OUTPUT INSERTED.id VALUES (@mesa, @cliente, @inicio, @fin, @personas, @grupo)`);
      if (i === 0) primeraId = ins.recordset[0].id;
    }
    await tx.commit();

    res.status(201).json(mapReserva({
      id: primeraId, mesa_id: mesas[0].id, mesa: mesas.map((x) => x.numero).join(', '),
      inicio, fin, personas, estado: 'activa',
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
    SELECT MIN(rv.id) AS id, MIN(r.nombre) AS restaurante, MIN(r.valor_reserva) AS valor_reserva,
           STRING_AGG(CAST(m.numero AS NVARCHAR(10)), ', ') WITHIN GROUP (ORDER BY m.numero) AS mesa,
           MIN(rv.inicio) AS inicio, MIN(rv.fin) AS fin, SUM(rv.personas) AS personas,
           MIN(rv.estado) AS estado, MIN(rv.motivo_cancelacion) AS motivo_cancelacion
    FROM Reservas rv
    JOIN Mesas m ON m.id = rv.mesa_id
    JOIN Restaurantes r ON r.id = m.restaurante_id
    WHERE rv.cliente_id = @uid
    GROUP BY COALESCE(rv.grupo_id, rv.id)
    ORDER BY MIN(rv.inicio) DESC`);
  res.json(r.recordset.map(mapReserva));
}));

// PATCH /api/reservas/:id/cancelar  { motivo? }   (HU13: solo el dueño del restaurante)
router.patch('/:id/cancelar', requireRol('dueno'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Reserva inválida' });
  const motivo = (req.body?.motivo || 'Cancelada por el restaurante').toString().trim().slice(0, 200);

  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`
    SELECT rv.id, rv.estado, r.dueno_id, COALESCE(rv.grupo_id, rv.id) AS grupo
    FROM Reservas rv
    JOIN Mesas m ON m.id = rv.mesa_id
    JOIN Restaurantes r ON r.id = m.restaurante_id
    WHERE rv.id = @id`);
  const rv = r.recordset[0];
  if (!rv) return res.status(404).json({ error: 'La reserva no existe' });
  if (rv.dueno_id !== req.user.id) return res.status(403).json({ error: 'Esa reserva no pertenece a tu restaurante' });
  if (rv.estado === 'cancelada') return res.status(409).json({ error: 'La reserva ya estaba cancelada' });

  // Al pasar a 'cancelada' deja de contar en la validación de cruce: la mesa queda libre al instante.
  // Si la reserva combina varias mesas contiguas, se cancelan todas juntas.
  await pool.request().input('grupo', sql.Int, rv.grupo).input('motivo', sql.NVarChar(200), motivo)
    .query(`UPDATE Reservas SET estado = 'cancelada', motivo_cancelacion = @motivo, cancelada_en = SYSUTCDATETIME()
            WHERE COALESCE(grupo_id, id) = @grupo AND estado = 'activa'`);
  res.json({ id, estado: 'cancelada', motivo_cancelacion: motivo });
}));

module.exports = router;
