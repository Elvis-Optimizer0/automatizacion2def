'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const CACHE = path.join(ROOT, '.engine-cache');
const STAMP = path.join(VENDOR, '.engines-stamp.json');
const ASSETS = path.join(__dirname, 'assets');

const CONFIG_VERSION = '2026-10-18-v1';

const PYTHON_VERSION = '3.13.16';
const PIP_PACKAGES = [
  'kokoro-onnx==0.6.1',
  'onnxruntime==1.31.0',
  'numpy==2.5.4',
  'soundfile==0.14.0',
  'phonemizer==3.4.0',
  'espeakng-loader==0.2.4'
];

const ARTIFACTS = {
  python: {
    url: `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`,
    sha256: '97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297',
    file: `python-${PYTHON_VERSION}-embed-amd64.zip`
  },
  pip: {
    url: 'https://files.pythonhosted.org/packages/f3/6e/1736e5b4ae2b778ef2f81c47d797de9f891d4d8acb047a24ca37a60294dd/pip-26.2.1-py3-none-any.whl',
    sha256: '71138adf1f4ca900cdb7d289c21b7494329f2332b6d85f0e1c42108c0384ed3e',
    file: 'pip-26.2.1-py3-none-any.whl'
  },
  espeak: {
    url: 'https://github.com/espeak-ng/espeak-ng/releases/download/1.52.0/espeak-ng.msi',
    sha256: '7f673c709ea5dd579d3b5ebb98688cc575328a6ab7438d2bc405b88cedaeafb9',
    file: 'espeak-ng-1.52.0.msi'
  },
  whisper: {
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
    sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
    file: 'whisper-bin-x64-b5454.zip'
  },
  kokoroModel: {
    url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx',
    sha256: 'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a',
    file: 'kokoro-v1.0.onnx'
  },
  kokoroVoices: {
    url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin',
    sha256: 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
    file: 'voices-v1.0.bin'
  },
  whisperModel: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    file: 'ggml-base.bin'
  },
  piper: {
    url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea',
    file: 'piper_windows_amd64.zip'
  },
  piperModels: {
    'es_MX-ald-medium': {
      onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx',
      json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json',
      sha256: 'pending',
      license: 'Unlicense'
    },
    'es_MX-ald-x_low': {
      onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx',
      json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx.json',
      sha256: 'pending',
      license: 'Unlicense'
    },
    'es_ES-carlfm-x_low': {
      onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx',
      json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx.json',
      sha256: 'pending',
      license: 'Public domain'
    },
    'es_ES-carlfm-medium': {
      onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/medium/es_ES-carlfm-medium.onnx',
      json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/medium/es_ES-carlfm-medium.onnx.json',
      sha256: 'pending',
      license: 'Public domain'
    },
    'en_US-lessac-medium': {
      onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
      json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json',
      sha256: 'pending',
      license: 'Blizzard (non-commercial)'
    },
    'en_US-lessac-low': {
      onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx',
      json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json',
      sha256: 'pending',
      license: 'Blizzard (non-commercial)'
    }
  }
};

const PATHS = {
  pythonDir: path.join(VENDOR, 'kokoro', 'runtime', 'python'),
  runtimeDir: path.join(VENDOR, 'kokoro', 'runtime'),
  kokoroModels: path.join(VENDOR, 'kokoro', 'models'),
  espeakDir: path.join(VENDOR, 'kokoro', 'espeak-ng'),
  whisperBin: path.join(VENDOR, 'whisper', 'bin'),
  whisperModels: path.join(VENDOR, 'whisper', 'models'),
  piperDir: path.join(VENDOR, 'piper'),
  piperModels: path.join(VENDOR, 'piper', 'models')
};

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const SKIP_MODELS = args.includes('--skip-models');

function log(message) {
  process.stdout.write(`[fetch-engines] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[fetch-engines] ERROR: ${message}\n`);
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function configHash() {
  const payload = JSON.stringify({ CONFIG_VERSION, ARTIFACTS, PIP_PACKAGES, PYTHON_VERSION });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function httpGet(url, onResponse) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'video-maker-fetch-engines' } }, (response) => {
      const status = response.statusCode;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        httpGet(next, onResponse).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`respuesta HTTP ${status} para ${url}`));
        return;
      }
      onResponse(response).then(resolve, reject);
    }).on('error', reject);
  });
}

