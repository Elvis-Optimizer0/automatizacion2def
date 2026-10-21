const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({ args: ['.'] });
  
  // Check process.resourcesPath in main process
  const resourcesPath = await app.evaluate(() => process.resourcesPath);
  console.log('process.resourcesPath in main:', resourcesPath);
  
  // Check getVendorModelsDir
  const vendorDir = await app.evaluate(() => {
    const path = require('path');
    return path.join(process.resourcesPath, 'vendor');
  });
  console.log('vendorDir in main:', vendorDir);
  
  // Check if vendor files exist
  const fs = require('fs');
  const whisperPath = require('path').join(vendorDir, 'whisper', 'models', 'ggml-base.bin');
  console.log('whisper vendor path:', whisperPath);
  console.log('whisper vendor exists:', fs.existsSync(whisperPath));
  
  await app.close();
})();