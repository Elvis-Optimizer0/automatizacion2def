const { _electron: electron } = require('playwright');

async function debug() {
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1' }
  });

  const page = await electronApp.firstWindow();

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    consoleLogs.push({ type: 'error', text: err.message });
    console.log(`[PAGEERROR] ${err.message}`);
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  console.log('\n=== Checking window state ===');
  
  const state = await page.evaluate(() => ({
    TEST_STATE: !!window.__TEST_STATE__,
    TEST_RENDER: !!window.__TEST_RENDER__,
    TEST_EXPORT: !!window.__TEST_EXPORT__,
    TEST_CONTROLS: !!window.__TEST_CONTROLS__,
    APP_STORE: !!window.__APP_STORE__,
    APP_MOUNTED: !!window.__APP_MOUNTED__,
    VM_TEST: window.VM_TEST,
    location: window.location.href,
  }));
  console.log('Window state:', JSON.stringify(state, null, 2));

  console.log('\n=== Console logs ===');
  consoleLogs.forEach(log => console.log(`[${log.type}] ${log.text}`));

  console.log('\n=== Document structure ===');
  const dom = await page.evaluate(() => ({
    root: document.getElementById('root')?.innerHTML?.slice(0, 500),
    imagesList: document.getElementById('images-list')?.innerHTML?.slice(0, 500),
    imagesListExists: !!document.getElementById('images-list'),
    imagesListCount: document.querySelectorAll('#images-list .image-item').length,
    importImagesBtn: !!document.getElementById('import-images-btn'),
    imagesDropZone: !!document.getElementById('images-drop-zone'),
  }));
  console.log('DOM state:', JSON.stringify(dom, null, 2));

  const hasRenderImages = await page.evaluate(() => !!window.__TEST_RENDER__?.renderImages);
  if (hasRenderImages) {
    console.log('\n=== Calling renderImages with 4 images ===');
    const testImages = [
      { name: 'escena1.png', path: 'C:\\test\\escena1.png', size: 100, type: 'image', preview: 'file://C:/test/escena1.png' },
      { name: 'escena2.png', path: 'C:\\test\\escena2.png', size: 100, type: 'image', preview: 'file://C:/test/escena2.png' },
      { name: 'escena3.png', path: 'C:\\test\\escena3.png', size: 100, type: 'image', preview: 'file://C:/test/escena3.png' },
      { name: 'escena4.png', path: 'C:\\test\\escena4.png', size: 100, type: 'image', preview: 'file://C:/test/escena4.png' },
    ];
    
    await page.evaluate((imgs) => {
      window.__TEST_STATE__.images = imgs.map(f => ({ ...f, size: 0, type: 'image', preview: `file://${f.path}` }));
      if (window.__TEST_RENDER__?.renderImages) {
        window.__TEST_RENDER__.renderImages();
      }
    }, [
      { name: 'escena1.png', path: 'C:/test/escena1.png', size: 100 },
      { name: 'escena2.png', path: 'C:/test/escena2.png', size: 100 },
      { name: 'escena3.png', path: 'C:/test/escena3.png', size: 100 },
      { name: 'escena4.png', path: 'C:/test/escena4.png', size: 100 },
    ]);

    await new Promise(r => setTimeout(r, 500));

    const after = await page.evaluate(() => ({
      imagesListCount: document.querySelectorAll('#images-list .image-item').length,
      imagesListHTML: document.getElementById('images-list')?.innerHTML?.slice(0, 500),
    }));
    console.log('After renderImages:', JSON.stringify(after, null, 2));
  }

  const hasRenderAudio = await page.evaluate(() => !!window.__TEST_RENDER__?.renderAudio);
  if (hasRenderAudio) {
    console.log('\n=== Calling renderAudio with narration ===');
    await page.evaluate(() => {
      window.__TEST_STATE__.audio = { 
        narration: { name: 'narration.wav', path: 'C:/test/narration.wav', size: 100, type: 'audio', preview: 'file://C:/test/narration.wav' },
        music: null
      };
      window.__TEST_STATE__.audioDuration = 10;
      if (window.__TEST_RENDER__?.renderAudio) {
        window.__TEST_RENDER__.renderAudio();
      }
    });
    await new Promise(r => setTimeout(r, 500));
    const afterAudio = await page.evaluate(() => ({
      narrationInfo: document.getElementById('audio-narration-info')?.textContent,
    }));
    console.log('After renderAudio:', JSON.stringify(afterAudio, null, 2));
  }

  const hasRenderScript = await page.evaluate(() => !!window.__TEST_RENDER__?.renderScript);
  if (hasRenderScript) {
    console.log('\n=== Calling renderScript with 4 scenes (after images + audio) ===');
    const script = `[Escena 1] 0:00 - 2:50 Primera
[Escena 2] 2:50 - 5:00 Segunda
[Escena 3] 5:00 - 7:30 Tercera
[Escena 4] 7:30 - 10:00 Cuarta`;
    
    await page.evaluate((s) => {
      window.__TEST_STATE__.script = { 
        raw: s, 
        scenes: [
          {number:1, start:0, end:170, text:'Primera'},
          {number:2, start:170, end:300, text:'Segunda'},
          {number:3, start:300, end:450, text:'Tercera'},
          {number:4, start:450, end:600, text:'Cuarta'}
        ], 
        warnings: [] 
      };
      if (window.__TEST_RENDER__?.renderScript) {
        window.__TEST_RENDER__.renderScript();
      }
    }, script);

    await new Promise(r => setTimeout(r, 1000));

    const afterScript = await page.evaluate(() => ({
      scriptSummary: document.getElementById('script-summary')?.textContent,
      scriptTextarea: document.getElementById('script-textarea')?.value,
      scriptState: window.__TEST_STATE__?.script,
    }));
    console.log('After renderScript:', JSON.stringify(afterScript, null, 2));
  }

  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
  console.log('\nScreenshot saved to debug-screenshot.png');

  await electronApp.close();
}

debug().catch(e => {
  console.error('Debug failed:', e);
  process.exit(1);
});