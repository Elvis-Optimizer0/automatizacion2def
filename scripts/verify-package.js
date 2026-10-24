'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ffprobe = require('ffprobe-static');

const resourcesDir = process.argv[2] || path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources');
const kokoroRuntime = path.join(resourcesDir, 'kokoro', 'runtime');
const kokoroModels = path.join(resourcesDir, 'kokoro', 'models');
const whisperBin = path.join(resourcesDir, 'whisper', 'bin');
const whisperModels = path.join(resourcesDir, 'whisper', 'models');


function fail(message) {
  process.stderr.write(`[verify-package] ERROR: ${message}\n`);
  process.exit(1);
}

function check() {
  const files = [
    path.join(kokoroRuntime, 'kokoro-runtime.exe'),
    path.join(kokoroRuntime, 'runner.py'),
    path.join(kokoroRuntime, 'python', 'python.exe'),
    path.join(kokoroModels, 'kokoro-v1.0.onnx'),
    path.join(kokoroModels, 'voices-v1.0.bin'),
    path.join(whisperBin, 'whisper-cli.exe'),
    path.join(whisperModels, 'ggml-base.bin')
  ];
  const missing = files.filter((file) => !fs.existsSync(file));
  if (missing.length) {
    fail(`faltan archivos en el paquete empaquetado:\n  ${missing.join('\n  ')}`);
  }
  process.stdout.write('[verify-package] recursos presentes en ' + resourcesDir + '\n');
}

function checkPythonImport() {
  const python = path.join(kokoroRuntime, 'python', 'python.exe');
  const result = spawnSync(python, ['-c', 'import kokoro_onnx, onnxruntime, soundfile; print("kokoro_onnx ok")'], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONUTF8: '1' }
  });
  if (result.status !== 0) {
    fail(`el python embebido no puede importar los paquetes:\n${result.stdout}\n${result.stderr}`);
  }
  process.stdout.write('[verify-package] ' + String(result.stdout).trim() + '\n');
}

function checkRealVoice() {
  const launcher = path.join(kokoroRuntime, 'kokoro-runtime.exe');
  const out = path.join(os.tmpdir(), `vm-verify-${Date.now()}.wav`);
  const payload = JSON.stringify({
    text: 'Hola, esta es una prueba real del motor de voz Kokoro.',
    voiceId: 'ef_dora',
    language: 'es',
    speed: 1,
    outputPath: out
  });
  const result = spawnSync(launcher, ['--output', out, '--voice', 'ef_dora', '--lang', 'es'], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1' },
    timeout: 240000
  });
  if (result.status !== 0 || !fs.existsSync(out)) {
    fail(`no se pudo generar voz real (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  const probe = spawnSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out], {
    encoding: 'utf8'
  });
  const duration = parseFloat(String(probe.stdout).trim());
  if (!(duration > 0)) {
    fail(`ffprobe no devolvió una duración válida (>0): "${String(probe.stdout).trim()}"`);
  }
  process.stdout.write(`[verify-package] voz real generada: ${path.basename(out)} (${duration.toFixed(2)} s)\n`);
  try { fs.rmSync(out, { force: true }); } catch (_err) { void _err; }
}

function main() {
  check();
  checkPythonImport();
  checkRealVoice();
  process.stdout.write('[verify-package] verificación completa correcta\n');
}

main();
