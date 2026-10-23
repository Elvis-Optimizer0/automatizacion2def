const fs = require('fs');
const path = require('path');
const os = require('os');

const E2E_USERDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-e2e-global-userdata-'));
process.env.VM_TEST_USERDATA = E2E_USERDATA_DIR;

const PIPER_E2E_VOICE_DIR = path.join(__dirname, '..', '..', '.engine-cache', 'piper-e2e-voice');
process.env.VM_TEST_PIPER_VOICE_DIR = PIPER_E2E_VOICE_DIR;

console.log('[global-setup] VM_TEST_USERDATA set to:', E2E_USERDATA_DIR);
console.log('[global-setup] VM_TEST_PIPER_VOICE_DIR set to:', PIPER_E2E_VOICE_DIR);

module.exports = async () => {
  // Already set via process.env
};