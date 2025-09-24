const path = require('path');
const fs = require('fs-extra');
const logger = require('./utils/logger');

const OUT_DIR = path.resolve(__dirname, '../output');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dest: null, clean: true };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--dest' || a === '-d') {
      out.dest = args[i + 1]; i += 1;
    } else if (a === '--no-clean') {
      out.clean = false;
    }
  }
  return out;
}

async function main() {
  const { dest, clean } = parseArgs();
  if (!await fs.pathExists(OUT_DIR)) {
    logger.error('output/ not found. Run the pipeline first.');
    process.exit(1);
  }
  const target = path.resolve(process.cwd(), dest || 'qr646');
  await fs.ensureDir(target);
  if (clean) {
    await fs.emptyDir(target);
  }
  await fs.copy(OUT_DIR, target, { dereference: true, overwrite: true });
  logger.success('Exported', path.relative(process.cwd(), OUT_DIR), '→', path.relative(process.cwd(), target));
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exitCode = 1; });
}

module.exports = {};

