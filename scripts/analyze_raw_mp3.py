import sys
import struct
import math
import os
import subprocess
import tempfile

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
    
    # Convert to samples
    n_samples = len(pcm_data) // 2
    fmt = '<' + 'h' * n_samples
    samples = struct.unpack(fmt, pcm_data)
    
    # For stereo, average channels
    if channels == 2:
        mono_samples = [(samples[i] + samples[i+1]) / 2.0 for i in range(0, len(samples), 2)]
        samples = mono_samples
    
    print(f"Total samples: {len(samples)}")
    print(f"Duration: {len(samples) / sample_rate:.3f} s")
    
    # Check first 10ms
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
    
    # Check first 50ms
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
    
    # Check where audio actually starts (scan up to 200ms)
    frames_200ms = int(sample_rate * 0.2)
    first_200ms = samples[:frames_200ms]
    
    first_nonzero_200 = -1
    for i, s in enumerate(first_200ms):
        if abs(s) > 10:  # threshold
            first_nonzero_200 = i
            break
    
    if first_nonzero_200 >= 0:
        time_ms = first_nonzero_200 / sample_rate * 1000
        print(f"First significant audio (>10) at index {first_nonzero_200} ({time_ms:.2f} ms)")
    else:
        print("First 200ms: NO SIGNIFICANT AUDIO")

def main():
    ROOT = r'C:\Users\zyrothx\Desktop\projectwo'
    spike_dir = os.path.join(ROOT, '.spike')
    
    raw_mp3 = os.path.join(spike_dir, 'test_raw.mp3')
    
    print("Analyzing raw MP3 from edge-tts directly...")
    pcm_data = mp3_to_wav_pipe(raw_mp3)
    analyze_pcm(pcm_data, 24000, 1, 'RAW MP3 (edge-tts direct, 24kHz mono)')

if __name__ == '__main__':
    main()