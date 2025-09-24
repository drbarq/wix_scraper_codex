const path = require('path');
const express = require('express');
const logger = require('./utils/logger');

const OUT_DIR = path.resolve(__dirname, '../output');
const app = express();

app.use(express.static(OUT_DIR, {
  extensions: ['html'],
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.use((req, res) => {
  res.status(404).send('Not Found');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.success(`Preview server running at http://localhost:${port}`);
});

