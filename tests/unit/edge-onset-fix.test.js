const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EDGE_RUNNER = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'edge-runner.py');
const PYTHON_EXE = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'python', 'python.exe');

function runEdgeTts(text, voice, rate, pitch, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      EDGE_RUNNER,
      '--output', outputPath,
      '--voice', voice,
      '--rate', rate,
      '--pitch', pitch
    ];

    const child = spawn(PYTHON_EXE, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch (e) { void e; }
        reject(new Error('TIMEOUT after 60000ms'));
      }
    }, 60000);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('spawn error: ' + err.message));
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error('edge-tts exited with code ' + code + ': ' + stderr));
        }
      }
    });

    const payload = JSON.stringify({
      text,
      voiceId: voice,
      language: voice.startsWith('es') ? 'es' : 'en',
      speed: 1,
      pause: 0.3,
      rate,
      pitch,
      outputPath
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

function analyzeWavOnset(filepath) {
  return new Promise((resolve, reject) => {
    const pythonScript = 'import wave, sys, struct, math\n' +
      'filepath = sys.argv[1]\n' +
      'with wave.open(filepath, \'rb\') as wf:\n' +
      '    n_channels = wf.getnchannels()\n' +
      '    sample_width = wf.getsampwidth()\n' +
      '    framerate = wf.getframerate()\n' +
      '    n_frames = wf.getnframes()\n' +
      '    frames_10ms = int(framerate * 0.01)\n' +
      '    wf.setpos(0)\n' +
      '    raw_data = wf.readframes(frames_10ms)\n' +
      '    if sample_width == 2:\n' +
      '        fmt = \'<\' + \'h\' * (len(raw_data) // 2)\n' +
      '        samples = struct.unpack(fmt, raw_data)\n' +
      '    elif sample_width == 1:\n' +
      '        fmt = \'<\' + \'B\' * len(raw_data)\n' +
      '        samples = struct.unpack(fmt, raw_data)\n' +
      '        samples = [s - 128 for s in samples]\n' +
      '    else:\n' +
      '        print("ERROR: Unsupported sample width")\n' +
      '        sys.exit(1)\n' +
      '    if n_channels == 2:\n' +
      '        mono = [(samples[i] + samples[i+1]) / 2.0 for i in range(0, len(samples), 2)]\n' +
      '        samples = mono\n' +
      '    first_nonzero = -1\n' +
      '    for i, s in enumerate(samples):\n' +
      '        if abs(s) > 0:\n' +
      '            first_nonzero = i\n' +
      '            break\n' +
      '    if first_nonzero >= 0:\n' +
      '        time_ms = first_nonzero / framerate * 1000\n' +
      '        print("FIRST_NONZERO_MS:" + str(time_ms))\n' +
      '    else:\n' +
      '        print("FIRST_NONZERO_MS:SILENCE")';
    
    const python = spawn('python', ['-c', pythonScript, filepath], { windowsHide: true });
    let stdout = '';
    python.stdout.on('data', d => stdout += d.toString());
    python.stderr.on('data', d => console.error('[py err]', d.toString()));
    python.on('close', code => {
      if (code === 0) {
        const match = stdout.match(/FIRST_NONZERO_MS:([\d.]+|SILENCE)/);
        if (match) {
          resolve(match[1]);
        } else {
          reject(new Error('Could not parse output: ' + stdout));
        }
      } else {
        reject(new Error('Python exited with code ' + code));
      }
    });
  });
}

test.describe('Edge TTS onset fix', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-onset-'));
  const voice = 'es-MX-JorgeNeural';
  const rate = '+6%';
  const pitch = '+0Hz';
  const testText = 'El prestamo del copyright incluye palabras con bl, gr, tr, pr, dr, cl.';

  test.afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('pipeline output has no leading silence (onset at ~0ms)', async () => {
    const outputPath = path.join(testDir, 'test_onset.wav');
    
    await runEdgeTts(testText, voice, rate, pitch, outputPath);
    
    const onsetMs = await analyzeWavOnset(outputPath);
    
    if (onsetMs === 'SILENCE') {
      throw new Error('Audio is completely silent');
    }
    
    const onset = parseFloat(onsetMs);
    console.log('Onset:', onsetMs, 'ms');
    
    expect(onset).toBeLessThan(10);
  });

  test('raw edge-tts MP3 still has leading silence (sanity check)', async () => {
    const runPython = (script, args) => new Promise((resolve, reject) => {
      const child = spawn(PYTHON_EXE, ['-c', script, ...args], { windowsHide: true });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());
      child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    });
    
    const script = 'import asyncio, edge_tts, sys\n' +
      'async def main():\n' +
      '    text = sys.argv[1]\n' +
      '    voice = sys.argv[2]\n' +
      '    rate = sys.argv[3]\n' +
      '    pitch = sys.argv[4]\n' +
      '    output = sys.argv[5]\n' +
      '    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)\n' +
      '    await communicate.save(output)\n' +
      '    print("DONE")\n' +
      'asyncio.run(main())';
    
    const rawMp3 = path.join(testDir, 'raw_test.mp3');
    await runPython(script, [testText, 'es-MX-JorgeNeural', '+6%', '+0Hz', rawMp3]);
    
    const rawWav = path.join(testDir, 'raw_test.wav');
    const ffmpegPath = require('ffmpeg-static');
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, [
        '-y', '-i', rawMp3,
        '-ar', '48000', '-ac', '2',
        '-c:a', 'pcm_s16le', rawWav
      ], { windowsHide: true });
      child.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed')));
    });
    
    const onsetMs = await analyzeWavOnset(rawWav);
    console.log('Raw edge-tts onset:', onsetMs, 'ms');
    
    if (onsetMs !== 'SILENCE') {
      const onset = parseFloat(onsetMs);
      expect(onset).toBeGreaterThan(80);
      expect(onset).toBeLessThan(110);
    }
  });
});