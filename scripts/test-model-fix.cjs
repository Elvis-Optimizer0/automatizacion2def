const { listModels } = require('../app/core/models.js');
const path = require('path');

const userData = path.join(process.env.APPDATA, 'video-maker', 'models');
const vendorDir = path.join(__dirname, '..', 'vendor');

console.log('--- Testing listModels with vendor fallback ---');
console.log('userData:', userData);
console.log('vendorDir:', vendorDir);
const models = listModels(userData, require('../app/core/model-specs.js').CATALOG, vendorDir);

models.forEach(model => {
  console.log(`\nModel: ${model.id} (${model.name})`);
  console.log(`  installed: ${model.installed}, verified: ${model.verified}, message: ${model.message}`);
  model.files.forEach(file => {
    console.log(`  File: ${file.fileName}`);
    console.log(`    path: ${file.path}`);
    console.log(`    exists: ${file.exists}, verified: ${file.verified}, size: ${file.size}, expected: ${file.expectedSize}`);
    console.log(`    status: ${file.status}, message: ${file.message}`);
  });
});