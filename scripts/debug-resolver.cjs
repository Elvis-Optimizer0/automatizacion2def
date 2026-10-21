const { resolveModelFilePath, getModelsDir } = require('../app/core/models.js');
const { CATALOG: MODEL_CATALOG } = require('../app/core/model-specs.js');
const path = require('path');

const modelsDir = path.join(process.env.APPDATA, 'video-maker', 'models');
const vendorDir = path.join(__dirname, '..', 'vendor');

MODEL_CATALOG.forEach(model => {
  model.files.forEach(file => {
    const resolved = resolveModelFilePath(modelsDir, model, file, vendorDir);
    console.log(`${model.id}/${file.fileName}: ${resolved}`);
  });
});