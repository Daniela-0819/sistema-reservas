// Las fechas se manejan como hora "local del restaurante" sin zona horaria.
// Se guardan en DATETIME2 tal cual (tratadas como UTC solo para evitar desfases del driver).
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN ?? -300); // Colombia = UTC-5

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseLocal(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) return null;
  const d = new Date(str + ':00Z');
  return isNaN(d) ? null : d;
}

const addMin = (d, min) => new Date(d.getTime() + min * 60000);
const nowLocal = () => new Date(Date.now() + TZ_OFFSET_MIN * 60000);
const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 16) : null);

const mapReserva = (r) => ({ ...r, inicio: fmt(r.inicio), fin: fmt(r.fin) });

module.exports = { wrap, parseLocal, addMin, nowLocal, fmt, mapReserva };
