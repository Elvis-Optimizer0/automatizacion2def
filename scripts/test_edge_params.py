import sys
import struct
import math
import os
import subprocess

def mp3_to_wav_pipe(mp3_path):
    """Convert MP3 to WAV using ffmpeg and return raw PCM data"""
    cmd = [
        'ffmpeg', '-v', 'error', '-i', mp3_path,
        '-f', 's16le', '-acodec', 'pcm_s16le', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, check=True)
    return result.stdout

def analyze_pcm(pcm_data, sample_rate, channels, label):
    print(f"\n=== {label} ===")
    print(f"PCM data size: {len(pcm_data)} bytes")
    
    n_samples = len(pcm_data) // 2
    fmt = '<' + 'h' * n_samples
    samples = struct.unpack(fmt, pcm_data)
    
    if channels == 2:
        mono_samples = [(samples[i] + samples[i+1]) / 2.0 for i in range(0, len(samples), 2)]
        samples = mono_samples
    
    print(f"Total samples: {len(samples)}")
    print(f"Duration: {len(samples) / sample_rate:.3f} s")
    
    frames_10ms = int(sample_rate * 0.01)
    first_10ms = samples[:frames_10ms]
    
    first_nonzero = -1
    for i, s in enumerate(first_10ms):
        if abs(s) > 0:
            first_nonzero = i
            break
    
    if first_nonzero >= 0:
        time_ms = first_nonzero / sample_rate * 1000
        print(f"First non-zero sample at index {first_nonzero} ({time_ms:.2f} ms)")
    else:
        print("First 10ms: ALL ZERO (silence)")
    
    frames_50ms = int(sample_rate * 0.05)
    first_50ms = samples[:frames_50ms]
    
    first_nonzero_50 = -1
    for i, s in enumerate(first_50ms):
        if abs(s) > 0:
            first_nonzero_50 = i
            break
    
    if first_nonzero_50 >= 0:
        time_ms = first_nonzero_50 / sample_rate * 1000
        print(f"First non-zero in 50ms at index {first_nonzero_50} ({time_ms:.2f} ms)")
    else:
        print("First 50ms: ALL ZERO (silence)")
    
    frames_200ms = int(sample_rate * 0.2)
    first_200ms = samples[:frames_200ms]
    
    first_nonzero_200 = -1
    for i, s in enumerate(first_200ms):
        if abs(s) > 10:
            first_nonzero_200 = i
            break
    
    if first_nonzero_200 >= 0:
        time_ms = first_nonzero_200 / sample_rate * 1000
        print(f"First significant audio (>10) at index {first_nonzero_200} ({time_ms:.2f} ms)")
    else:
        print("First 200ms: NO SIGNIFICANT AUDIO")

def run_edge_tts(text, voice, rate, pitch, output):
    import asyncio
    import edge_tts
    
    async def main():
        kwargs = {'voice': voice}
        if rate is not None:
            kwargs['rate'] = rate
        if pitch is not None:
            kwargs['pitch'] = pitch
        communicate = edge_tts.Communicate(text, **kwargs)
        await communicate.save(output)
    
    asyncio.run(main())

def main():
    ROOT = r'C:\Users\zyrothx\Desktop\projectwo'
    spike_dir = os.path.join(ROOT, '.spike')
    
    test_text = 'El prestamo del copyright incluye palabras con bl, gr, tr, pr, dr, cl.'
    voice = 'es-MX-JorgeNeural'
    
    # Test 1: Our current params (rate + pitch)
    print(">>> Test 1: rate=+6%, pitch=+0Hz (our current)")
    out1 = os.path.join(spike_dir, 'test_t1.mp3')
    run_edge_tts(test_text, voice, '+6%', '+0Hz', out1)
    pcm1 = mp3_to_wav_pipe(out1)
    analyze_pcm(pcm1, 24000, 1, 'Test 1: rate=+6%, pitch=+0Hz')
    
    # Test 2: Only rate, no pitch
    print("\n>>> Test 2: rate=+6%, pitch=None")
    out2 = os.path.join(spike_dir, 'test_t2.mp3')
    run_edge_tts(test_text, voice, '+6%', None, out2)
    pcm2 = mp3_to_wav_pipe(out2)
    analyze_pcm(pcm2, 24000, 1, 'Test 2: rate=+6%, pitch=None')
    
    # Test 3: Only rate=+0%, pitch=None
    print("\n>>> Test 3: rate=+0%, pitch=None")
    out3 = os.path.join(spike_dir, 'test_t3.mp3')
    run_edge_tts(test_text, voice, '+0%', None, out3)
    pcm3 = mp3_to_wav_pipe(out3)
    analyze_pcm(pcm3, 24000, 1, 'Test 3: rate=+0%, pitch=None')
    
    # Test 4: No rate, no pitch (defaults)
    print("\n>>> Test 4: rate=None, pitch=None (defaults)")
    out4 = os.path.join(spike_dir, 'test_t4.mp3')
    run_edge_tts(test_text, voice, None, None, out4)
    pcm4 = mp3_to_wav_pipe(out4)
    analyze_pcm(pcm4, 24000, 1, 'Test 4: defaults')

if __name__ == '__main__':
    main()