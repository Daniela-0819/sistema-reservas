// Pruebas de integración del flujo completo reserva/cancelación (RES-16 / O5 KR2).
// Usan la BD REAL del .env y se auto-limpian (correos @test.savoria.local).
// Ejecutar con: npm run test:integracion   (antes: npm run migrar)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const ACTIVO = process.env.RUN_DB_TESTS === '1';
const skip = ACTIVO ? false : 'Define RUN_DB_TESTS=1 (usa npm run test:integracion)';

let request, app, bcrypt, sql, getPool, closePool;
if (ACTIVO) {
  require('dotenv').config();
  request = require('supertest');
  app = require('../server/app');
  bcrypt = require('bcryptjs');
  ({ sql, getPool, closePool } = require('../server/db'));
}

const DOM = '@test.savoria.local';
const stamp = Date.now();
const FECHA = '2099-06-15T19:00';
const tok = {};
const ctx = {};
const auth = (t) => ({ Authorization: 'Bearer ' + t });

async function limpiar() {
  const pool = await getPool();
  await pool.request().query(`
    DECLARE @u TABLE (id INT); INSERT INTO @u SELECT id FROM Usuarios WHERE email LIKE '%${DOM}';
    DELETE FROM Reservas WHERE cliente_id IN (SELECT id FROM @u)
       OR mesa_id IN (SELECT m.id FROM Mesas m JOIN Restaurantes r ON r.id = m.restaurante_id WHERE r.dueno_id IN (SELECT id FROM @u));
    DELETE FROM Mesas WHERE restaurante_id IN (SELECT id FROM Restaurantes WHERE dueno_id IN (SELECT id FROM @u));
    DELETE FROM Restaurantes WHERE dueno_id IN (SELECT id FROM @u);
    DELETE FROM Usuarios WHERE id IN (SELECT id FROM @u);`);
}

before(async () => { if (ACTIVO) await limpiar(); });
after(async () => { if (ACTIVO) { await limpiar(); await closePool(); } });

test('preparación: dueño, restaurante, 3 mesas, cliente y admin', { skip }, async () => {
  let r = await request(app).post('/api/auth/register').send({ nombre: 'Dueño Test', email: `dueno${stamp}${DOM}`, password: 'secreto1', rol: 'dueno' });
  assert.equal(r.status, 201); tok.dueno = r.body.token;
  r = await request(app).put('/api/mi-restaurante').set(auth(tok.dueno))
    .send({ nombre: 'Resto Test ' + stamp, ubicacion: 'Calle 1 # 2-3', valor_reserva: 10000, duracion_min: 90 });
  assert.equal(r.status, 201); ctx.rid = r.body.restaurante.id;
  for (let i = 0; i < 3; i++) {
    r = await request(app).post('/api/mi-restaurante/mesas').set(auth(tok.dueno)).send({ capacidad: 2 });
    assert.equal(r.status, 201);
  }
  r = await request(app).post('/api/auth/register').send({ nombre: 'Cliente Test', email: `cliente${stamp}${DOM}`, password: 'secreto1', rol: 'cliente' });
  assert.equal(r.status, 201); tok.cliente = r.body.token;

  const hash = await bcrypt.hash('secreto1', 10);
  const pool = await getPool();
  await pool.request().input('e', sql.NVarChar(150), `admin${stamp}${DOM}`).input('h', sql.NVarChar(100), hash)
    .query("INSERT INTO Usuarios (nombre, email, password_hash, rol) VALUES ('Admin Test', @e, @h, 'admin')");
  r = await request(app).post('/api/auth/login').send({ email: `admin${stamp}${DOM}`, password: 'secreto1', rol: 'admin' });
  assert.equal(r.status, 200); tok.admin = r.body.token;

  r = await request(app).get(`/api/restaurantes/${ctx.rid}/mesas?inicio=${FECHA}`).set(auth(tok.cliente));
  assert.equal(r.status, 200);
  ctx.mesas = r.body.mesas; // [1, 2, 3]
  assert.equal(ctx.mesas.length, 3);
  assert.ok(ctx.mesas.every((m) => m.disponible));
});

