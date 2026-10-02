'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { clampRate } = require('../shared/time');

function lengthScaleForRate(rate) {
  const safe = clampRate(rate, 1);
  return (Math.round((1 / safe) * 1000) / 1000).toFixed(3);
}

function piperArguments(options) {
  const args = [
    '--model', options.modelPath,
    '--output_file', options.outputFile,
    '--length_scale', lengthScaleForRate(options.rate)
  ];
  if (Number.isInteger(options.speakerId) && options.speakerId >= 0) {
    args.push('--speaker', String(options.speakerId));
  }
  return args;
}

function cleanSpeechEnv(base, espeakData) {
  const env = { ...base };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.PHONEMIZER_ESPEAK_LIBRARY;
  if (espeakData) env.ESPEAK_DATA_PATH = espeakData;
  else delete env.ESPEAK_DATA_PATH;
  return env;
}

function kokoroArguments(options) {
  return [
    '--model', options.modelPath,
    '--voices', options.voicesPath,
    '--voice', options.kokoroVoice,
    '--output_file', options.outputFile,
    '--speed', String(clampRate(options.rate, 1)),
    '--lang', options.lang || 'en-gb'
  ];
}

function runSpeechEngine(options) {
  const exe = options.exe;
  const text = String(options.text || '').replace(/\s+/g, ' ').trim();
  const outputFile = options.outputFile;
  const timeoutMs = options.timeoutMs || 120000;
  const label = options.label || 'Speech';
  return new Promise((resolve, reject) => {
    if (!text) {
      reject(new Error('There is no text to speak.'));
      return;
    }
    if (!fs.existsSync(exe)) {
      reject(new Error('The selected speech program was not found.'));
      return;
    }
    if (options.modelPath && !fs.existsSync(options.modelPath)) {
      reject(new Error('The selected voice model is missing.'));
      return;
    }
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const child = spawn(exe, options.args, {
      cwd: options.cwd,
      windowsHide: true,
      env: options.env
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Speech generation took too long and was stopped.'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${label} exited with code ${code}. ${stderr.trim()}`));
        return;
      }
      if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size < 44) {
        reject(new Error(`${label} did not produce audio. ${stderr.trim()}`));
        return;
      }
      resolve({ stderr });
    });
    child.stdin.write(text, 'utf8');
    child.stdin.end();
  });
}

function synthesizeToFile(options) {
  if (options.engine === 'kokoro') {
    return runSpeechEngine({
      exe: options.engineExe,
      args: kokoroArguments(options),
      cwd: options.engineDir,
      env: cleanSpeechEnv(process.env, ''),
      modelPath: options.modelPath,
      text: options.text,
      outputFile: options.outputFile,
      timeoutMs: options.timeoutMs,
      label: 'Kokoro'
    });
  }
  if (options.engine === 'piper18') {
    return runSpeechEngine({
      exe: options.engineExe,
      args: piperArguments(options),
      cwd: options.engineDir,
      env: cleanSpeechEnv(process.env, ''),
      modelPath: options.modelPath,
      text: options.text,
      outputFile: options.outputFile,
      timeoutMs: options.timeoutMs,
      label: 'Piper'
    });
  }
  const piperExe = options.piperExe;
  const piperDir = options.piperDir;
  const modelPath = options.modelPath;
  const text = String(options.text || '').replace(/\s+/g, ' ').trim();
  const outputFile = options.outputFile;
  const timeoutMs = options.timeoutMs || 60000;

  return new Promise((resolve, reject) => {
    if (!text) {
      reject(new Error('There is no text to speak.'));
      return;
    }
    if (!fs.existsSync(piperExe)) {
      reject(new Error('The Piper speech engine was not found. Reinstall ClassBell.'));
      return;
    }
    if (!fs.existsSync(modelPath)) {
      reject(new Error('The selected voice model is missing. Reinstall ClassBell.'));
      return;
    }
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const child = spawn(piperExe, piperArguments(options), {
      cwd: piperDir,
      windowsHide: true,
      env: cleanSpeechEnv(process.env, path.join(piperDir, 'espeak-ng-data'))
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Speech generation took too long and was stopped.'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}. ${stderr.trim()}`));
        return;
      }
      if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size < 44) {
        reject(new Error(`Piper did not produce audio. ${stderr.trim()}`));
        return;
      }
      resolve({ stderr });
    });
    child.stdin.write(text, 'utf8');
    child.stdin.end();
  });
}

function playWavFile(file, timeoutMs) {
  const literal = file.replace(/'/g, "''");
  const command = `$ErrorActionPreference='Stop'; $player = New-Object System.Media.SoundPlayer '${literal}'; $player.PlaySync()`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', command], { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Playback took too long and was stopped.'));
    }, timeoutMs || 180000);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Playback exited with code ${code}.`));
    });
  });
}

module.exports = {
  lengthScaleForRate,
  piperArguments,
  kokoroArguments,
  synthesizeToFile,
  playWavFile
};
