// Ejecuta las pruebas de integración contra la BD real (funciona igual en Windows, Mac y Linux).
const { spawnSync } = require('child_process');
const r = spawnSync(process.execPath, ['--test', 'tests/integracion.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_DB_TESTS: '1' },
});
process.exit(r.status ?? 1);