test('reservar, bloquear doble reserva, cancelar y liberar la mesa', { skip }, async () => {
  const [m1] = ctx.mesas;
  let r = await request(app).post('/api/reservas').set(auth(tok.cliente)).send({ mesa_id: m1.id, inicio: FECHA, personas: 2 });
  assert.equal(r.status, 201); ctx.reserva = r.body.id;

  r = await request(app).post('/api/reservas').set(auth(tok.cliente)).send({ mesa_id: m1.id, inicio: FECHA, personas: 2 });
  assert.equal(r.status, 409);

  r = await request(app).get(`/api/restaurantes/${ctx.rid}/mesas?inicio=${FECHA}`).set(auth(tok.cliente));
  assert.equal(r.body.mesas.find((m) => m.id === m1.id).disponible, false);

  r = await request(app).get('/api/reservas/mias').set(auth(tok.cliente));
  assert.equal(r.body.find((x) => x.id === ctx.reserva).estado, 'activa');

  r = await request(app).patch(`/api/reservas/${ctx.reserva}/cancelar`).set(auth(tok.cliente)).send({});
  assert.equal(r.status, 403); // un cliente no cancela

  r = await request(app).patch(`/api/reservas/${ctx.reserva}/cancelar`).set(auth(tok.dueno)).send({ motivo: 'Prueba' });
  assert.equal(r.status, 200);

  r = await request(app).get(`/api/restaurantes/${ctx.rid}/mesas?inicio=${FECHA}`).set(auth(tok.cliente));
  assert.equal(r.body.mesas.find((m) => m.id === m1.id).disponible, true); // libre al instante

  r = await request(app).get('/api/reservas/mias').set(auth(tok.cliente));
  assert.equal(r.body.find((x) => x.id === ctx.reserva).estado, 'cancelada');
});

test('combinar mesas contiguas: una sola reserva, se cancela completa', { skip }, async () => {
  const [m1, m2, m3] = ctx.mesas;
  let r = await request(app).post('/api/reservas').set(auth(tok.cliente)).send({ mesa_ids: [m1.id, m3.id], inicio: FECHA, personas: 4 });
  assert.equal(r.status, 400); // 1 y 3 no son contiguas

  r = await request(app).post('/api/reservas').set(auth(tok.cliente)).send({ mesa_ids: [m2.id, m3.id], inicio: FECHA, personas: 4 });
  assert.equal(r.status, 201); ctx.combo = r.body.id;

  r = await request(app).get('/api/mi-restaurante/reservas').set(auth(tok.dueno));
  const filas = r.body.filter((x) => x.estado === 'activa');
  assert.equal(filas.length, 1); // una sola fila para las dos mesas
  assert.equal(filas[0].mesa, '2, 3');
  assert.equal(filas[0].personas, 4);

  r = await request(app).get(`/api/restaurantes/${ctx.rid}/mesas?inicio=${FECHA}`).set(auth(tok.cliente));
  assert.deepEqual(r.body.mesas.map((m) => m.disponible), [true, false, false]);

  r = await request(app).patch(`/api/reservas/${ctx.combo}/cancelar`).set(auth(tok.dueno)).send({});
  assert.equal(r.status, 200);
  r = await request(app).get(`/api/restaurantes/${ctx.rid}/mesas?inicio=${FECHA}`).set(auth(tok.cliente));
  assert.ok(r.body.mesas.every((m) => m.disponible));
});

test('estadísticas: el dueño ve las suyas y el admin solo datos agregados', { skip }, async () => {
  let r = await request(app).get('/api/mi-restaurante/estadisticas').set(auth(tok.dueno));
  assert.equal(r.status, 200);
  assert.equal(r.body.reservas_activas, 0);
  assert.equal(r.body.reservas_canceladas, 2);
  assert.equal(r.body.total_mesas, 3);

  r = await request(app).get('/api/admin/resumen').set(auth(tok.admin));
  assert.equal(r.status, 200);
  assert.ok(r.body.clientes_registrados >= 1);

  r = await request(app).get('/api/admin/balances').set(auth(tok.admin));
  assert.equal(r.status, 200);
  const txt = JSON.stringify(r.body);
  assert.ok(!txt.includes(DOM) && !txt.includes('password'));

  r = await request(app).get('/api/estadisticas/generales').set(auth(tok.cliente));
  assert.equal(r.status, 200);
});
