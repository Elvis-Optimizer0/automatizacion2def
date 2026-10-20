const fs = require('fs');
const path = require('path');

const testFiles = [
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
  
  // Replace waitForTestExports to also wait for __APP_MOUNTED__
  if (content.includes('waitForTestExports')) {
    content = content.replace(
      /async function waitForTestExports\(page\) \{\s*await page\.waitForFunction\(\(\) => window\.__TEST_STATE__ && window\.__TEST_RENDER__, \{ timeout: 15000 \}\);\s*\}/g,
      "async function waitForTestExports(page) {\n  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });\n}"
    );
    
    // Also handle multiline version
    content = content.replace(
      /async function waitForTestExports\(page\) \{\s*await page\.waitForFunction\(\(\) => window\.__TEST_STATE__ && window\.__TEST_RENDER__ && window\.__TEST_EXPORT__, \{ timeout: 15000 \}\);\s*\}/g,
      "async function waitForTestExports(page) {\n  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });\n}"
    );
    
    // Handle other variations
    content = content.replace(
      /async function waitForTestExports\(page\) \{\s*await page\.waitForFunction\(\(\) => window\.__TEST_STATE__ && window\.__TEST_RENDER__ && window\.__TEST_EXPORT__ && window\.__TEST_RENDER__, \{ timeout: 15000 \}\);\s*\}/g,
      "async function waitForTestExports(page) {\n  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });\n}"
    );
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${file}`);
  } else {
    console.log(`No waitForTestExports in ${file}`);
  }
}

console.log('Done');