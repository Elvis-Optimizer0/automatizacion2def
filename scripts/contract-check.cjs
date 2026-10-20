const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

// IDs from original index.html (commit cc2a800) - extracted manually
const ORIGINAL_IDS = [
  // Project bar
  'save-project-btn', 'open-project-btn', 'project-status',
  // Import images
  'import-images-btn', 'images-drop-zone', 'images-list',
  // Audio
  'import-audio-btn', 'voice-panel-toggle-btn', 'audio-narration', 'audio-narration-drop', 'audio-narration-info',
  'import-music-btn', 'audio-music', 'audio-music-drop', 'audio-music-info',
  // Voice panel
  'voice-language', 'voice-select', 'voice-speed', 'voice-pause',
  'voice-sample-btn', 'voice-text', 'voice-clean-btn', 'voice-generate-btn', 'voice-cancel-btn',
  'sync-scenes-btn', 'voice-progress', 'voice-progress-fill', 'voice-progress-text', 'voice-status',
  // Models panel
  'models-list', 'models-download-btn', 'models-import-btn', 'models-cancel-btn',
  'models-progress', 'models-progress-fill', 'models-progress-text', 'models-status',
  // Script
  'paste-script-btn', 'load-script-btn', 'script-textarea', 'script-warnings', 'script-summary',
  // Timeline
  'adjust-timeline-checkbox', 'apply-scene-settings-btn', 'timeline-table-container',
  'timeline-table', 'timeline-tbody', 'timeline-empty', 'timeline-summary',
  // Focus
  'focus-image-select', 'focus-format-select', 'focus-scale', 'focus-scale-readout',
  'focus-editor', 'focus-bg', 'focus-image', 'focus-box', 'focus-empty',
  'focus-apply-all-btn', 'focus-auto-btn', 'focus-reset-btn', 'focus-readout',
  // Export - Format chips
  'output-chip-16x9', 'output-chip-9x16', 'output-chip-1x1', 'output-chip-4x5',
  // Export - Fit mode
  'fit-mode', 'frame-color',
  // Export - Zoom
  'zoom-enabled-checkbox', 'zoom-type', 'zoom-mode', 'zoom-seed', 'zoom-start-scale', 'zoom-intensity',
  // Export - Transition
  'transition-type', 'transition-mode', 'transition-seed', 'transition-duration',
  // Export - Extras
  'badge-enabled', 'badge-text', 'badge-position', 'badge-animation',
  'lower-third-enabled', 'lower-third-text', 'lower-third-opacity',
  'progress-bar-enabled', 'progress-bar-color', 'progress-bar-height',
  // Export - Subtitles
  'subtitles-enabled', 'subtitle-font', 'import-font-btn',
  'subtitle-size-h', 'subtitle-size-v', 'subtitle-bold', 'subtitle-italic',
  'subtitle-letter-spacing', 'subtitle-text-color', 'subtitle-outline-width', 'subtitle-outline-color',
  'subtitle-alignment', 'subtitle-margin-h', 'subtitle-margin-v', 'subtitle-delay',
  'subtitles-voice-detect', 'subtitles-word-highlight',
  'subtitles-background-enabled', 'subtitles-background-color', 'subtitles-background-opacity',
  'subtitles-shadow-enabled', 'subtitles-shadow-color', 'subtitles-shadow-opacity',
  'subtitles-shadow-distance', 'subtitles-shadow-angle', 'subtitles-shadow-blur',
  'subtitle-animation', 'subtitles-highlight-enabled',
  'subtitle-terms-input', 'subtitle-terms-limit',
  'subtitles-detect-numbers', 'subtitles-detect-percent', 'subtitles-detect-currency',
  'detect-keywords-btn', 'subtitles-select-suggested-btn',
  'keywords-color', 'keywords-apply-color-btn',
  'subtitle-term-search', 'subtitle-term-add-btn',
  'keywords-list', 'subtitle-preview', 'subtitle-preview-text',
  'preview-scene-select', 'preview-btn', 'preview-video',
  // Export - Performance
  'hwaccel-checkbox', 'hwaccel-info', 'directml-checkbox', 'gpu-probe-btn', 'gpu-info',
  // Export buttons
  'export-btn', 'generate-full-btn', 'open-output-folder-btn',
  'export-progress', 'progress-fill', 'progress-text', 'progress-time', 'export-status',
  'pipeline-status',
  // Toast
  'toast-container',
  // Background mode
  'background-mode', 'background-color',
  // Voice
  'audio-row', 'audio-field', 'audio-label', 'audio-input-wrapper', 'audio-input', 'audio-drop-zone', 'audio-info',
];

// Test properties from __TEST_CONTROLS__, __TEST_EXPORT__, __TEST_STATE__
const TEST_STATE_PROPS = [
  'images', 'audio', 'script', 'timeline', 'timelineOptions', 'audioDuration',
  'config', 'exportOptions', 'project', 'focus', 'export', 'hwAccel', 'capabilities', 'pipeline'
];