async function downloadArtifact(key, destPath) {
  const artifact = ARTIFACTS[key];
  if (!artifact) fail(`artefacto desconocido: ${key}`);

  if (!FORCE && fs.existsSync(destPath)) {
    const current = await sha256File(destPath);
    if (current === artifact.sha256) {
      log(`ok (cache): ${key}`);
      return destPath;
    }
    log(`hash distinto, se vuelve a descargar: ${key}`);
    fs.rmSync(destPath, { force: true });
  }

  ensureDir(path.dirname(destPath));
  const tempPath = `${destPath}.part`;
  fs.rmSync(tempPath, { force: true });
  log(`descargando ${key}: ${artifact.url}`);

  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await httpGet(artifact.url, (response) => new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tempPath);
    response.on('data', (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    response.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => {
      out.close(() => resolve());
    });
    response.pipe(out);
  }));

  const digest = hash.digest('hex');
  if (digest !== artifact.sha256) {
    fs.rmSync(tempPath, { force: true });
    fail(`SHA-256 no coincide para ${key}. Esperado ${artifact.sha256}, obtenido ${digest}. Abortando.`);
  }
  fs.renameSync(tempPath, destPath);
  log(`verificado ${key} (${bytes} bytes, sha256 ${digest.slice(0, 12)}…)`);
  return destPath;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: options.stdio || 'inherit',
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) }
  });
  if (result.error) fail(`no se pudo ejecutar ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} terminó con código ${result.status}`);
  return result;
}

function requireWindowsX64() {
  if (process.platform !== 'win32') {
    fail('fetch-engines solo soporta Windows (los motores son binarios de Windows x64).');
  }
}

function extractZip(zipPath, targetDir) {
  ensureDir(targetDir);
  run('tar', ['-xf', zipPath, '-C', targetDir]);
}

function moveContents(fromDir, toDir) {
  ensureDir(toDir);
  for (const entry of fs.readdirSync(fromDir)) {
    const source = path.join(fromDir, entry);
    const target = path.join(toDir, entry);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(source, target, { recursive: true, dereference: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
}

function stampOk() {
  try {
    const data = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
    if (data.configHash !== configHash()) return false;
  } catch (_err) {
    return false;
  }
  const required = [
    path.join(PATHS.pythonDir, 'python.exe'),
    path.join(PATHS.kokoroModels, 'kokoro-v1.0.onnx'),
    path.join(PATHS.kokoroModels, 'voices-v1.0.bin'),
    path.join(PATHS.whisperBin, 'whisper-cli.exe'),
    path.join(PATHS.whisperModels, 'ggml-base.bin'),
    path.join(PATHS.piperDir, 'piper.exe')
  ];
  return required.every((file) => fs.existsSync(file));
}

function writeStamp() {
  ensureDir(VENDOR);
  fs.writeFileSync(STAMP, JSON.stringify({ configHash: configHash(), at: new Date().toISOString() }, null, 2));
}

async function installPython() {
  const pythonExe = path.join(PATHS.pythonDir, 'python.exe');
  if (!FORCE && fs.existsSync(pythonExe)) {
    log('python embebido ya presente');
  } else {
    fs.rmSync(PATHS.pythonDir, { recursive: true, force: true });
    const zip = await downloadArtifact('python', path.join(CACHE, ARTIFACTS.python.file));
    log('extrayendo python embebido');
    extractZip(zip, PATHS.pythonDir);
  }

  const pth = path.join(PATHS.pythonDir, 'python313._pth');
  if (fs.existsSync(pth)) {
    fs.writeFileSync(pth, 'python313.zip\r\n.\r\nLib\\site-packages\r\nimport site\r\n');
  }
  ensureDir(path.join(PATHS.pythonDir, 'Lib', 'site-packages'));

  const pipSentinel = path.join(PATHS.pythonDir, 'Lib', 'site-packages', 'pip', '__init__.py');
  if (!FORCE && fs.existsSync(pipSentinel)) {
    log('pip ya instalado en el python embebido');
    return;
  }
  const pipWheel = await downloadArtifact('pip', path.join(CACHE, ARTIFACTS.pip.file));
  log('instalando pip en el python embebido');
  extractZip(pipWheel, path.join(PATHS.pythonDir, 'Lib', 'site-packages'));
}

function installPythonPackages() {
  const kokoroSentinel = path.join(PATHS.pythonDir, 'Lib', 'site-packages', 'kokoro_onnx', '__init__.py');
  if (!FORCE && fs.existsSync(kokoroSentinel)) {
    log('paquetes de python ya instalados');
    return;
  }
  log(`instalando paquetes: ${PIP_PACKAGES.join(', ')}`);
  const pythonExe = path.join(PATHS.pythonDir, 'python.exe');
  run(pythonExe, [
    '-m', 'pip', 'install',
    '--no-cache-dir',
    '--disable-pip-version-check',
    '--no-warn-script-location',
    ...PIP_PACKAGES
  ], { env: { PYTHONNOUSERSITE: '1', PYTHONUTF8: '1' } });
}

function prunePython() {
  const sitePackages = path.join(PATHS.pythonDir, 'Lib', 'site-packages');
  if (!fs.existsSync(sitePackages)) return;
  const stack = [sitePackages];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') {
          fs.rmSync(full, { recursive: true, force: true });
          continue;
        }
        stack.push(full);
      }
    }
  }
}

