const { _electron: electron } = require('playwright');

(async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__, { timeout: 15000 });
  
  // Get models list via IPC
  const modelsInfo = await window.evaluate(() => window.api.listModels());
  
  console.log('=== Models List ===');
  console.log('Dir:', modelsInfo.dir);
  modelsInfo.models.forEach(model => {
    console.log(`\n${model.name} (${model.id}):`);
    console.log(`  installed: ${model.installed}`);
    console.log(`  verified: ${model.verified}`);
    console.log(`  message: ${model.message}`);
    model.files.forEach(file => {
      console.log(`  ${file.fileName}: exists=${file.exists} verified=${file.verified} size=${file.size} path=${file.path}`);
    });
  });
  
  await app.close();
})();