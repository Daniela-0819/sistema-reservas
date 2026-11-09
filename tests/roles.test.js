// Pruebas de seguridad por rol (O4 KR3) y de reglas de mesas combinadas.
// Usan una base de datos simulada: no necesitan Azure SQL. Ejecutar con: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

/* ── BD simulada ─────────────────────────────────────────── */
let handler = () => [];
class FakeRequest {
  constructor() { this.p = {}; }
  input(n, _t, v) { this.p[n] = v; return this; }
  async query(q) { return { recordset: handler(q, this.p) }; }
}
class FakeTx { async begin() {} async commit() {} async rollback() {} }
const fakeSql = new Proxy({}, {
  get: (_, k) => (k === 'Request' ? FakeRequest : k === 'Transaction' ? FakeTx : () => ({})),
});
const dbPath = require.resolve('../server/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { sql: fakeSql, getPool: async () => ({ request: () => new FakeRequest() }) },
};

const app = require('../server/app');
const { sign } = require('../server/middleware/auth');

const tk = (rol, id = 1) => 'Bearer ' + sign({ id, rol, nombre: 'Test ' + rol });
const cliente = tk('cliente', 10), dueno = tk('dueno', 20), admin = tk('admin', 30);

/* ── Acceso por rol ──────────────────────────────────────── */
test('sin token las rutas nuevas responden 401', async () => {
  for (const url of ['/api/admin/resumen', '/api/admin/balances', '/api/estadisticas/generales', '/api/mi-restaurante/estadisticas']) {
    assert.equal((await request(app).get(url)).status, 401, url);
  }
});

test('cliente y dueño NO acceden al panel ni a los balances del admin', async () => {
  for (const t of [cliente, dueno]) {
    for (const url of ['/api/admin/resumen', '/api/admin/balances']) {
      assert.equal((await request(app).get(url).set('Authorization', t)).status, 403, url);
    }
  }
});

test('el admin NO accede a rutas de cliente ni de dueño', async () => {
  assert.equal((await request(app).get('/api/mi-restaurante/estadisticas').set('Authorization', admin)).status, 403);
  assert.equal((await request(app).get('/api/mi-restaurante/reservas').set('Authorization', admin)).status, 403);
  assert.equal((await request(app).get('/api/reservas/mias').set('Authorization', admin)).status, 403);
  assert.equal((await request(app).post('/api/reservas').set('Authorization', admin).send({})).status, 403);
  assert.equal((await request(app).patch('/api/reservas/1/cancelar').set('Authorization', admin).send({})).status, 403);
});

test('cliente no puede ver estadísticas del dueño ni cancelar reservas', async () => {
  assert.equal((await request(app).get('/api/mi-restaurante/estadisticas').set('Authorization', cliente)).status, 403);
  assert.equal((await request(app).patch('/api/reservas/1/cancelar').set('Authorization', cliente).send({})).status, 403);
});

/* ── El admin solo recibe datos agregados ────────────────── */
const SENSIBLES = ['email', 'password_hash', 'cliente', 'dueno_nombre', 'telefono', 'nombre_cliente'];

test('HU16: el resumen del admin solo trae conteos, aunque la consulta devuelva datos personales', async () => {
  handler = () => [{
    restaurantes_registrados: 3, restaurantes_activos: 2, clientes_registrados: 15,
    reservas_activas: 7, reservas_canceladas: 2,
    email: 'ana@correo.com', password_hash: 'xxx', cliente: 'Ana Pérez',
  }];
  const r = await request(app).get('/api/admin/resumen').set('Authorization', admin);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), [
    'clientes_registrados', 'reservas_activas', 'reservas_canceladas', 'restaurantes_activos', 'restaurantes_registrados',
  ]);
  for (const k of SENSIBLES) assert.ok(!(k in r.body), 'se filtró el campo: ' + k);
  const txt = JSON.stringify(r.body);
  for (const v of ['ana@correo.com', 'Ana Pérez', 'xxx']) assert.ok(!txt.includes(v), 'se filtró: ' + v);
});

