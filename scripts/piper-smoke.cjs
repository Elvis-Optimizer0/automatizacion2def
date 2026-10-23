'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const ROOT = path.join(__dirname, '..');
const PIPER_DIR = path.join(ROOT, 'vendor', 'piper');
const VOICE_DIR = process.env.VM_TEST_PIPER_VOICE_DIR || path.join(ROOT, '.engine-cache', 'piper-e2e-voice');
const VOICE_ID = 'es_MX-ald-medium';

function fail(message) {
  process.stderr.write(`[piper-smoke] ERROR: ${message}\n`);
  process.exit(1);
}

function spawnPiper(command, args, text) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(text);
  });
}

function quoteArg(value) {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

async function main() {
  const command = path.join(PIPER_DIR, 'piper.exe');
  const model = path.join(VOICE_DIR, `${VOICE_ID}.onnx`);
  const config = path.join(VOICE_DIR, `${VOICE_ID}.onnx.json`);
  const espeakData = path.join(PIPER_DIR, 'espeak-ng-data');
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vm-piper-smoke-')), 'output.wav');
  const args = [
    '--model', model,
    '--config', config,
    '--output_file', output,
    '--espeak_data', espeakData,
    '--length_scale', '1.0',
    '--sentence_silence', '0.2',
    '--noise_scale', '0.667',
    '--noise_w', '0.8',
    '--speaker', '0'
  ];

  for (const file of [command, model, config, path.join(espeakData, 'es_dict')]) {
    if (!fs.existsSync(file)) fail(`falta ${file}`);
  }

  process.stdout.write(`[piper-smoke] engine=piper\n`);
  process.stdout.write(`[piper-smoke] voiceId=${VOICE_ID}\n`);
  process.stdout.write(`[piper-smoke] spawned command: ${command} ${args.map(quoteArg).join(' ')}\n`);

  const result = await spawnPiper(command, args, 'Hola mundo, esta es una prueba real de voz Piper.\n');
  process.stdout.write(`[piper-smoke] exit code=${result.code}\n`);
  if (result.code !== 0 || !fs.existsSync(output)) {
    fail(`Piper no generó audio (exit ${result.code})\n${result.stdout}\n${result.stderr}`);
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
  process.stdout.write(`[piper-smoke] sample count=${sampleCount} sample_rate=${stream.sample_rate} channels=${stream.channels}\n`);

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
  process.stdout.write(`[piper-smoke] volumedetect mean_volume=${meanVolume} dB max_volume=${maxVolume} dB threshold=-50 dB\n`);
  if (!(meanVolume > -50) || !(maxVolume > -50)) fail(`volumen insuficiente: mean=${meanVolume} dB max=${maxVolume} dB`);

  fs.rmSync(path.dirname(output), { recursive: true, force: true });
  process.stdout.write('[piper-smoke] SUCCESS\n');
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
