'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const jobs = [
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx',
    dest: 'voices/en_US-ljspeech-high.onnx',
    min: 90000000,
    big: true
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx.json',
    dest: 'voices/en_US-ljspeech-high.onnx.json',
    min: 100
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/MODEL_CARD',
    dest: 'voices/cards/en_US-ljspeech-high.MODEL_CARD.txt',
    min: 80
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/en_US-kristin-medium.onnx',
    dest: 'voices/en_US-kristin-medium.onnx',
    min: 40000000,
    big: true
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/en_US-kristin-medium.onnx.json',
    dest: 'voices/en_US-kristin-medium.onnx.json',
    min: 100
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/MODEL_CARD',
    dest: 'voices/cards/en_US-kristin-medium.MODEL_CARD.txt',
    min: 80
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/norman/medium/en_US-norman-medium.onnx',
    dest: 'voices/en_US-norman-medium.onnx',
    min: 40000000,
    big: true
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/norman/medium/en_US-norman-medium.onnx.json',
    dest: 'voices/en_US-norman-medium.onnx.json',
    min: 100
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/norman/medium/MODEL_CARD',
    dest: 'voices/cards/en_US-norman-medium.MODEL_CARD.txt',
    min: 80
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/john/medium/en_US-john-medium.onnx',
    dest: 'voices/en_US-john-medium.onnx',
    min: 40000000,
    big: true
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/john/medium/en_US-john-medium.onnx.json',
    dest: 'voices/en_US-john-medium.onnx.json',
    min: 100
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/john/medium/MODEL_CARD',
    dest: 'voices/cards/en_US-john-medium.MODEL_CARD.txt',
    min: 80
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/en_GB-cori-medium.onnx',
    dest: 'voices/en_GB-cori-medium.onnx',
    min: 40000000,
    big: true
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/en_GB-cori-medium.onnx.json',
    dest: 'voices/en_GB-cori-medium.onnx.json',
    min: 100
  },
  {
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/MODEL_CARD',
    dest: 'voices/cards/en_GB-cori-medium.MODEL_CARD.txt',
    min: 80
  }
];

const licenseJobs = [
  {
    urls: [
      'https://raw.githubusercontent.com/rhasspy/piper/master/LICENSE.md',
      'https://raw.githubusercontent.com/rhasspy/piper/master/LICENSE'
    ],
    dest: 'vendor/piper/licenses/piper-MIT.txt',
    min: 50
  },
  {
    urls: [
      'https://raw.githubusercontent.com/rhasspy/piper-phonemize/master/LICENSE.md',
      'https://raw.githubusercontent.com/rhasspy/piper-phonemize/master/LICENSE',
      'https://raw.githubusercontent.com/rhasspy/piper-phonemize/master/COPYING'
    ],
    dest: 'vendor/piper/licenses/piper-phonemize-LICENSE.txt',
    min: 50
  },
  {
    urls: [
      'https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/COPYING',
      'https://www.gnu.org/licenses/gpl-3.0.txt'
    ],
    dest: 'vendor/piper/licenses/espeak-ng-GPL-3.0.txt',
    min: 500
  },
  {
    urls: ['https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE'],
    dest: 'vendor/piper/licenses/onnxruntime-MIT.txt',
    min: 50
  }
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      windowsHide: true,
      stdio: options.stdio || 'inherit'
    });
    let stderr = '';
    if (options.stdio === 'pipe') {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function download(url, dest, minBytes) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
    console.log(`skip ${path.relative(root, dest)}`);
    return;
  }
  const partial = `${dest}.partial`;
  fs.rmSync(partial, { force: true });
  console.log(`get ${url}`);
  await run('curl.exe', [
    '-L',
    '--fail',
    '--retry',
    '3',
    '--retry-delay',
    '2',
    '-A',
    'ClassBellSetup/1.0',
    '-o',
    partial,
    url
  ], { stdio: 'inherit' });
  const size = fs.statSync(partial).size;
  if (size < minBytes) {
    fs.rmSync(partial, { force: true });
    throw new Error(`Download too small (${size} bytes): ${dest}`);
  }
  fs.renameSync(partial, dest);
  console.log(`saved ${path.relative(root, dest)} (${size} bytes)`);
}

