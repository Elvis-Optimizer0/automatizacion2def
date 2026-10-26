import sys
import wave
import struct
import math
import os

def analyze_wav(filepath, label):
    print(f"\n=== {label} ===")
    print(f"File: {filepath}")
    
    with wave.open(filepath, 'rb') as wf:
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        duration = n_frames / float(framerate)
        
        print(f"Channels: {n_channels}")
        print(f"Sample width: {sample_width} bytes")
        print(f"Sample rate: {framerate} Hz")
        print(f"Frames: {n_frames}")
        print(f"Duration: {duration:.3f} s")
        
        # Read first 150ms worth of frames
        frames_150ms = int(framerate * 0.15)
        frames_to_read = min(frames_150ms, n_frames)
        
        wf.setpos(0)
        raw_data = wf.readframes(frames_to_read)
        
        # Convert to samples
        if sample_width == 2:
            fmt = '<' + 'h' * (len(raw_data) // 2)
            samples = struct.unpack(fmt, raw_data)
        elif sample_width == 1:
            fmt = '<' + 'B' * len(raw_data)
            samples = struct.unpack(fmt, raw_data)
            samples = [s - 128 for s in samples]
        else:
            print(f"Unsupported sample width: {sample_width}")
            return
        
        # For stereo, average channels
        if n_channels == 2:
            mono_samples = [(samples[i] + samples[i+1]) / 2.0 for i in range(0, len(samples), 2)]
            samples = mono_samples
        
        # Calculate RMS of first 150ms
        if samples:
            rms = math.sqrt(sum(s*s for s in samples) / len(samples))
            max_amp = max(abs(s) for s in samples)
            print(f"First 150ms: RMS={rms:.2f}, Max={max_amp}, Samples={len(samples)}")
        
        # Check first 10ms specifically - find first non-zero sample
        frames_10ms = int(framerate * 0.01)
        wf.setpos(0)
        raw_data_10 = wf.readframes(frames_10ms)
        
        if sample_width == 2:
            fmt = '<' + 'h' * (len(raw_data_10) // 2)
            samples_10 = struct.unpack(fmt, raw_data_10)
        elif sample_width == 1:
            fmt = '<' + 'B' * len(raw_data_10)
            samples_10 = struct.unpack(fmt, raw_data_10)
            samples_10 = [s - 128 for s in samples_10]
        else:
            samples_10 = []
        
        if n_channels == 2:
            mono_samples_10 = [(samples_10[i] + samples_10[i+1]) / 2.0 for i in range(0, len(samples_10), 2)]
            samples_10 = mono_samples_10
        
        # Find first non-zero sample
        first_nonzero = -1
        for i, s in enumerate(samples_10):
            if abs(s) > 0:
                first_nonzero = i
                break
        
        if first_nonzero >= 0:
            time_ms = first_nonzero / framerate * 1000
            print(f"First non-zero sample at index {first_nonzero} ({time_ms:.2f} ms)")
        else:
            print("First 10ms: ALL ZERO (silence)")
        
        # Also check first 50ms
        frames_50ms = int(framerate * 0.05)
        wf.setpos(0)
        raw_data_50 = wf.readframes(frames_50ms)
        
        if sample_width == 2:
            fmt = '<' + 'h' * (len(raw_data_50) // 2)
            samples_50 = struct.unpack(fmt, raw_data_50)
        elif sample_width == 1:
            fmt = '<' + 'B' * len(raw_data_50)
            samples_50 = struct.unpack(fmt, raw_data_50)
            samples_50 = [s - 128 for s in samples_50]
        else:
            samples_50 = []
        
        if n_channels == 2:
            mono_samples_50 = [(samples_50[i] + samples_50[i+1]) / 2.0 for i in range(0, len(samples_50), 2)]
            samples_50 = mono_samples_50
        
        if samples_50:
            first_nonzero_50 = -1
            for i, s in enumerate(samples_50):
                if abs(s) > 0:
                    first_nonzero_50 = i
                    break
            if first_nonzero_50 >= 0:
                time_ms = first_nonzero_50 / framerate * 1000
                print(f"First non-zero in 50ms at index {first_nonzero_50} ({time_ms:.2f} ms)")
            else:
                print("First 50ms: ALL ZERO (silence)")
        
        # Check where audio actually starts (scan up to 200ms)
        frames_200ms = int(framerate * 0.2)
        wf.setpos(0)
        raw_data_200 = wf.readframes(frames_200ms)
        
        if sample_width == 2:
            fmt = '<' + 'h' * (len(raw_data_200) // 2)
            samples_200 = struct.unpack(fmt, raw_data_200)
        elif sample_width == 1:
            fmt = '<' + 'B' * len(raw_data_200)
            samples_200 = struct.unpack(fmt, raw_data_200)
            samples_200 = [s - 128 for s in samples_200]
        else:
            samples_200 = []
        
        if n_channels == 2:
            mono_samples_200 = [(samples_200[i] + samples_200[i+1]) / 2.0 for i in range(0, len(samples_200), 2)]
            samples_200 = mono_samples_200
        
        first_nonzero_200 = -1
        for i, s in enumerate(samples_200):
            if abs(s) > 10:  # threshold to avoid noise
                first_nonzero_200 = i
                break
        
        if first_nonzero_200 >= 0:
            time_ms = first_nonzero_200 / framerate * 1000
            print(f"First significant audio (>10) at index {first_nonzero_200} ({time_ms:.2f} ms)")
        else:
            print("First 200ms: NO SIGNIFICANT AUDIO")

if __name__ == '__main__':
    import os
    
    ROOT = r'C:\Users\zyrothx\Desktop\projectwo'
    spike_dir = os.path.join(ROOT, '.spike')
    
    files_to_analyze = [
        (os.path.join(spike_dir, 'test_raw.wav'), 'RAW WAV (ffmpeg converted)'),
        (os.path.join(spike_dir, 'test_pipeline.wav'), 'PIPELINE WAV (edge-runner.py)'),
        (os.path.join(spike_dir, 'onset_raw_wav.wav'), 'ONSET RAW WAV (first 500ms)'),
        (os.path.join(spike_dir, 'onset_pipeline_wav.wav'), 'ONSET PIPELINE WAV (first 500ms)'),
    ]
    
    for filepath, label in files_to_analyze:
        if os.path.exists(filepath):
            analyze_wav(filepath, label)
        else:
            print(f"\n=== {label} ===")
            print(f"File not found: {filepath}")