function buildLauncher() {
  const exe = path.join(PATHS.runtimeDir, 'kokoro-runtime.exe');
  if (!FORCE && fs.existsSync(exe)) {
    log('kokoro-runtime.exe ya compilado');
    return;
  }
  ensureDir(PATHS.runtimeDir);
  const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(csc)) {
    fail(`no se encontró csc.exe en ${csc}; se necesita .NET Framework 4.x para compilar el lanzador.`);
  }
  log('compilando kokoro-runtime.exe');
  run(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    `/out:${exe}`,
    path.join(ASSETS, 'kokoro-launcher.cs')
  ]);
  fs.copyFileSync(path.join(ASSETS, 'kokoro-runner.py'), path.join(PATHS.runtimeDir, 'runner.py'));
}

async function installEspeak() {
  const sentinel = path.join(PATHS.espeakDir, 'espeak-ng-data', 'es_dict');
  if (!FORCE && fs.existsSync(sentinel)) {
    log('espeak-ng ya extraído');
    return;
  }
  const msi = await downloadArtifact('espeak', path.join(CACHE, ARTIFACTS.espeak.file));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-espeak-'));
  try {
    log('extrayendo espeak-ng (msiexec /a)');
    run('msiexec.exe', ['/a', msi, '/qn', `TARGETDIR=${temp}`]);
    const nested = path.join(temp, 'eSpeak NG');
    const source = fs.existsSync(nested) ? nested : temp;
    fs.rmSync(PATHS.espeakDir, { recursive: true, force: true });
    moveContents(source, PATHS.espeakDir);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function installWhisper() {
  const exe = path.join(PATHS.whisperBin, 'whisper-cli.exe');
  if (!FORCE && fs.existsSync(exe)) {
    log('whisper.cpp ya extraído');
  } else {
    const zip = await downloadArtifact('whisper', path.join(CACHE, ARTIFACTS.whisper.file));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-whisper-'));
    try {
      log('extrayendo whisper.cpp');
      extractZip(zip, temp);
      const release = path.join(temp, 'Release');
      fs.rmSync(PATHS.whisperBin, { recursive: true, force: true });
      moveContents(fs.existsSync(release) ? release : temp, PATHS.whisperBin);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  const model = path.join(PATHS.whisperModels, 'ggml-base.bin');
  if (!FORCE && fs.existsSync(model)) {
    log('modelo de whisper ya presente');
  } else {
    const downloaded = await downloadArtifact('whisperModel', path.join(CACHE, ARTIFACTS.whisperModel.file));
    ensureDir(PATHS.whisperModels);
    fs.copyFileSync(downloaded, model);
  }
}

async function installKokoroModels() {
  ensureDir(PATHS.kokoroModels);
  for (const [key, name] of [['kokoroModel', 'kokoro-v1.0.onnx'], ['kokoroVoices', 'voices-v1.0.bin']]) {
    const dest = path.join(PATHS.kokoroModels, name);
    if (!FORCE && fs.existsSync(dest)) {
      log(`${name} ya presente`);
      continue;
    }
    const downloaded = await downloadArtifact(key, path.join(CACHE, ARTIFACTS[key].file));
    fs.copyFileSync(downloaded, dest);
  }
}

async function installPiper() {
  const exe = path.join(PATHS.piperDir, 'piper.exe');
  if (!FORCE && fs.existsSync(exe)) {
    log('piper.exe ya presente');
  } else {
    const zip = await downloadArtifact('piper', path.join(CACHE, ARTIFACTS.piper.file));
    log('extrayendo piper');
    extractZip(zip, PATHS.piperDir);
  }

  ensureDir(PATHS.piperModels);
  for (const [voiceKey, voiceInfo] of Object.entries(ARTIFACTS.piperModels)) {
    const onnxDest = path.join(PATHS.piperModels, `${voiceKey}.onnx`);
    const jsonDest = path.join(PATHS.piperModels, `${voiceKey}.onnx.json`);

    if (!FORCE && fs.existsSync(onnxDest) && fs.existsSync(jsonDest)) {
      log(`${voiceKey} ya presente`);
      continue;
    }

    const onnxUrl = voiceInfo.onnx;
    const jsonUrl = voiceInfo.json;

    const onnxTemp = `${onnxDest}.part`;
    const jsonTemp = `${jsonDest}.part`;

    if (!FORCE && fs.existsSync(onnxDest)) {
      log(`${voiceKey}.onnx ya presente`);
    } else {
      log(`descargando ${voiceKey}.onnx`);
      await httpGet(onnxUrl, (response) => new Promise((resolve, reject) => {
        const out = fs.createWriteStream(onnxTemp);
        response.on('data', (chunk) => out.write(chunk));
        response.on('end', () => out.close(() => resolve()));
        response.on('error', reject);
        out.on('error', reject);
      }));
      fs.renameSync(onnxTemp, onnxDest);
      log(`verificado ${voiceKey}.onnx`);
    }

    if (!FORCE && fs.existsSync(jsonDest)) {
      log(`${voiceKey}.onnx.json ya presente`);
    } else {
      log(`descargando ${voiceKey}.onnx.json`);
      await httpGet(jsonUrl, (response) => new Promise((resolve, reject) => {
        const out = fs.createWriteStream(jsonTemp);
        response.on('data', (chunk) => out.write(chunk));
        response.on('end', () => out.close(() => resolve()));
        response.on('error', reject);
        out.on('error', reject);
      }));
      fs.renameSync(jsonTemp, jsonDest);
      log(`verificado ${voiceKey}.onnx.json`);
    }
  }
}

function verify() {
  const checks = [
    path.join(PATHS.pythonDir, 'python.exe'),
    path.join(PATHS.pythonDir, 'Lib', 'site-packages', 'kokoro_onnx', '__init__.py'),
    path.join(PATHS.pythonDir, 'Lib', 'site-packages', 'onnxruntime', '__init__.py'),
    path.join(PATHS.runtimeDir, 'kokoro-runtime.exe'),
    path.join(PATHS.runtimeDir, 'runner.py'),
    path.join(PATHS.espeakDir, 'espeak-ng-data', 'es_dict'),
    path.join(PATHS.whisperBin, 'whisper-cli.exe'),
    path.join(PATHS.piperDir, 'piper.exe')
  ];
  if (!SKIP_MODELS) {
    checks.push(
      path.join(PATHS.kokoroModels, 'kokoro-v1.0.onnx'),
      path.join(PATHS.kokoroModels, 'voices-v1.0.bin'),
      path.join(PATHS.whisperModels, 'ggml-base.bin')
    );
  }
  const missing = checks.filter((file) => !fs.existsSync(file));
  if (missing.length) {
    fail(`faltan archivos tras la instalación:\n  ${missing.join('\n  ')}`);
  }
  log('verificación final correcta');
}

async function main() {
  requireWindowsX64();
  ensureDir(VENDOR);
  ensureDir(CACHE);

  if (!FORCE && stampOk()) {
    log('todo ya está instalado y coincide con la configuración (usar --force para rehacer)');
    return;
  }

  await installPython();
  installPythonPackages();
  prunePython();
  buildLauncher();
  await installEspeak();
  await installWhisper();
  await installPiper();
  if (!SKIP_MODELS) {
    await installKokoroModels();
  } else {
    log('--skip-models: se omiten los modelos grandes (kokoro/whisper/piper)');
  }
  verify();
  if (SKIP_MODELS) {
    log('--skip-models: no se escribe el sello (la instalación está incompleta)');
  } else {
    writeStamp();
  }
  log('listo: motores en vendor/kokoro, vendor/whisper y vendor/piper');
}

if (require.main === module) {
  main().catch((err) => fail(err && err.message ? err.message : String(err)));
}

module.exports = {
  CONFIG_VERSION,
  PYTHON_VERSION,
  PIP_PACKAGES,
  ARTIFACTS,
  PATHS,
  configHash
};