async function downloadFirst(urls, dest, minBytes) {
  let lastError = null;
  for (const url of urls) {
    try {
      await download(url, dest, minBytes);
      return;
    } catch (error) {
      lastError = error;
      fs.rmSync(`${dest}.partial`, { force: true });
      console.error(`license download failed: ${url}`);
    }
  }
  throw lastError || new Error(`Could not download ${dest}`);
}

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
}

function copyDirContents(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const src = path.join(fromDir, entry.name);
    const dest = path.join(toDir, entry.name);
    if (entry.isDirectory()) fs.cpSync(src, dest, { recursive: true });
    else fs.copyFileSync(src, dest);
  }
}

async function ensurePiper() {
  const piperDir = path.join(root, 'vendor', 'piper');
  const piperExe = path.join(piperDir, 'piper.exe');
  if (fs.existsSync(piperExe) && fs.statSync(piperExe).size > 400000 && fs.existsSync(path.join(piperDir, 'espeak-ng-data'))) {
    console.log('skip vendor/piper');
    return;
  }
  const zipPath = path.join(root, 'tmp', 'piper_windows_amd64.zip');
  await download(
    'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    zipPath,
    18000000
  );
  const extractDir = path.join(root, 'tmp', 'piper-extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  await run('tar.exe', ['-xf', zipPath, '-C', extractDir]);
  const exe = findFile(extractDir, 'piper.exe');
  if (!exe) throw new Error('piper.exe was not in the official Windows zip.');
  copyDirContents(path.dirname(exe), piperDir);
  if (!fs.existsSync(path.join(piperDir, 'espeak-ng-data'))) {
    throw new Error('espeak-ng-data was not in the official Windows zip.');
  }
  fs.writeFileSync(path.join(piperDir, 'SOURCE.txt'), [
    'Piper 2023.11.14-2 windows amd64',
    'https://github.com/rhasspy/piper/releases/tag/2023.11.14-2',
    'Unmodified official binary.',
    'Piper application code: MIT License (Michael Hansen)',
    'piper-phonemize: MIT License (Michael Hansen)',
    'ONNX Runtime: MIT License (Microsoft)',
    'espeak-ng library and data: GPL-3.0',
    'See the licenses folder and THIRD_PARTY_NOTICES.md.',
    ''
  ].join('\r\n'));
}

function writeHashes(dir, pattern, outFile) {
  const lines = [];
  const files = fs.readdirSync(dir).filter((name) => pattern.test(name)).sort();
  for (const name of files) {
    const full = path.join(dir, name);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    lines.push(`${hash}  ${name}`);
  }
  fs.writeFileSync(outFile, `${lines.join('\n')}\n`);
}

async function main() {
  fs.mkdirSync(path.join(root, 'voices', 'cards'), { recursive: true });
  fs.mkdirSync(path.join(root, 'vendor', 'piper', 'licenses'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });

  for (const job of jobs.filter((item) => !item.big)) {
    await download(job.url, path.join(root, job.dest), job.min);
  }
  await Promise.all(jobs.filter((item) => item.big).map((job) => download(job.url, path.join(root, job.dest), job.min)));
  await ensurePiper();
  for (const job of licenseJobs) {
    await downloadFirst(job.urls, path.join(root, job.dest), job.min);
  }
  writeHashes(path.join(root, 'voices'), /\.(onnx|json)$/, path.join(root, 'voices', 'SHA256SUMS.txt'));
  const piperExe = path.join(root, 'vendor', 'piper', 'piper.exe');
  const piperHash = crypto.createHash('sha256').update(fs.readFileSync(piperExe)).digest('hex');
  fs.writeFileSync(path.join(root, 'vendor', 'piper', 'SHA256SUMS.txt'), `${piperHash}  piper.exe\n`);
  console.log('VENDOR_DONE');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
