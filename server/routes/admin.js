const router = require('express').Router();
const { getPool } = require('../db');
const { auth, requireRol } = require('../middleware/auth');
const { wrap } = require('../utils');

router.use(auth, requireRol('admin'));

// GET /api/admin/resumen  (HU16) -> solo conteos
router.get('/resumen', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM Restaurantes) AS restaurantes_registrados,
      (SELECT COUNT(DISTINCT restaurante_id) FROM Mesas) AS restaurantes_activos,
      (SELECT COUNT(*) FROM Usuarios WHERE rol = 'cliente') AS clientes_registrados,
      (SELECT COUNT(*) FROM Reservas WHERE estado = 'activa' AND grupo_id IS NULL) AS reservas_activas,
      (SELECT COUNT(*) FROM Reservas WHERE estado = 'cancelada' AND grupo_id IS NULL) AS reservas_canceladas`);
  const x = r.recordset[0] || {};
  // Lista blanca explícita: nada más sale hacia el admin
  res.json({
    restaurantes_registrados: x.restaurantes_registrados || 0,
    restaurantes_activos: x.restaurantes_activos || 0,
    clientes_registrados: x.clientes_registrados || 0,
    reservas_activas: x.reservas_activas || 0,
    reservas_canceladas: x.reservas_canceladas || 0,
  });
}));

// GET /api/admin/balances  (HU15) -> métricas agregadas por restaurante, sin datos personales
router.get('/balances', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT r.id AS restaurante_id, r.nombre AS restaurante, r.valor_reserva,
           COUNT(DISTINCT m.id) AS mesas,
           SUM(CASE WHEN rv.estado = 'activa' AND rv.grupo_id IS NULL THEN 1 ELSE 0 END) AS reservas_activas,
           SUM(CASE WHEN rv.estado = 'cancelada' AND rv.grupo_id IS NULL THEN 1 ELSE 0 END) AS reservas_canceladas,
           SUM(CASE WHEN rv.estado = 'activa' THEN rv.personas ELSE 0 END) AS personas,
           SUM(CASE WHEN rv.estado = 'activa' THEN m.capacidad ELSE 0 END) AS capacidad
    FROM Restaurantes r
    LEFT JOIN Mesas m ON m.restaurante_id = r.id
    LEFT JOIN Reservas rv ON rv.mesa_id = m.id
    GROUP BY r.id, r.nombre, r.valor_reserva
    ORDER BY r.nombre`);

  // Lista blanca explícita de campos (defensa en profundidad: aunque la consulta cambie, no se filtra nada personal)
  res.json(r.recordset.map((b) => {
    const activas = b.reservas_activas || 0;
    return {
      restaurante_id: b.restaurante_id,
      restaurante: b.restaurante,
      mesas: b.mesas || 0,
      reservas_activas: activas,
      reservas_canceladas: b.reservas_canceladas || 0,
      personas: b.personas || 0,
      ocupacion_pct: b.capacidad ? Math.round((100 * b.personas) / b.capacidad) : 0,
      // Referencial: en SAVORIA no se procesan pagos
      valor_reservas_activas: activas * Number(b.valor_reserva || 0),
    };
  }));
}));

module.exports = router;
