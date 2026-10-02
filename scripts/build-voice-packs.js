'use strict';

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packRoot = path.join(root, 'dist', 'voice-packs');
const piperPython = path.join(root, 'tmp', 'piper-poc', 'Scripts', 'python.exe');
const kokoroPython = path.join(root, 'tmp', 'kokoro-poc', 'Scripts', 'python.exe');
const auModel = path.join(root, 'poc', 'australian-piper', 'en_AU-librivox-medium.onnx');
const auConfig = path.join(root, 'poc', 'australian-piper', 'en_AU-librivox-medium.onnx.json');
const auAttribution = path.join(root, 'poc', 'australian-piper', 'en_AU-librivox-medium.ATTRIBUTION.md');
const kokoroModel = path.join(root, 'poc', 'kokoro', 'kokoro-v1.0.onnx');
const kokoroVoices = path.join(root, 'poc', 'kokoro', 'voices-v1.0.bin');

const AU_VOICES = [
  {
    id: 'bindi',
    name: 'Bindi (Australian female)',
    region: 'Australia',
    gender: 'female',
    speakerKey: 'jenno',
    description: 'Australian English female voice. LibriVox narrator jenno. en_AU-librivox-medium, CC BY 4.0, fine-tuned from en_GB-jenny_dioco-medium by Jenny (Dioco).'
  },
  {
    id: 'marlo',
    name: 'Marlo (Australian female)',
    region: 'Australia',
    gender: 'female',
    speakerKey: 'lucy_burgoyne_1950_2014',
    description: 'Australian English female voice. LibriVox narrator lucy_burgoyne_1950_2014. en_AU-librivox-medium, CC BY 4.0, fine-tuned from en_GB-jenny_dioco-medium by Jenny (Dioco).'
  },
  {
    id: 'kirra',
    name: 'Kirra (Australian female)',
    region: 'Australia',
    gender: 'female',
    speakerKey: 'magdalena',
    description: 'Australian English female voice. LibriVox narrator magdalena. en_AU-librivox-medium, CC BY 4.0, fine-tuned from en_GB-jenny_dioco-medium by Jenny (Dioco).'
  }
];

