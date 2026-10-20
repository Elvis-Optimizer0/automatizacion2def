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
  
  // Replace env objects to add VM_TEST: '1'
  // Pattern: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', ... }
  // We need to add VM_TEST: '1' to the env object
  
  // Pattern 1: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1' }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_USE_DIST:\s*'1'\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST: '1' }"
  );
  
  // Pattern 2: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST_OUTPUT: outputPath }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_USE_DIST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath }"
  );
  
  // Pattern 3: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST_USERDATA: userDataDir }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_USE_DIST:\s*'1',\s*VM_TEST_USERDATA:\s*userDataDir\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST: '1', VM_TEST_USERDATA: userDataDir }"
  );
  
  // Pattern 4: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath }"
  );
  
  // Pattern 5: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_USERDATA: userDataDir }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_USERDATA:\s*userDataDir\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_USERDATA: userDataDir }"
  );
  
  // Pattern 6: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_USERDATA: userDataDir }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath,\s*VM_TEST_USERDATA:\s*userDataDir\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_USERDATA: userDataDir }"
  );
  
  // Pattern 7: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1' } (just these two)
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1'\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1' }"
  );
  
  // Pattern 8: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: missingProjectPath }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_PROJECT_OUT:\s*savedProjectPath,\s*VM_TEST_PROJECT_IN:\s*missingProjectPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: missingProjectPath }"
  );
  
  // Pattern 9: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: savedProjectPath }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath,\s*VM_TEST_PROJECT_OUT:\s*savedProjectPath,\s*VM_TEST_PROJECT_IN:\s*savedProjectPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: savedProjectPath }"
  );
  
  // Pattern 10: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: savedProjectPath } (multiline)
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath,\s*VM_TEST_PROJECT_OUT:\s*savedProjectPath,\s*VM_TEST_PROJECT_IN:\s*savedProjectPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: savedProjectPath }"
  );
  
  // Pattern 10b: multiline with different order
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath,\s*VM_TEST_PROJECT_OUT:\s*savedProjectPath,\s*VM_TEST_PROJECT_IN:\s*savedProjectPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: savedProjectPath }"
  );

  // Pattern 11: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_USERDATA: userDataDir, VM_TEST_OUTPUT: outputPath }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_USERDATA:\s*userDataDir,\s*VM_TEST_OUTPUT:\s*outputPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_USERDATA: userDataDir, VM_TEST_OUTPUT: outputPath }"
  );

  // Pattern 11b: multiline
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_USERDATA:\s*userDataDir,\s*VM_TEST_OUTPUT:\s*outputPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_USERDATA: userDataDir, VM_TEST_OUTPUT: outputPath }"
  );

  // Pattern 12: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_USERDATA: userDataDir, VM_TEST_OUTPUT: outputPath } (multiline)
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_USERDATA:\s*userDataDir,\s*VM_TEST_OUTPUT:\s*outputPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_USERDATA: userDataDir, VM_TEST_OUTPUT: outputPath }"
  );

  // Pattern 13: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_USERDATA: userDataDir, VM_TEST_OUTPUT: outputPath } (multiline different spacing)
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_USERDATA:\s*userDataDir,\s*VM_TEST_OUTPUT:\s*outputPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_USERDATA: userDataDir, VM_TEST_OUTPUT: outputPath }"
  );

  // Pattern 14: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: missingProjectPath }
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_PROJECT_OUT:\s*savedProjectPath,\s*VM_TEST_PROJECT_IN:\s*missingProjectPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: missingProjectPath }"
  );

  // Pattern 15: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: missingProjectPath } (multiline)
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath,\s*VM_TEST_PROJECT_OUT:\s*savedProjectPath,\s*VM_TEST_PROJECT_IN:\s*savedProjectPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: savedProjectPath }"
  );

  // Pattern 16: env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: missingProjectPath } (multiline)
  content = content.replace(
    /env: \{\s*\.\.\.process\.env,\s*NODE_ENV:\s*'test',\s*ELECTRON_TEST:\s*'1',\s*VM_TEST_OUTPUT:\s*outputPath,\s*VM_TEST_PROJECT_OUT:\s*savedProjectPath,\s*VM_TEST_PROJECT_IN:\s*savedProjectPath\s*\}/g,
    "env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath, VM_TEST_PROJECT_OUT: savedProjectPath, VM_TEST_PROJECT_IN: savedProjectPath }"
  );

  // Write if modified
  const originalContent = fs.readFileSync(path.join(__dirname, 'tests', 'e2e', file), 'utf-8');
  if (content !== originalContent) {
    fs.writeFileSync(path.join(__dirname, 'tests', 'e2e', file), content, 'utf-8');
    console.log(`Updated ${file}`);
  } else {
    console.log(`No changes needed for ${file}`);
  }
}

console.log('Done');