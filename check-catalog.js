const { MODEL_SPECS } = require('./app/core/model-specs.js');
const piper = MODEL_SPECS.piper;
console.log('Piper voices count:', piper.files.length / 2);
piper.files.forEach(f => {
  if (f.fileName.endsWith('.onnx') && !f.fileName.endsWith('.json')) {
    const voiceId = f.fileName.replace('.onnx', '');
    const jsonFile = MODEL_SPECS.piper.files.find(x => x.fileName === voiceId + '.onnx.json');
    console.log('Voice:', voiceId, '| License:', jsonFile?.license || 'N/A', '| Commercial:', jsonFile?.license !== 'Blizzard (non-commercial)');
  }
});