const BRITISH_VOICES = [
  {
    id: 'alice',
    name: 'Alice (British female)',
    region: 'United Kingdom',
    gender: 'female',
    kokoroVoice: 'bf_alice',
    lang: 'en-gb',
    description: 'British English female Kokoro voice, style bf_alice. The Kokoro model is Apache 2.0. This pack works offline.'
  },
  {
    id: 'emma',
    name: 'Emma (British female)',
    region: 'United Kingdom',
    gender: 'female',
    kokoroVoice: 'bf_emma',
    lang: 'en-gb',
    description: 'British English female Kokoro voice, style bf_emma. The Kokoro model is Apache 2.0. This pack works offline.'
  }
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited ${result.status}`);
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function fileRecord(file, packDir) {
  const stat = fs.statSync(file);
  return {
    path: path.relative(packDir, file).replace(/\\/g, '/'),
    sha256: sha256(file),
    bytes: stat.size
  };
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) return;
  fs.copyFileSync(from, to);
}

function copyLicenses(sitePackages, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(sitePackages)) return;
  for (const entry of fs.readdirSync(sitePackages, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.dist-info')) continue;
    const info = path.join(sitePackages, entry.name);
    for (const name of ['LICENSE', 'LICENSE.txt', 'COPYING', 'COPYING.txt']) {
      const source = path.join(info, name);
      if (fs.existsSync(source)) copyFile(source, path.join(destDir, `${entry.name}-${name}`));
    }
    const nested = path.join(info, 'licenses');
    if (fs.existsSync(nested)) {
      fs.cpSync(nested, path.join(destDir, entry.name), { recursive: true });
    }
  }
}

function freeze(python, entry, name, workName) {
  run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', 'pyinstaller==6.16.0']);
  const distpath = path.join(root, 'tmp', 'pyi-dist', workName);
  const workpath = path.join(root, 'tmp', 'pyi-work', workName);
  fs.rmSync(distpath, { recursive: true, force: true });
  const collect = name === 'piper18'
    ? ['piper', 'onnxruntime']
    : ['kokoro_onnx', 'espeakng_loader', 'phonemizer', 'onnxruntime', 'numpy'];
  const args = [
    '-m', 'PyInstaller',
    '--noconfirm',
    '--clean',
    '--noupx',
    '--onedir',
    '--console',
    '--name', name,
    '--distpath', distpath,
    '--workpath', workpath,
    '--specpath', workpath
  ];
  for (const pkg of collect) {
    args.push('--collect-all', pkg);
  }
  args.push(entry);
  run(python, args);
  const built = path.join(distpath, name);
  const exe = path.join(built, `${name}.exe`);
  if (!fs.existsSync(exe) || !fs.existsSync(path.join(built, '_internal'))) {
    throw new Error(`PyInstaller did not produce ${exe}`);
  }
  return built;
}

function requireSpeaker(config, speakerKey, expected) {
  const id = config.speaker_id_map && config.speaker_id_map[speakerKey];
  if (id !== expected) {
    throw new Error(`Speaker ${speakerKey} is ${id}, expected ${expected}.`);
  }
}

function writeAustralian(engineDir) {
  const packDir = path.join(packRoot, 'australian');
  fs.mkdirSync(packDir, { recursive: true });
  const engineDest = path.join(packDir, 'engine');
  fs.rmSync(engineDest, { recursive: true, force: true });
  fs.cpSync(engineDir, engineDest, { recursive: true });
  const modelDest = path.join(packDir, 'en_AU-librivox-medium.onnx');
  const configDest = path.join(packDir, 'en_AU-librivox-medium.onnx.json');
  copyFile(auModel, modelDest);
  copyFile(auConfig, configDest);
  const config = JSON.parse(fs.readFileSync(configDest, 'utf8'));
  requireSpeaker(config, 'jenno', 1);
  requireSpeaker(config, 'lucy_burgoyne_1950_2014', 2);
  requireSpeaker(config, 'magdalena', 3);
  copyLicenses(path.join(root, 'tmp', 'piper-poc', 'Lib', 'site-packages'), path.join(packDir, 'licenses'));
  if (fs.existsSync(auAttribution)) copyFile(auAttribution, path.join(packDir, 'licenses', 'en_AU-librivox-medium.ATTRIBUTION.md'));
  fs.writeFileSync(path.join(packDir, 'NOTICE.txt'), [
    'ClassBell Australian voice pack.',
    'Speech program: Piper 1.8.0 frozen with PyInstaller 6.16.0 from the local piper-tts wheel.',
    'License: piper-tts is GPL-3.0-or-later. ONNX Runtime is MIT. NumPy is BSD-3-Clause.',
    'Model: en_AU-librivox-medium, CC BY 4.0.',
    'Attribution: fine-tuned from en_GB-jenny_dioco-medium, derived from the Jenny TTS dataset by Jenny (Dioco).',
    'Training audio is public domain, recorded by LibriVox volunteers.',
    'Speakers: Bindi jenno=1, Marlo lucy_burgoyne_1950_2014=2, Kirra magdalena=3.',
    'This pack does not require a separate Python installation.',
    'Source for the speech libraries is the named upstream releases and the license files in licenses/.',
    ''
  ].join('\r\n'));
  const manifest = {
    id: 'australian',
    engine: 'piper18',
    engineExe: 'engine/piper18.exe',
    files: [fileRecord(modelDest, packDir), fileRecord(configDest, packDir)],
    voices: AU_VOICES.map((voice) => ({
      ...voice,
      modelFile: 'en_AU-librivox-medium.onnx',
      configFile: 'en_AU-librivox-medium.onnx.json'
    }))
  };
  fs.writeFileSync(path.join(packDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`PACK australian ${packDir}`);
}

function writeBritish(engineDir) {
  const packDir = path.join(packRoot, 'british');
  fs.mkdirSync(packDir, { recursive: true });
  const engineDest = path.join(packDir, 'engine');
  fs.rmSync(engineDest, { recursive: true, force: true });
  fs.cpSync(engineDir, engineDest, { recursive: true });
  const modelDest = path.join(packDir, 'kokoro-v1.0.onnx');
  const voicesDest = path.join(packDir, 'voices-v1.0.bin');
  copyFile(kokoroModel, modelDest);
  copyFile(kokoroVoices, voicesDest);
  const check = spawnSync(kokoroPython, ['-c', 'import numpy as np; names=np.load(r"""' + voicesDest + '"""); print(",".join(sorted(names.files)))'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (check.status !== 0) throw new Error(check.stderr || 'Could not read Kokoro voices.');
  const names = new Set(check.stdout.trim().split(',').filter(Boolean));
  for (const voice of BRITISH_VOICES) {
    if (!names.has(voice.kokoroVoice)) throw new Error(`Kokoro voice ${voice.kokoroVoice} was not in the voices file.`);
  }
  copyLicenses(path.join(root, 'tmp', 'kokoro-poc', 'Lib', 'site-packages'), path.join(packDir, 'licenses'));
  fs.writeFileSync(path.join(packDir, 'NOTICE.txt'), [
    'ClassBell British voice pack.',
    'Speech program: kokoro-onnx 0.6.1 frozen with PyInstaller 6.16.0.',
    'kokoro-onnx is MIT. The Kokoro v1.0 model is Apache 2.0, as stated by the kokoro-onnx project.',
    'phonemizer is GPL-3.0. espeakng-loader bundles espeak-ng, which is GPL-3.0.',
    'ONNX Runtime is MIT. NumPy is BSD-3-Clause.',
    'Voices in this pack: Alice bf_alice and Emma bf_emma.',
    'Model kokoro-v1.0.onnx and voices-v1.0.bin stay in this folder and work offline.',
    'This pack does not require a separate Python installation.',
    'Source for the speech libraries is the named upstream releases and the license files in licenses/.',
    ''
  ].join('\r\n'));
  const manifest = {
    id: 'british',
    engine: 'kokoro',
    engineExe: 'engine/kokoro.exe',
    modelFile: 'kokoro-v1.0.onnx',
    voicesFile: 'voices-v1.0.bin',
    files: [fileRecord(modelDest, packDir), fileRecord(voicesDest, packDir)],
    voices: BRITISH_VOICES
  };
  fs.writeFileSync(path.join(packDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`PACK british ${packDir}`);
}

function main() {
  for (const file of [piperPython, kokoroPython, auModel, auConfig, kokoroModel, kokoroVoices]) {
    if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  }
  fs.mkdirSync(packRoot, { recursive: true });
  const piperEngine = freeze(piperPython, path.join(root, 'engines', 'piper18_entry.py'), 'piper18', 'piper18');
  writeAustralian(piperEngine);
  const kokoroEngine = freeze(kokoroPython, path.join(root, 'engines', 'kokoro_entry.py'), 'kokoro', 'kokoro');
  writeBritish(kokoroEngine);
  console.log('VOICE_PACKS_DONE');
}

main();