const TEST_EXPORT_PROPS = [
  'handleExport', 'handleOpenOutputFolder', 'toggleOutputFormat', 'buildExportImages',
  'frameGeometry', 'buildProjectData', 'loadProject', 'handleSaveProject', 'handleOpenProject', 'handlePreview'
];

const TEST_CONTROLS_PROPS = [
  'id', 'tipo', 'hasHandler'
];

const TEST_RENDER_PROPS = [
  'renderImages', 'renderAudio', 'renderScript', 'renderTimeline', 'renderAll', 'updateExportButton',
  'setExportStatus', 'renderFocusEditor', 'updateFocusBoxPreview', 'renderOutputChips', 'setFocusScale',
  'applyAutoScale', 'resetFocus', 'updateSubtitlePreview', 'syncSubtitleControls', 'refreshFontList',
  'refreshKeywordList', 'refreshPresets', 'applyPresetByName', 'snapshotSubtitleStyle', 'refreshPreviewScenes',
  'selectSuggestedKeywords', 'addSearchTerm', 'refreshVoiceLanguages', 'refreshVoiceSelect',
  'syncVoiceControls', 'handleGenerateVoice', 'handleVoiceClean', 'cleanScriptForVoice',
  'refreshModelsList', 'handleDownloadModels', 'handleImportModel', 'handleSyncScenes',
  'handleGenerateFullVideo', 'handleProbeGpu', 'renderCapabilities'
];

