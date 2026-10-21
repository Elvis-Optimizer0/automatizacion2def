const { listModels } = require('../app/core/models.js');
const { CATALOG: MODEL_CATALOG } = require('../app/core/model-specs.js');
const path = require('path');

const modelsDir = path.join(process.env.APPDATA, 'video-maker', 'models');
const vendorDir = path.join(__dirname, '..', 'vendor');

console.log('modelsDir:', modelsDir);
console.log('vendorDir:', vendorDir);
console.log('vendorDir exists:', require('fs').existsSync(vendorDir));

const models = listModels(modelsDir, MODEL_CATALOG, vendorDir);

models.forEach(model => {
  console.log(`\n${model.name} (${model.id}):`);
  console.log(`  installed: ${model.installed}`);
  console.log(`  verified: ${model.verified}`);
  model.files.forEach(file => {
    console.log(`  ${file.fileName}: exists=${file.exists} verified=${file.verified} size=${file.size} path=${file.path}`);
  });
});