const { importModel, listModels, getModelsDir } = require('../app/core/models.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-debug-'));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-debug-userdata-'));

const voicesPath = path.join(testDir, 'voices-v1.0.bin');
fs.writeFileSync(voicesPath, Buffer.alloc(64, 0x42));

console.log('Test file:', voicesPath, 'size:', fs.statSync(voicesPath).size);

const modelsDir = getModelsDir(userDataDir);
console.log('Models dir:', modelsDir);

try {
  const result = importModel(voicesPath, modelsDir);
  console.log('Import result:');
  console.log('  imported:', result.imported);
  console.log('  verification:', result.verification);
  console.log('  models count:', result.models.length);
  
  const kokoro = result.models.find(m => m.id === 'kokoro');
  console.log('  kokoro model:');
  console.log('    installed:', kokoro.installed);
  console.log('    verified:', kokoro.verified);
  console.log('    missingFiles:', kokoro.missingFiles);
  console.log('    message:', kokoro.message);
  kokoro.files.forEach(f => {
    console.log('    file:', f.fileName, 'exists:', f.exists, 'verified:', f.verified, 'userDataExists:', f.userDataExists, 'message:', f.message);
  });
  
  // Also test listModels directly
  const models = listModels(modelsDir);
  const kokoro2 = models.find(m => m.id === 'kokoro');
  console.log('Direct listModels:');
  console.log('  installed:', kokoro2.installed);
  console.log('  verified:', kokoro2.verified);
  console.log('  missingFiles:', kokoro2.missingFiles);
  kokoro2.files.forEach(f => {
    console.log('  file:', f.fileName, 'exists:', f.exists, 'verified:', f.verified, 'userDataExists:', f.userDataExists, 'path:', f.path);
  });
  
} catch (err) {
  console.error('Error:', err.message);
  console.error(err.stack);
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
}