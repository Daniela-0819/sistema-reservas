const router = require('express').Router();
const { sql, getPool } = require('../db');
const { auth } = require('../middleware/auth');
const { wrap, parseLocal, addMin } = require('../utils');

router.use(auth);

// GET /api/restaurantes  -> HU02 / HU03 (nombre, ubicación y valor de la reserva)
router.get('/', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT r.id, r.nombre, r.ubicacion, r.descripcion, r.valor_reserva, r.duracion_min,
           (SELECT COUNT(*) FROM Mesas m WHERE m.restaurante_id = r.id) AS total_mesas
    FROM Restaurantes r
    ORDER BY r.nombre`);
  res.json(r.recordset);
}));

// GET /api/restaurantes/:id/mesas?inicio=YYYY-MM-DDTHH:mm  -> HU04
// Una mesa está libre si no hay una reserva ACTIVA que se cruce con [inicio, inicio + duración).
router.get('/:id/mesas', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const inicio = parseLocal(req.query.inicio);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Restaurante inválido' });
  if (!inicio) return res.status(400).json({ error: 'Indica fecha y hora (YYYY-MM-DDTHH:mm)' });

  const pool = await getPool();
  const rest = await pool.request().input('id', sql.Int, id)
    .query('SELECT id, nombre, ubicacion, descripcion, valor_reserva, duracion_min FROM Restaurantes WHERE id = @id');
  if (!rest.recordset.length) return res.status(404).json({ error: 'Restaurante no encontrado' });
  const restaurante = rest.recordset[0];
  const fin = addMin(inicio, restaurante.duracion_min);

  const mesas = await pool.request()
    .input('rid', sql.Int, id)
    .input('inicio', sql.DateTime2, inicio)
    .input('fin', sql.DateTime2, fin)
    .query(`
      SELECT m.id, m.numero, m.capacidad,
             CASE WHEN EXISTS (
               SELECT 1 FROM Reservas rv
               WHERE rv.mesa_id = m.id AND rv.estado = 'activa'
                 AND rv.inicio < @fin AND rv.fin > @inicio
             ) THEN 0 ELSE 1 END AS disponible
      FROM Mesas m
      WHERE m.restaurante_id = @rid
      ORDER BY m.numero`);

  res.json({
    restaurante,
    mesas: mesas.recordset.map((m) => ({ ...m, disponible: !!m.disponible })),
  });
}));

module.exports = router;