async function runContractCheck() {
  console.log('=== CONTRACT CHECK START ===\n');
  
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'test', VM_TEST: '1', VM_USE_DIST: '1' }
  });
  
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  
  // Check DOM IDs
  console.log('--- DOM ID CHECK ---');
  const domResults = await page.evaluate((ids) => {
    const results = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      results[id] = el ? 'PRESENTE' : 'AUSENTE';
    }
    return results;
  }, ORIGINAL_IDS);
  
  let presentCount = 0;
  let absentCount = 0;
  for (const [id, status] of Object.entries(domResults)) {
    if (status === 'PRESENTE') presentCount++;
    else absentCount++;
    console.log(`  ${id}: ${status}`);
  }
  console.log(`\nTotal: ${presentCount} present, ${absentCount} absent\n`);
  
  // Check __TEST_STATE__ properties
  console.log('--- __TEST_STATE__ PROPERTIES ---');
  const stateResults = await page.evaluate((props) => {
    const state = window.__TEST_STATE__ || {};
    const results = {};
    for (const prop of props) {
      results[prop] = prop in state ? 'DEFINIDO' : 'UNDEFINED';
    }
    return results;
  }, TEST_STATE_PROPS);
  
  for (const [prop, status] of Object.entries(stateResults)) {
    console.log(`  __TEST_STATE__.${prop}: ${status}`);
  }
  console.log('');
  
  // Check __TEST_EXPORT__ properties
  console.log('--- __TEST_EXPORT__ PROPERTIES ---');
  const exportResults = await page.evaluate((props) => {
    const exp = window.__TEST_EXPORT__ || {};
    const results = {};
    for (const prop of props) {
      results[prop] = prop in exp ? 'DEFINIDO' : 'UNDEFINED';
    }
    return results;
  }, TEST_EXPORT_PROPS);
  
  for (const [prop, status] of Object.entries(exportResults)) {
    console.log(`  __TEST_EXPORT__.${prop}: ${status}`);
  }
  console.log('');
  
  // Check __TEST_CONTROLS__
  console.log('--- __TEST_CONTROLS__ ---');
  const controlsResults = await page.evaluate(() => {
    const controls = window.__TEST_CONTROLS__ || [];
    return controls.map(c => ({ id: c.id, tipo: c.tipo, hasHandler: c.hasHandler }));
  });
  
  console.log(`  Total controls registered: ${controlsResults.length}`);
  for (const c of controlsResults) {
    console.log(`  ${c.id}: tipo=${c.tipo}, hasHandler=${c.hasHandler}`);
  }
  console.log('');
  
  // Check __TEST_RENDER__ properties
  console.log('--- __TEST_RENDER__ PROPERTIES ---');
  const renderResults = await page.evaluate((props) => {
    const render = window.__TEST_RENDER__ || {};
    const results = {};
    for (const prop of props) {
      results[prop] = prop in render ? 'DEFINIDO' : 'UNDEFINED';
    }
    return results;
  }, TEST_RENDER_PROPS);
  
  for (const [prop, status] of Object.entries(renderResults)) {
    console.log(`  __TEST_RENDER__.${prop}: ${status}`);
  }
  console.log('');
  
  // Check for specific test selectors used in E2E tests
  console.log('--- E2E TEST SELECTORS CHECK ---');
  const e2eSelectors = [
    '#output-chip-16x9', '#output-chip-9x16', '#output-chip-1x1', '#output-chip-4x5',
    '#models-import-btn', '#import-audio-btn', '#import-music-btn',
    '#adjust-timeline-checkbox', '#apply-scene-settings-btn',
    '#badge-enabled', '#badge-text', '#badge-position', '#badge-animation',
    '#lower-third-enabled', '#lower-third-text', '#lower-third-opacity',
    '#progress-bar-enabled', '#progress-bar-color', '#progress-bar-height',
    '#zoom-enabled-checkbox', '#zoom-type', '#zoom-mode', '#zoom-seed', '#zoom-start-scale', '#zoom-intensity',
    '#transition-type', '#transition-mode', '#transition-seed', '#transition-duration',
    '#subtitles-enabled', '#subtitle-font', '#subtitle-size-h', '#subtitle-size-v',
    '#subtitle-bold', '#subtitle-italic', '#subtitle-letter-spacing', '#subtitle-text-color',
    '#subtitle-outline-width', '#subtitle-outline-color', '#subtitle-alignment',
    '#subtitle-margin-h', '#subtitle-margin-v', '#subtitle-delay',
    '#subtitles-voice-detect', '#subtitles-word-highlight',
    '#subtitles-background-enabled', '#subtitles-background-color', '#subtitles-background-opacity',
    '#subtitles-shadow-enabled', '#subtitles-shadow-color', '#subtitles-shadow-opacity',
    '#subtitles-shadow-distance', '#subtitles-shadow-angle', '#subtitles-shadow-blur',
    '#subtitle-animation', '#subtitles-highlight-enabled',
    '#subtitle-terms-input', '#subtitle-terms-limit',
    '#subtitles-detect-numbers', '#subtitles-detect-percent', '#subtitles-detect-currency',
    '#detect-keywords-btn', '#subtitles-select-suggested-btn',
    '#keywords-color', '#keywords-apply-color-btn',
    '#subtitle-term-search', '#subtitle-term-add-btn',
    '#keywords-list', '#subtitle-preview', '#subtitle-preview-text',
    '#preview-scene-select', '#preview-btn', '#preview-video',
    '#hwaccel-checkbox', '#directml-checkbox', '#gpu-probe-btn',
    '#export-btn', '#generate-full-btn', '#open-output-folder-btn',
    '#export-progress', '#progress-fill', '#progress-text', '#progress-time', '#export-status',
    '#pipeline-status', '#voice-panel-toggle-btn', '#voice-language', '#voice-select',
    '#voice-speed', '#voice-pause', '#voice-sample-btn', '#voice-text', '#voice-clean-btn',
    '#voice-generate-btn', '#voice-cancel-btn', '#sync-scenes-btn',
    '#models-download-btn', '#models-import-btn', '#models-cancel-btn',
    '#models-progress', '#models-progress-fill', '#models-progress-text', '#models-status',
    '#models-list', '#voice-progress', '#voice-progress-fill', '#voice-progress-text', '#voice-status',
    '#focus-image-select', '#focus-format-select', '#focus-scale', '#focus-scale-readout',
    '#focus-editor', '#focus-bg', '#focus-image', '#focus-box', '#focus-empty',
    '#focus-apply-all-btn', '#focus-auto-btn', '#focus-reset-btn', '#focus-readout',
    '#fit-mode', '#frame-color', '#background-mode', '#background-color',
    '#audio-narration', '#audio-music', '#audio-narration-drop', '#audio-music-drop',
    '#audio-narration-info', '#audio-music-info',
    '#import-images-btn', '#images-drop-zone', '#images-list',
    '#save-project-btn', '#open-project-btn', '#project-status',
    '#paste-script-btn', '#load-script-btn', '#script-textarea', '#script-warnings', '#script-summary',
    '#timeline-table-container', '#timeline-table', '#timeline-tbody', '#timeline-empty', '#timeline-summary',
    '#subtitle-font-family', '#subtitle-color', '#subtitle-outline', '#subtitle-shadow', '#subtitle-align',
    '#subtitle-position-y', '#subtitle-font', '#subtitle-size-h', '#subtitle-size-v',
    '#badge-text', '#badge-position', '#badge-animation',
    '#lower-third-text', '#lower-third-opacity',
    '#progress-bar-color', '#progress-bar-height',
  ];
  
  const selectorResults = await page.evaluate((selectors) => {
    const results = {};
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      results[sel] = el ? 'PRESENTE' : 'AUSENTE';
    }
    return results;
  }, e2eSelectors);
  
  let selectorPresent = 0;
  let selectorAbsent = 0;
  for (const [sel, status] of Object.entries(selectorResults)) {
    if (status === 'PRESENTE') selectorPresent++;
    else selectorAbsent++;
    console.log(`  ${sel}: ${status}`);
  }
  console.log(`\nTotal selectors: ${selectorPresent} present, ${selectorAbsent} absent\n`);
  
  await electronApp.close();
  
  console.log('=== CONTRACT CHECK COMPLETE ===');
  console.log(`DOM IDs: ${presentCount} present, ${absentCount} absent`);
  console.log(`E2E Selectors: ${selectorPresent} present, ${selectorAbsent} absent`);
}

runContractCheck().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});