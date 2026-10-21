const fs = require('fs');
const path = require('path');
const { CATALOG: MODEL_CATALOG } = require('../app/core/model-specs.js');

function analyze(label, baseDir) {
  console.log(`\n--- Analyzing ${label}: ${baseDir} ---`);
  if (!fs.existsSync(baseDir)) {
    console.log('Directory does not exist');
    return;
  }

  MODEL_CATALOG.forEach(model => {
    const modelDir = path.join(baseDir, model.id);
    console.log(`Model [${model.id}] dir: ${modelDir} | Exists: ${fs.existsSync(modelDir)} | isDir: ${fs.existsSync(modelDir) ? fs.statSync(modelDir).isDirectory() : 'N/A'}`);
    
    model.files.forEach(file => {
      const filePath = path.join(modelDir, file.fileName);
      const exists = fs.existsSync(filePath);
      if (!exists) {
        console.log(`  File ${file.fileName}: NOT FOUND at ${filePath}`);
        return;
      }
      const stat = fs.statSync(filePath);
      const isDir = stat.isDirectory();
      console.log(`  File ${file.fileName}: Path=${filePath}, isFile=${stat.isFile()}, isDir=${isDir}, size=${stat.size}, expected=${file.sizeBytes}`);
      if (isDir) {
        const content = fs.readdirSync(filePath);
        console.log(`    -> Folder content: ${JSON.stringify(content)}`);
      }
    });
  });
}

const userData = path.join(process.env.APPDATA, 'video-maker', 'models');
const vendorKokoro = path.join(__dirname, '..', 'vendor', 'kokoro', 'models');
const vendorWhisper = path.join(__dirname, '..', 'vendor', 'whisper', 'models');

analyze('User Data', userData);
analyze('Vendor Kokoro', vendorKokoro);
analyze('Vendor Whisper', vendorWhisper);