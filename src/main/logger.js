'use strict';

const fs = require('fs');
const path = require('path');

function createLogger(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  function write(level, message) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
        const backup = `${file}.1`;
        fs.rmSync(backup, { force: true });
        fs.renameSync(file, backup);
      }
      const line = `${new Date().toISOString()} ${level} ${message}\n`;
      fs.appendFileSync(file, line);
    } catch (error) {
      // Logging must not take the classroom app down.
    }
  }

  return {
    info(message) {
      write('INFO', String(message));
    },
    error(message) {
      const text = message instanceof Error ? (message.stack || message.message) : String(message);
      write('ERROR', text);
    }
  };
}

module.exports = { createLogger };
