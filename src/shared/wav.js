'use strict';

function parseWav(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let format = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buf.length) break;
    if (id === 'fmt ' && size >= 16) {
      format = {
        audioFormat: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        sampleRate: buf.readUInt32LE(start + 4),
        bitsPerSample: buf.readUInt16LE(start + 14)
      };
    } else if (id === 'data') {
      data = { start, size };
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data) return null;
  return { buffer: buf, format, data };
}

function wavDurationMs(buffer) {
  const parsed = parseWav(buffer);
  if (!parsed) return null;
  const { format, data } = parsed;
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  if (!bytesPerSecond) return null;
  return Math.round((data.size / bytesPerSecond) * 1000);
}

function peakAmplitude(buffer) {
  const parsed = parseWav(buffer);
  if (!parsed || parsed.format.bitsPerSample !== 16) return 0;
  let peak = 0;
  const end = Math.min(parsed.buffer.length, parsed.data.start + parsed.data.size);
  for (let pos = parsed.data.start; pos + 1 < end; pos += 2) {
    const sample = Math.abs(parsed.buffer.readInt16LE(pos));
    if (sample > peak) peak = sample;
  }
  return peak;
}

function applyVolume(buffer, volumePercent) {
  const parsed = parseWav(buffer);
  if (!parsed) throw new Error('Speech engine returned a file that is not a WAV.');
  const factor = Math.max(0, Math.min(100, Number(volumePercent))) / 100;
  const out = Buffer.from(parsed.buffer);
  if (parsed.format.audioFormat !== 1 || parsed.format.bitsPerSample !== 16 || factor === 1) {
    return out;
  }
  const end = Math.min(out.length, parsed.data.start + parsed.data.size);
  for (let pos = parsed.data.start; pos + 1 < end; pos += 2) {
    let next = Math.round(out.readInt16LE(pos) * factor);
    if (next > 32767) next = 32767;
    if (next < -32768) next = -32768;
    out.writeInt16LE(next, pos);
  }
  return out;
}

module.exports = {
  parseWav,
  wavDurationMs,
  peakAmplitude,
  applyVolume
};
