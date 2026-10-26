const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const ROOT = path.join(__dirname, '..', '..');
const EDGE_RUNNER = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'edge-runner.py');
const PYTHON_EXE = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'python', 'python.exe');

// Check if Edge TTS runtime is available
function isEdgeRuntimeAvailable() {
  return fs.existsSync(EDGE_RUNNER) && fs.existsSync(PYTHON_EXE);
}

function runEdgeTts(text, voice, rate, pitch, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      EDGE_RUNNER,
      '--output', outputPath,
      '--voice', voice,
      '--rate', rate,
      '--pitch', pitch,
      '--ffmpeg', ffmpegStatic
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
    const pythonScript = `
import wave, sys, struct, math
filepath = sys.argv[1]
with wave.open(filepath, 'rb') as wf:
    n_channels = wf.getnchannels()
    sample_width = wf.getsampwidth()
    framerate = wf.getframerate()
    n_frames = wf.getnframes()
    frames_10ms = int(framerate * 0.01)
    wf.setpos(0)
    raw_data = wf.readframes(frames_10ms)
    if sample_width == 2:
        fmt = '<' + 'h' * (len(raw_data) // 2)
        samples = struct.unpack(fmt, raw_data)
    elif sample_width == 1:
        fmt = '<' + 'B' * len(raw_data)
        samples = struct.unpack(fmt, raw_data)
        samples = [s - 128 for s in samples]
    else:
        print("ERROR: Unsupported sample width")
        sys.exit(1)
    if n_channels == 2:
        mono = [(samples[i] + samples[i+1]) / 2.0 for i in range(0, len(samples), 2)]
        samples = mono
    first_nonzero = -1
    for i, s in enumerate(samples):
        if abs(s) > 0:
            first_nonzero = i
            break
    if first_nonzero >= 0:
        time_ms = first_nonzero / framerate * 1000
        print("FIRST_NONZERO_MS:" + str(time_ms))
    else:
        print("FIRST_NONZERO_MS:SILENCE")
`;
    
    // Write script to temp file to avoid indentation issues with -c
    const scriptPath = path.join(os.tmpdir(), 'analyze_onset_' + Date.now() + '.py');
    fs.writeFileSync(scriptPath, pythonScript);
    
    const python = spawn('python', [scriptPath, filepath], { windowsHide: true });
    let stdout = '';
    python.stdout.on('data', d => stdout += d.toString());
    python.stderr.on('data', d => console.error('[py err]', d.toString()));
    python.on('close', code => {
      fs.unlink(scriptPath, () => {}); // cleanup
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

// Skip tests if Edge runtime is not available (e.g., in CI unit test environment)
const skipIfNoEdgeRuntime = isEdgeRuntimeAvailable() ? test : test.skip;

test.describe('Edge TTS onset fix', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-onset-'));
  const voice = 'es-MX-JorgeNeural';
  const rate = '+6%';
  const pitch = '+0Hz';
  const testText = 'El prestamo del copyright incluye palabras con bl, gr, tr, pr, dr, cl.';

  test.afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  skipIfNoEdgeRuntime('pipeline output has no leading silence (onset at ~0ms)', async () => {
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

  skipIfNoEdgeRuntime('raw edge-tts MP3 still has leading silence (sanity check)', async () => {
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