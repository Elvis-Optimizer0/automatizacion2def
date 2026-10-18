const { test, expect } = require('@playwright/test');
const {
  detectVendor,
  parseGpuNames,
  detectGpu,
  resolveAcceleration,
  getCapabilities
} = require('../../app/core/capabilities.js');

test.describe('gpu vendor detection', () => {
  test('recognizes AMD, NVIDIA and Intel names', () => {
    expect(detectVendor(['AMD Radeon RX 6600'])).toBe('amd');
    expect(detectVendor(['NVIDIA GeForce RTX 4070'])).toBe('nvidia');
    expect(detectVendor(['Intel(R) Iris(R) Xe Graphics'])).toBe('intel');
    expect(detectVendor(['Microsoft Basic Display Adapter'])).toBe('unknown');
  });

  test('parses command output into names', () => {
    const names = parseGpuNames('Name\r\nAMD Radeon RX 6600\r\nIntel UHD Graphics\r\n');
    expect(names).toEqual(['AMD Radeon RX 6600', 'Intel UHD Graphics']);
  });

  test('detects an AMD GPU through the injected command runner', () => {
    const gpu = detectGpu({
      env: { PATH: 'x' },
      runCommand: () => 'AMD Radeon RX 6600'
    });
    expect(gpu.vendor).toBe('amd');
    expect(gpu.vulkan).toBe(true);
    expect(gpu.simulated).toBe(false);
  });

  test('does not throw when the command runner fails', () => {
    const gpu = detectGpu({
      env: { PATH: 'x' },
      runCommand: () => { throw new Error('no gpu query'); }
    });
    expect(gpu.vendor).toBe('unknown');
    expect(gpu.vulkan).toBe(false);
  });
});

test.describe('acceleration resolution', () => {
  test('enables vulkan and directml for an AMD GPU', () => {
    const accel = resolveAcceleration({ gpu: { vendor: 'amd', vulkan: true, directml: true } });
    expect(accel.alignBackend).toBe('vulkan');
    expect(accel.voiceBackend).toBe('directml');
    expect(accel.accelerated).toBe(true);
    expect(accel.fallback).toBe(false);
  });

  test('falls back to CPU with a visible reason when no GPU is present', () => {
    const accel = resolveAcceleration({ gpu: { vendor: 'unknown', vulkan: false, directml: false } });
    expect(accel.alignBackend).toBe('cpu');
    expect(accel.voiceBackend).toBe('cpu');
    expect(accel.fallback).toBe(true);
    expect(accel.reason).toMatch(/CPU/);
  });

  test('honors an explicit DirectML opt-out', () => {
    const accel = resolveAcceleration({ gpu: { vendor: 'amd', vulkan: true, directml: true }, directmlRequested: false });
    expect(accel.voiceBackend).toBe('cpu');
    expect(accel.alignBackend).toBe('vulkan');
  });
});

test.describe('capabilities snapshot', () => {
  test('simulates an AMD GPU in test mode', () => {
    const capabilities = getCapabilities({ env: { NODE_ENV: 'test' } });
    expect(capabilities.gpu.simulated).toBe(true);
    expect(capabilities.gpu.vendor).toBe('amd');
    expect(capabilities.acceleration.accelerated).toBe(true);
  });

  test('reports CPU fallback when the simulated GPU has no backends', () => {
    const capabilities = getCapabilities({ env: { NODE_ENV: 'test', VM_GPU_VENDOR: 'intel' } });
    expect(capabilities.gpu.vendor).toBe('intel');
    expect(capabilities.acceleration.fallback).toBe(true);
  });
});
