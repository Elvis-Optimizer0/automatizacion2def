const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTestUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vm-e2e-userdata-'));
}

async function launchAppWithTempUserData(extraEnv = {}) {
  const userDataDir = makeTestUserData();
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_TEST: '1',
      VM_TEST_USERDATA: userDataDir,
      ...extraEnv
    }
  });
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__, { timeout: 15000 });
  return { electronApp, page, userDataDir };
}

async function closeApp(electronApp, userDataDir) {
  if (electronApp) await electronApp.close();
  if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
}

module.exports = { makeTestUserData, launchAppWithTempUserData, closeApp };