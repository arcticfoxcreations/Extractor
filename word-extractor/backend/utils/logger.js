'use strict';

const config = require('../config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function write(level, message, meta) {
  if (LEVELS[level] > activeLevel) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    message
  };

  if (meta && Object.keys(meta).length > 0) {
    entry.meta = meta;
  }

  const line = config.env === 'development'
    ? `${entry.time} ${level.toUpperCase().padEnd(5)} ${message}${entry.meta ? ' ' + JSON.stringify(entry.meta) : ''}`
    : JSON.stringify(entry);

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta)
};
