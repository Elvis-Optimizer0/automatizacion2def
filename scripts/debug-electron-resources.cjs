const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__, { timeout: 15000 });
  
  // Check process.resourcesPath in Electron
  const resourcesPath = await window.evaluate(() => process.resourcesPath);
  console.log('process.resourcesPath in Electron:', resourcesPath);
  
  // Check what getVendorModelsDir returns
  const vendorDir = await window.evaluate(() => {
    const path = require('path');
    return path.join(process.resourcesPath, 'vendor');
  });
  console.log('vendorDir in Electron:', vendorDir);
  
  // Check if vendor files exist
  const fs = require('fs');
  const whisperPath = path.join(vendorDir, 'whisper', 'models', 'ggml-base.bin');
  console.log('whisper vendor path:', whisperPath);
  console.log('whisper vendor exists:', fs.existsSync(whisperPath));
  
  await app.close();
})();