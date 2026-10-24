'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const ROOT = path.join(__dirname, '..');
const KOKORO_DIR = path.join(ROOT, 'vendor', 'kokoro');
const VOICE_ID = 'ef_dora';

function fail(message) {
  process.stderr.write(`[kokoro-smoke] ERROR: ${message}\n`);
  process.exit(1);
}

function quoteArg(value) {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

async function main() {
  const command = path.join(KOKORO_DIR, 'runtime', 'kokoro-runtime.exe');
  const modelsDir = path.join(KOKORO_DIR, 'models');
  const model = path.join(modelsDir, 'kokoro-v1.0.onnx');
  const voices = path.join(modelsDir, 'voices-v1.0.bin');
  const espeakData = path.join(KOKORO_DIR, 'espeak-ng', 'espeak-ng-data');
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vm-kokoro-smoke-')), 'output.wav');

  for (const file of [command, model, voices, path.join(espeakData, 'es_dict')]) {
    if (!fs.existsSync(file)) fail(`falta ${file}`);
  }

  process.stdout.write(`[kokoro-smoke] engine=kokoro\n`);
  process.stdout.write(`[kokoro-smoke] voiceId=${VOICE_ID}\n`);
  process.stdout.write(`[kokoro-smoke] spawned command: ${command} --output ${quoteArg(output)} --voice ${VOICE_ID} --lang es --speed 1.0\n`);

  const args = [
    '--output', output,
    '--voice', VOICE_ID,
    '--lang', 'es',
    '--speed', '1.0'
  ];

  const text = 'Hola mundo, esta es una prueba real de voz Kokoro.\n';
  
  const child = spawn(command, args, { 
    windowsHide: true, 
    stdio: ['pipe', 'pipe', 'pipe'] 
  });
  
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  
  child.stdin.write(JSON.stringify({ outputPath: output, text, language: 'es', speed: 1.0, pause: 0.2, voiceId: VOICE_ID }));
  child.stdin.end();

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });

  process.stdout.write(`[kokoro-smoke] exit code=${exitCode}\n`);
  if (exitCode !== 0 || !fs.existsSync(output)) {
    fail(`Kokoro no generó audio (exit ${exitCode})\nstdout: ${stdout}\nstderr: ${stderr}`);
  }

  const probe = spawnSync(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,duration_ts,time_base',
    '-of', 'json',
    output
  ], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) fail(`ffprobe falló (exit ${probe.status}): ${probe.stderr}`);
  const stream = JSON.parse(probe.stdout).streams[0];
  const sampleCount = Number(stream.duration_ts);
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) fail(`cantidad de muestras inválida: ${sampleCount}`);
  process.stdout.write(`[kokoro-smoke] sample count=${sampleCount} sample_rate=${stream.sample_rate} channels=${stream.channels}\n`);

  const nullTarget = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const volume = spawnSync(ffmpegPath, [
    '-hide_banner',
    '-i', output,
    '-af', 'volumedetect',
    '-f', 'null',
    nullTarget
  ], { encoding: 'utf8', windowsHide: true });
  const volumeOutput = `${volume.stdout || ''}\n${volume.stderr || ''}`;
  const meanMatch = volumeOutput.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const maxMatch = volumeOutput.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  if (!meanMatch || !maxMatch) fail(`volumedetect no devolvió volumen:\n${volumeOutput}`);
  const meanVolume = Number(meanMatch[1]);
  const maxVolume = Number(maxMatch[1]);
  process.stdout.write(`[kokoro-smoke] volumedetect mean_volume=${meanVolume} dB max_volume=${maxVolume} dB threshold=-50 dB\n`);
  if (!(meanVolume > -50) || !(maxVolume > -50)) fail(`volumen insuficiente: mean=${meanVolume} dB max=${maxVolume} dB`);

  fs.rmSync(path.dirname(output), { recursive: true, force: true });
  process.stdout.write('[kokoro-smoke] SUCCESS\n');
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));