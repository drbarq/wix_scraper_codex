const chalk = require('chalk');

const ts = () => new Date().toISOString();

module.exports = {
  info: (...args) => console.log(chalk.blue(`[${ts()}]`), ...args),
  warn: (...args) => console.warn(chalk.yellow(`[${ts()}]`), ...args),
  error: (...args) => console.error(chalk.red(`[${ts()}]`), ...args),
  success: (...args) => console.log(chalk.green(`[${ts()}]`), ...args),
};

