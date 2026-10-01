'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { clampRate } = require('../shared/time');

function lengthScaleForRate(rate) {
  const safe = clampRate(rate, 1);
  return (Math.round((1 / safe) * 1000) / 1000).toFixed(3);
}

function synthesizeToFile(options) {
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
    const child = spawn(piperExe, [
      '--model', modelPath,
      '--output_file', outputFile,
      '--length_scale', lengthScaleForRate(options.rate)
    ], {
      cwd: piperDir,
      windowsHide: true,
      env: {
        ...process.env,
        ESPEAK_DATA_PATH: path.join(piperDir, 'espeak-ng-data')
      }
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
  synthesizeToFile,
  playWavFile
};
