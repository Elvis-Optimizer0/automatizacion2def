const fs = require('fs');
const path = require('path');

const testFiles = [
  'launch.spec.js',
  'phase2.spec.js',
  'phase3.spec.js',
  'phase4.spec.js',
  'phase5-controls.spec.js',
  'phase5-extras.spec.js',
  'phase5-framing.spec.js',
  'phase5-project.spec.js',
  'phase5-scene-settings.spec.js',
  'phase5-transitions.spec.js',
  'phase5-verification.spec.js',
  'phase5-zoom.spec.js',
  'phase6-preview.spec.js',
  'phase6-subtitles.spec.js',
  'phase7-import-button.spec.js',
  'phase7-keywords.spec.js',
  'phase7-models.spec.js',
  'phase7-pipeline.spec.js',
  'phase7-timing.spec.js',
];

const testDir = path.join(__dirname, 'tests', 'e2e');

for (const file of testFiles) {
  const filePath = path.join(testDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file} - not found`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Replace the electron.launch env to include VM_USE_DIST
  const oldPattern = /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1'\s*\}/g;
  const newEnv = "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1' }";
  
  if (content.match(oldPattern)) {
    content = content.replace(oldPattern, newEnv);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${file}`);
  } else {
    console.log(`No match found in ${file}`);
  }
}

console.log('Done');