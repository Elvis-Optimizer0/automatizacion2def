const fs = require('fs');
const path = require('path');

const e2eDir = path.join(__dirname, '..', 'tests', 'e2e');
const files = fs.readdirSync(e2eDir).filter(f => f.endsWith('.spec.js'));

for (const file of files) {
  const filePath = path.join(e2eDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already uses helper
  if (content.includes("require('./test-helpers'")) continue;
  
  // Replace imports
  content = content.replace(
    /const \{ test, expect \} = require\('@playwright\/test'\);\nconst \{ _electron: electron \} = require\('playwright'\);/,
    "const { test, expect } = require('@playwright/test');\nconst { launchAppWithTempUserData, closeApp } = require('./test-helpers.cjs');"
  );
  
  // Replace beforeAll
  content = content.replace(
    /test\.beforeAll\(async \(\) => \{\s*electronApp = await electron\.launch\(\{[\s\S]*?\}\);\s*page = await electronApp\.firstWindow\(\);\s*await page\.waitForLoadState\('domcontentloaded'\);\s*await page\.waitForFunction\(\(\) => window\.__TEST_STATE__ && window\.__TEST_RENDER__, \{ timeout: 15000 \}\);\s*\}\);/,
    `test.beforeAll(async () => {
    const { electronApp: app, page: pg, userDataDir } = await launchAppWithTempUserData();
    electronApp = app;
    page = pg;
    testUserDataDir = userDataDir;
  });`
  );
  
  // Replace afterAll
  content = content.replace(
    /test\.afterAll\(async \(\) => \{\s*if \(electronApp\) \{\s*await electronApp\.close\(\);\s*\}\s*\}\);/,
    `test.afterAll(async () => {
    await closeApp(electronApp, testUserDataDir);
  });`
  );
  
  // Add testUserDataDir variable declaration
  if (!content.includes('let testUserDataDir;')) {
    content = content.replace(
      /let electronApp;\nlet page;/,
      'let electronApp;\nlet page;\nlet testUserDataDir;'
    );
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
}

console.log('Done!');