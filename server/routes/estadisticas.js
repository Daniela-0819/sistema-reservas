const router = require('express').Router();
const { getPool } = require('../db');
const { auth } = require('../middleware/auth');
const { wrap } = require('../utils');

router.use(auth);

// GET /api/estadisticas/generales  (HU07)
// Datos agregados y no sensibles: solo nombres públicos de restaurantes y conteos.
router.get('/generales', wrap(async (req, res) => {
  const pool = await getPool();
  const ranking = await pool.request().query(`
    SELECT TOP 10 r.nombre AS restaurante,
           SUM(CASE WHEN rv.grupo_id IS NULL THEN 1 ELSE 0 END) AS reservas,
           SUM(rv.personas) AS personas,
           SUM(m.capacidad) AS capacidad
    FROM Reservas rv
    JOIN Mesas m ON m.id = rv.mesa_id
    JOIN Restaurantes r ON r.id = m.restaurante_id
    WHERE rv.estado = 'activa'
    GROUP BY r.id, r.nombre
    ORDER BY reservas DESC, r.nombre`);
  const horas = await pool.request().query(`
    SELECT DATEPART(HOUR, rv.inicio) AS hora, COUNT(*) AS reservas
    FROM Reservas rv
    WHERE rv.estado = 'activa' AND rv.grupo_id IS NULL
    GROUP BY DATEPART(HOUR, rv.inicio)
    ORDER BY hora`);

  res.json({
    restaurantes_mas_reservados: ranking.recordset.map((r) => ({
      restaurante: r.restaurante,
      reservas: r.reservas,
      ocupacion_pct: r.capacidad ? Math.round((100 * r.personas) / r.capacidad) : 0,
    })),
    horarios_mas_demandados: horas.recordset.map((h) => ({ hora: h.hora, reservas: h.reservas })),
  });
}));

module.exports = router;
