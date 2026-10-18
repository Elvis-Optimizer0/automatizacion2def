const E_CAPABILITIES_FAILED = 'E_CAPABILITIES_FAILED';

const VENDORS = ['amd', 'nvidia', 'intel', 'unknown'];
const BACKENDS = ['vulkan', 'directml', 'cpu'];

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test' || env.ELECTRON_TEST === '1' || env.VM_TEST_GPU === '1';
}

function detectVendor(names) {
  const text = (Array.isArray(names) ? names.join(' ') : String(names || '')).toLowerCase();
  if (/radeon|\bamd\b|\bati\b/.test(text)) return 'amd';
  if (/nvidia|geforce|quadro|rtx|gtx/.test(text)) return 'nvidia';
  if (/intel|iris|uhd graphics|arc/.test(text)) return 'intel';
  return 'unknown';
}

function parseGpuNames(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^name$/i.test(line));
}

function defaultRunCommand(args) {
  const { execFileSync } = require('child_process');
  return execFileSync(args[0], args.slice(1), { windowsHide: true, timeout: 5000, encoding: 'utf8' });
}

function detectGpu(options = {}) {
  const env = options.env || process.env;
  if (isTestMode(env)) {
    const vendor = VENDORS.includes(env.VM_GPU_VENDOR) ? env.VM_GPU_VENDOR : 'amd';
    return {
      vendor,
      names: [`Simulated ${vendor.toUpperCase()} GPU`],
      vulkan: env.VM_VULKAN === '0' ? false : vendor === 'amd',
      directml: env.VM_DIRECTML === '0' ? false : vendor === 'amd',
      simulated: true
    };
  }

  const run = options.runCommand || defaultRunCommand;
  let names = [];
  if (process.platform === 'win32') {
    try {
      const output = run(['powershell', '-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name']);
      names = parseGpuNames(output);
    } catch (_err) {
      names = [];
    }
  }

  const vendor = detectVendor(names);
  return {
    vendor,
    names,
    vulkan: vendor === 'amd' || vendor === 'nvidia',
    directml: vendor === 'amd' || vendor === 'nvidia',
    simulated: false
  };
}

function resolveAcceleration(capabilities) {
  const gpu = capabilities && capabilities.gpu ? capabilities.gpu : { vendor: 'unknown', vulkan: false, directml: false };
  const directml = gpu.directml === true && capabilities.directmlRequested !== false;
  const vulkan = gpu.vulkan === true;
  const alignBackend = vulkan ? 'vulkan' : 'cpu';
  const voiceBackend = directml ? 'directml' : 'cpu';
  const accelerated = alignBackend !== 'cpu' || voiceBackend !== 'cpu';
  return {
    alignBackend,
    voiceBackend,
    accelerated,
    fallback: !accelerated,
    reason: accelerated
      ? 'Se detectó una GPU compatible (AMD) para acelerar voz y alineación.'
      : 'No se detectó GPU compatible; se usará CPU (más lento).'
  };
}

function getCapabilities(options = {}) {
  const env = options.env || process.env;
  const gpu = options.gpu || detectGpu({ env, runCommand: options.runCommand });
  const base = {
    platform: process.platform,
    gpu,
    vramNote: gpu.vendor === 'amd' ? 'AMD: Vulkan para whisper.cpp, DirectML opcional para la voz.' : ''
  };
  const acceleration = resolveAcceleration({ ...base, directmlRequested: base.directmlRequested });
  return { ...base, acceleration };
}

module.exports = {
  E_CAPABILITIES_FAILED,
  VENDORS,
  BACKENDS,
  isTestMode,
  detectVendor,
  parseGpuNames,
  detectGpu,
  resolveAcceleration,
  getCapabilities
};
