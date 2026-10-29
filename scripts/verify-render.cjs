#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { runAllChecks, printResults } = require('./lib/render-checks.cjs');

function derivePlanFromLabClip(clipName, format) {
  const effectId = clipName.split('-')[1].split('.')[0];
  const effectMap = {
    'none': 'none',
    'kenburns': 'kenburns',
    'zoomIn': 'zoomIn',
    'zoomOut': 'zoomOut',
    'pulse': 'pulse',
    'panLeft': 'panLeft',
    'panRight': 'panRight',
    'panUp': 'panUp',
    'panDown': 'panDown'
  };
  const eff = effectMap[effectId] || 'none';
  const speed = ['zoomIn', 'zoomOut', 'kenburns'].includes(eff) ? 1.0 : 1.0;
  return {
    scenes: [{
      startSec: 0,
      durationSec: 6.0,
      effect: eff,
      speed,
      easing: 'smooth'
    }],
    boundaries: [],
    format,
    audioDurationSec: 6.0
  };
}

async function main() {
  const args = process.argv.slice(2);
  const video = args.find(a => a.startsWith('--video='))?.split('=')[1];
  const planFile = args.find(a => a.startsWith('--plan='))?.split('=')[1];
  const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || '16:9';
  const reference = args.find(a => a.startsWith('--reference='))?.split('=')[1];
  const audio = args.find(a => a.startsWith('--audio='))?.split('=')[1];
  const labDir = args.find(a => a.startsWith('--lab-dir='))?.split('=')[1];

  if (!video) {
    console.error('Usage: node verify-render.cjs --video=X.mp4 [--plan=Y.json] [--format=16:9|9:16] [--reference=Z.mp4] [--audio=A.wav] [--lab-dir=DIR]');
    process.exit(1);
  }

  let plan;
  if (planFile) {
    plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  } else if (labDir) {
    const clipName = path.basename(video);
    plan = derivePlanFromLabClip(clipName, format);
    console.log(`Derived plan from lab clip: ${clipName} -> ${plan.scenes[0].effect}`);
  } else {
    console.error('Either --plan or --lab-dir must be provided');
    process.exit(1);
  }

  console.log(`\nVerifying: ${video}`);
  console.log(`Format: ${format}`);
  console.log(`Plan: ${JSON.stringify(plan, null, 2)}`);

  const results = await runAllChecks(video, plan, { audioPath: audio, referencePath: reference, format });
  printResults(results);
  process.exit(results.pass ? 0 : 1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { derivePlanFromLabClip };