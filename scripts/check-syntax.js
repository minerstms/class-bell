'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const skip = new Set(['node_modules', 'dist', 'vendor', 'tmp', 'build']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(path.join(__dirname, '..'));
for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`Checked ${files.length} JavaScript files.`);
