const path = require('path');
const fs = require('fs-extra');
const logger = require('./utils/logger');

const OUT_DIR = path.resolve(__dirname, '../output');
const VERCEL_JSON = path.join(OUT_DIR, 'vercel.json');

async function buildVercelConfig() {
  const config = {
    version: 2,
    trailingSlash: true,
    headers: [
      {
        source: "/assets/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ]
  };
  await fs.ensureDir(OUT_DIR);
  await fs.writeJson(VERCEL_JSON, config, { spaces: 2 });
  logger.success('Wrote', path.relative(process.cwd(), VERCEL_JSON));
}

if (require.main === module) {
  buildVercelConfig().catch((err) => {
    logger.error('Deploy config failed', err);
    process.exitCode = 1;
  });
}

module.exports = { buildVercelConfig };

