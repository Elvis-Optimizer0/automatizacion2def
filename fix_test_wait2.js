const fs = require('fs');
const path = require('path');

const testFiles = [
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
  
  // Replace direct waitForFunction calls to also wait for __APP_MOUNTED__
  content = content.replace(
    /await page\.waitForFunction\(\(\) => window\.__TEST_STATE__ && window\.__TEST_RENDER__, \{ timeout: 15000 \}\);/g,
    "await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });"
  );
  
  content = content.replace(
    /await page\.waitForFunction\(\(\) => window\.__TEST_STATE__ && window\.__TEST_RENDER__ && window\.__TEST_EXPORT__, \{ timeout: 15000 \}\);/g,
    "await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });"
  );
  
  content = content.replace(
    /await page\.waitForFunction\(\(\) => window\.__TEST_STATE__ && window\.__TEST_RENDER__ && window\.__TEST_EXPORT__ && window\.__TEST_RENDER__, \{ timeout: 15000 \}\);/g,
    "await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });"
  );
  
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Updated ${file}`);
}

console.log('Done');