const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/restaurantes', require('./routes/restaurantes'));
app.use('/api/mi-restaurante', require('./routes/miRestaurante'));
app.use('/api/reservas', require('./routes/reservas'));
app.use('/api/estadisticas', require('./routes/estadisticas'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
