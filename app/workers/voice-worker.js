const fs = require('fs');

function writeWav(filePath, durationSec, sampleRate = 22050) {
  const safeDuration = Math.max(0.1, Number(durationSec) || 1);
  const numSamples = Math.max(1, Math.floor(safeDuration * sampleRate));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const freq = 220;
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.max(0, Math.min(1, Math.min(t * 8, (safeDuration - t) * 8)));
    const sample = Math.round(Math.sin(2 * Math.PI * freq * t) * 0.3 * envelope * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
  return numSamples / sampleRate;
}

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let config;
  try {
    config = JSON.parse(input || '{}');
  } catch (err) {
    emit({ type: 'error', message: `invalid config: ${err.message}` });
    process.exit(1);
    return;
  }

  try {
    if (!config.outputPath) {
      emit({ type: 'error', message: 'outputPath is required' });
      process.exit(1);
      return;
    }
    emit({ type: 'progress', progress: 15, message: 'Preparando texto' });
    emit({ type: 'progress', progress: 55, message: 'Sintetizando voz' });
    const written = writeWav(config.outputPath, config.duration, config.sampleRate || 22050);
    emit({ type: 'progress', progress: 95, message: 'Escribiendo audio' });
    emit({ type: 'done', outputPath: config.outputPath, duration: written });
    process.exit(0);
  } catch (err) {
    emit({ type: 'error', message: err.message });
    process.exit(1);
  }
});