test('HU15: los balances por restaurante no exponen datos personales', async () => {
  handler = () => [{
    restaurante_id: 1, restaurante: 'La Parrilla', valor_reserva: 15000, mesas: 3,
    reservas_activas: 2, reservas_canceladas: 1, personas: 6, capacidad: 8,
    email: 'dueno@correo.com', password_hash: 'xxx', cliente: 'Ana Pérez', dueno_nombre: 'Pedro Gómez', telefono: '3001234567',
  }];
  const r = await request(app).get('/api/admin/balances').set('Authorization', admin);
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 1);
  assert.deepEqual(Object.keys(r.body[0]).sort(), [
    'mesas', 'ocupacion_pct', 'personas', 'reservas_activas', 'reservas_canceladas',
    'restaurante', 'restaurante_id', 'valor_reservas_activas',
  ]);
  assert.equal(r.body[0].ocupacion_pct, 75);
  assert.equal(r.body[0].valor_reservas_activas, 30000);
  const txt = JSON.stringify(r.body);
  for (const v of ['dueno@correo.com', 'Ana Pérez', 'Pedro Gómez', 'xxx', '3001234567']) assert.ok(!txt.includes(v), 'se filtró: ' + v);
});

test('HU07: las estadísticas generales no incluyen datos de personas', async () => {
  handler = (q) => /TOP 10/.test(q)
    ? [{ restaurante: 'La Parrilla', reservas: 5, personas: 10, capacidad: 20, cliente: 'Ana Pérez', email: 'a@a.com' }]
    : [{ hora: 19, reservas: 4, cliente: 'Ana Pérez' }];
  const r = await request(app).get('/api/estadisticas/generales').set('Authorization', cliente);
  assert.equal(r.status, 200);
  assert.equal(r.body.restaurantes_mas_reservados[0].ocupacion_pct, 50);
  assert.equal(r.body.horarios_mas_demandados[0].hora, 19);
  const txt = JSON.stringify(r.body);
  assert.ok(!txt.includes('Ana Pérez') && !txt.includes('a@a.com'));
});

/* ── Mesas contiguas combinadas (reglas de POST /api/reservas) ── */
const MESAS = [
  { id: 1, numero: 1, capacidad: 2, restaurante_id: 1, duracion_min: 90 },
  { id: 2, numero: 2, capacidad: 2, restaurante_id: 1, duracion_min: 90 },
  { id: 3, numero: 3, capacidad: 4, restaurante_id: 1, duracion_min: 90 },
  { id: 4, numero: 4, capacidad: 4, restaurante_id: 2, duracion_min: 90 },
];
let insertados;
function mesasHandler(q, p) {
  if (/UPDLOCK/.test(q)) {
    const ids = Object.keys(p).filter((k) => /^id\d+$/.test(k)).map((k) => p[k]);
    return MESAS.filter((m) => ids.includes(m.id)).sort((a, b) => a.numero - b.numero);
  }
  if (/SELECT TOP 1 id FROM Reservas/.test(q)) return [];
  if (/INSERT INTO Reservas/.test(q)) { insertados.push(p); return [{ id: 100 + insertados.length }]; }
  return [];
}
const reservar = (body) => request(app).post('/api/reservas').set('Authorization', cliente)
  .send({ inicio: '2099-01-01T19:00', ...body });

test('combinar mesas contiguas crea una reserva con varias mesas y reparte las personas', async () => {
  insertados = []; handler = mesasHandler;
  const r = await reservar({ mesa_ids: [2, 3], personas: 5 });
  assert.equal(r.status, 201);
  assert.equal(r.body.mesa, '2, 3');
  assert.equal(insertados.length, 2);
  assert.equal(insertados.reduce((a, x) => a + x.personas, 0), 5);
  assert.equal(insertados[0].grupo, null);       // la primera fila es la principal
  assert.equal(insertados[1].grupo, 101);        // las demás apuntan a ella
});

test('no deja combinar mesas que no son contiguas', async () => {
  insertados = []; handler = mesasHandler;
  const r = await reservar({ mesa_ids: [1, 3], personas: 4 });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /contiguas/);
  assert.equal(insertados.length, 0);
});

test('no deja combinar mesas si no alcanzan para el grupo', async () => {
  insertados = []; handler = mesasHandler;
  const r = await reservar({ mesa_ids: [1, 2], personas: 5 });
  assert.equal(r.status, 400);
  assert.equal(insertados.length, 0);
});

test('no deja combinar mesas de restaurantes distintos', async () => {
  insertados = []; handler = mesasHandler;
  const r = await reservar({ mesa_ids: [3, 4], personas: 6 });
  assert.equal(r.status, 400);
});

test('la reserva de una sola mesa sigue funcionando igual', async () => {
  insertados = []; handler = mesasHandler;
  const r = await reservar({ mesa_id: 3, personas: 4 });
  assert.equal(r.status, 201);
  assert.equal(insertados.length, 1);
  assert.equal(insertados[0].personas, 4);
});
