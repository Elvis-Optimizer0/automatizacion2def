#!/usr/bin/env python3
"""
Run baseline measurements for all effects and formats.
"""

import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path
import numpy as np
from PIL import Image
import cv2

MARKERS_JSON = Path(__file__).parent / 'grid_3840x2160_markers.json'
GRID_IMAGE = Path(__file__).parent / 'grid_3840x2160.png'

with open(MARKERS_JSON) as f:
    MARKERS = json.load(f)

ALL_MARKERS = {}
for category, markers in MARKERS.items():
    if isinstance(markers, dict):
        ALL_MARKERS.update(markers)
    else:
        ALL_MARKERS[category] = markers

FFMPEG = shutil.which('ffmpeg')
if not FFMPEG:
    for path in [
        r'C:\Program Files\ffmpeg\bin\ffmpeg.exe',
        r'C:\ffmpeg\bin\ffmpeg.exe',
        os.path.expanduser(r'~\scoop\apps\ffmpeg\current\bin\ffmpeg.exe'),
    ]:
        if os.path.exists(path):
            FFMPEG = path
            break

if not FFMPEG:
    raise RuntimeError("ffmpeg not found in PATH")

print(f"Using ffmpeg: {FFMPEG}")

FPS = 30
DURATION = 6
TOTAL_FRAMES = FPS * DURATION

FORMATS = {
    '16:9': {'w': 1920, 'h': 1080},
    '9:16': {'w': 1080, 'h': 1920},
}

ZOOM_EFFECTS = {
    'kenburns': {'zoomType': 'kenburns', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
    'zoomIn': {'zoomType': 'zoomIn', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
    'zoomOut': {'zoomType': 'zoomOut', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
    'pulse': {'zoomType': 'pulse', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
    'panLeft': {'zoomType': 'panLeft', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
    'panRight': {'zoomType': 'panRight', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
    'panUp': {'zoomType': 'panUp', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
    'panDown': {'zoomType': 'panDown', 'zoomStartScale': 1.0, 'zoomIntensity': 0.15},
}

def build_zoom_filter_current(w, h, effect_params, focus_x=0.5, focus_y=0.5):
    zoom_type = effect_params['zoomType']
    start = effect_params['zoomStartScale']
    intensity = effect_params['zoomIntensity']
    frames = TOTAL_FRAMES
    max_zoom = start + intensity
    around = start + intensity / 2
    fx = focus_x
    fy = focus_y
    
    progress = f'on/{frames}'
    x_center = f'iw*{fx}-iw/zoom/2'
    y_center = f'ih*{fy}-ih/zoom/2'
    clamp_x = lambda expr: f'max(0,min(iw-iw/zoom,{expr}))'
    clamp_y = lambda expr: f'max(0,min(ih-ih/zoom,{expr}))'
    z_in = f'min({start}+{intensity}*{progress},{max_zoom})'
    z_out = f'max({max_zoom}-{intensity}*{progress},{start})'
    z_pulse = f'{around}-{intensity/2}*cos(2*PI*{progress})'
    
    if zoom_type == 'zoomOut':
        z_expr = z_out
        x_expr = x_center
        y_expr = y_center
    elif zoom_type == 'pulse':
        z_expr = z_pulse
        x_expr = x_center
        y_expr = y_center
    elif zoom_type == 'kenburns':
        z_expr = z_in
        x_expr = f'iw*{fx}-iw/zoom/2+(iw-iw/zoom)*({progress}-0.5)'
        y_expr = f'ih*{fy}-ih/zoom/2+(ih-ih/zoom)*({progress}-0.5)'
    elif zoom_type == 'panLeft':
        z_expr = f'{max_zoom}'
        x_expr = f'(iw-iw/zoom)*(1-{progress})'
        y_expr = y_center
    elif zoom_type == 'panRight':
        z_expr = f'{max_zoom}'
        x_expr = f'(iw-iw/zoom)*{progress}'
        y_expr = y_center
    elif zoom_type == 'panUp':
        z_expr = f'{max_zoom}'
        x_expr = x_center
        y_expr = f'(ih-ih/zoom)*(1-{progress})'
    elif zoom_type == 'panDown':
        z_expr = f'{max_zoom}'
        x_expr = x_center
        y_expr = f'(ih-ih/zoom)*{progress}'
    else:
        z_expr = z_in
        x_expr = x_center
        y_expr = y_center
    
    return f"zoompan=z='{z_expr}':d=1:x='{clamp_x(x_expr)}':y='{clamp_y(y_expr)}':s={w}x{h}:fps={FPS}"

def render_with_filter(filter_graph, output_dir, format_name, effect_name, input_path, is_preview=False):
    fmt = FORMATS[format_name]
    w, h = fmt['w'], fmt['h']
    
    if is_preview:
        scale_w = 640
        scale_h = int(640 * h / w / 2) * 2
        input_args = [
            '-framerate', str(FPS),
            '-loop', '1',
            '-t', str(DURATION),
            '-i', str(input_path),
        ]
        filter_str = f"[0:v]scale={scale_w}:{scale_h}:force_original_aspect_ratio=increase,crop={scale_w}:{scale_h},{filter_graph},setsar=1,format=yuv420p[vout]"
        output_args = [
            '-map', '[vout]',
            '-t', str(DURATION),
            '-r', str(FPS),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
        ]
    else:
        input_args = [
            '-framerate', str(FPS),
            '-loop', '1',
            '-t', str(DURATION),
            '-i', str(input_path),
        ]
        filter_str = f"[0:v]{filter_graph},setsar=1,format=yuv420p[vout]"
        output_args = [
            '-map', '[vout]',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '18',
            '-maxrate', '12M',
            '-bufsize', '24M',
            '-profile:v', 'high',
            '-pix_fmt', 'yuv420p',
            '-r', str(FPS),
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-shortest',
        ]
    
    output_path = output_dir / f"{format_name.replace(':', 'x')}_{effect_name}.mp4"
    
    cmd = [
        FFMPEG, '-y',
        *input_args,
        '-filter_complex', filter_str,
        *output_args,
        str(output_path)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[-500:]}")
        return None
    
    return output_path

def extract_frames(video_path, output_dir, max_frames=None):
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        FFMPEG, '-y',
        '-i', str(video_path),
        str(output_dir / 'frame_%04d.png')
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    
    if result.returncode != 0:
        print(f"  Frame extraction failed: {result.stderr[-500:]}")
        return []
    
    frames = sorted(output_dir.glob('frame_*.png'))
    if max_frames:
        frames = frames[:max_frames]
    return frames

def detect_marker_centroid(frame_path, marker_name, expected_pos, search_radius=60):
    frame = cv2.imread(str(frame_path))
    if frame is None:
        return None
    
    h, w = frame.shape[:2]
    exp_x, exp_y = expected_pos
    
    x1 = max(0, int(exp_x) - search_radius)
    y1 = max(0, int(exp_y) - search_radius)
    x2 = min(w, int(exp_x) + search_radius)
    y2 = min(h, int(exp_y) + search_radius)
    
    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return None
    
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 50, 255, cv2.THRESH_BINARY)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    roi_center = (roi.shape[1] // 2, roi.shape[0] // 2)
    best_contour = None
    best_dist = float('inf')
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 20 or area > 5000:
            continue
        M = cv2.moments(cnt)
        if M['m00'] == 0:
            continue
        cx = M['m10'] / M['m00']
        cy = M['m01'] / M['m00']
        dist = (cx - roi_center[0])**2 + (cy - roi_center[1])**2
        if dist < best_dist:
            best_dist = dist
            best_contour = cnt
    
    if best_contour is None:
        return None
    
    M = cv2.moments(best_contour)
    if M['m00'] == 0:
        return None
    
    cx = M['m10'] / M['m00'] + x1
    cy = M['m01'] / M['m00'] + y1
    
    return (cx, cy)

def compute_expected_position(marker_pos, w, h, effect, progress):
    sx, sy = marker_pos
    
    if w == 1920 and h == 1080:
        scale = 0.5
        fx, fy = sx * scale, sy * scale
    else:
        scale = h / 2160
        scaled_w = 3840 * scale
        crop_x = (scaled_w - w) / 2
        fx = sx * scale - crop_x
        fy = sy * scale
    
    focus_x, focus_y = 0.5, 0.5
    start = 1.0
    intensity = 0.15
    max_zoom = start + intensity
    around = start + intensity / 2
    
    if effect == 'zoomIn':
        z = start + intensity * progress
        z = min(z, max_zoom)
    elif effect == 'zoomOut':
        z = max_zoom - intensity * progress
        z = max(z, start)
    elif effect == 'pulse':
        import math
        z = around - (intensity / 2) * math.cos(2 * math.pi * progress)
    elif effect == 'kenburns':
        z = start + intensity * progress
        z = min(z, max_zoom)
    elif effect in ['panLeft', 'panRight', 'panUp', 'panDown']:
        z = max_zoom
    else:
        z = start + intensity * progress
        z = min(z, max_zoom)
    
    if effect == 'kenburns':
        x_center = w * focus_x - w / z / 2
        y_center = h * focus_y - h / z / 2
        x_pan = (w - w/z) * (progress - 0.5)
        y_pan = (h - h/z) * (progress - 0.5)
        x_viewport = x_center + x_pan
        y_viewport = y_center + y_pan
    elif effect == 'panLeft':
        x_viewport = (w - w/z) * (1 - progress)
        y_viewport = h * focus_y - h / z / 2
    elif effect == 'panRight':
        x_viewport = (w - w/z) * progress
        y_viewport = h * focus_y - h / z / 2
    elif effect == 'panUp':
        x_viewport = w * focus_x - w / z / 2
        y_viewport = (h - h/z) * (1 - progress)
    elif effect == 'panDown':
        x_viewport = w * focus_x - w / z / 2
        y_viewport = (h - h/z) * progress
    else:
        x_viewport = w * focus_x - w / z / 2
        y_viewport = h * focus_y - h / z / 2
    
    out_x = (fx - x_viewport) * z
    out_y = (fy - y_viewport) * z
    
    return (out_x, out_y)

def analyze_zoom_stability(frames_dir, format_name, effect_name, marker_positions):
    frames = sorted(frames_dir.glob('frame_*.png'))
    if not frames:
        return None
    
    fmt = FORMATS[format_name]
    w, h = fmt['w'], fmt['h']
    
    marker_tracks = {name: [] for name in marker_positions}
    
    for i, frame_path in enumerate(frames):
        for marker_name, expected_pos in marker_positions.items():
            scale_x = w / 3840
            scale_y = h / 2160
            scaled_pos = (expected_pos[0] * scale_x, expected_pos[1] * scale_y)
            
            centroid = detect_marker_centroid(frame_path, marker_name, scaled_pos)
            if centroid:
                marker_tracks[marker_name].append((i, centroid[0], centroid[1]))
    
    results = {}
    for marker_name, track in marker_tracks.items():
        if len(track) < 10:
            continue
        
        frame_indices = [t[0] for t in track]
        x_positions = [t[1] for t in track]
        y_positions = [t[2] for t in track]
        
        expected_x = []
        expected_y = []
        
        for f in frame_indices:
            progress = f / TOTAL_FRAMES
            exp = compute_expected_position(marker_positions[marker_name], w, h, effect_name, progress)
            expected_x.append(exp[0])
            expected_y.append(exp[1])
        
        x_dev = [abs(x_positions[i] - expected_x[i]) for i in range(len(x_positions))]
        y_dev = [abs(y_positions[i] - expected_y[i]) for i in range(len(y_positions))]
        
        max_dev = max(max(x_dev), max(y_dev))
        mean_dev = (sum(x_dev) + sum(y_dev)) / (len(x_dev) + len(y_dev))
        
        stutter_count = 0
        for i in range(1, len(x_positions)):
            if abs(x_positions[i] - x_positions[i-1]) < 0.01 and abs(y_positions[i] - y_positions[i-1]) < 0.01:
                stutter_count += 1
        
        non_monotone = 0
        if effect_name in ['zoomIn', 'zoomOut']:
            center = (w/2, h/2)
            for i in range(1, len(x_positions)):
                d_prev = np.hypot(x_positions[i-1] - center[0], y_positions[i-1] - center[1])
                d_curr = np.hypot(x_positions[i] - center[0], y_positions[i] - center[1])
                if effect_name == 'zoomIn' and d_curr < d_prev - 0.5:
                    non_monotone += 1
                elif effect_name == 'zoomOut' and d_curr > d_prev + 0.5:
                    non_monotone += 1
        
        results[marker_name] = {
            'max_deviation_px': max_dev,
            'mean_deviation_px': mean_dev,
            'stutter_count': stutter_count,
            'non_monotone_count': non_monotone,
            'frames_tracked': len(track),
        }
    
    if not results:
        return None
    
    return {
        'max_deviation_px': max(r['max_deviation_px'] for r in results.values()),
        'mean_deviation_px': float(np.mean([r['mean_deviation_px'] for r in results.values()])),
        'total_stutters': sum(r['stutter_count'] for r in results.values()),
        'total_non_monotone': sum(r['non_monotone_count'] for r in results.values()),
        'markers': {k: {kk: float(vv) if isinstance(vv, (np.floating, np.integer)) else vv for kk, vv in v.items()} for k, v in results.items()},
    }

def run_single_test(format_name, effect_name, effect_params, is_preview=False):
    print(f"\n{'='*60}")
    print(f"Testing: {format_name} | {effect_name} | {'preview' if is_preview else 'export'}")
    print(f"{'='*60}")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        frames_dir = tmpdir / 'frames'
        
        fmt = FORMATS[format_name]
        w, h = fmt['w'], fmt['h']
        filter_str = build_zoom_filter_current(w, h, effect_params)
        
        video_path = render_with_filter(filter_str, tmpdir, format_name, effect_name, GRID_IMAGE, is_preview)
        if not video_path:
            return None
        
        frames = extract_frames(video_path, frames_dir, max_frames=TOTAL_FRAMES)
        print(f"  Extracted {len(frames)} frames")
        
        if len(frames) < TOTAL_FRAMES * 0.9:
            print(f"  WARNING: Only got {len(frames)} frames, expected {TOTAL_FRAMES}")
        
        results = analyze_zoom_stability(frames_dir, format_name, effect_name, ALL_MARKERS)
        
        if results:
            print(f"  Max deviation: {results['max_deviation_px']:.3f} px")
            print(f"  Mean deviation: {results['mean_deviation_px']:.3f} px")
            print(f"  Stutters: {results['total_stutters']}")
            print(f"  Non-monotone: {results['total_non_monotone']}")
        
        return results

def main():
    all_results = {}
    
    test_configs = []
    for format_name in FORMATS:
        for effect_name, effect_params in ZOOM_EFFECTS.items():
            test_configs.append((format_name, effect_name, effect_params, False))  # export
            test_configs.append((format_name, effect_name, effect_params, True))   # preview
    
    print(f"Running {len(test_configs)} tests...")
    
    for format_name, effect_name, effect_params, is_preview in test_configs:
        key = f"{'preview' if is_preview else 'export'}_{format_name.replace(':', 'x')}_{effect_name}"
        try:
            results = run_single_test(format_name, effect_name, effect_params, is_preview)
            all_results[key] = results
        except Exception as e:
            print(f"  FAILED with exception: {e}")
            all_results[key] = None
    
    output_file = Path(__file__).parent / 'baseline_results.json'
    with open(output_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    print(f"\n\nResults saved to: {output_file}")
    
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    for key, results in all_results.items():
        if results:
            print(f"{key:55s}  max={results['max_deviation_px']:7.3f}px  mean={results['mean_deviation_px']:7.3f}px  stutters={results['total_stutters']:3d}  non-mono={results['total_non_monotone']:3d}")
        else:
            print(f"{key:55s}  FAILED")

if __name__ == '__main__':
    main()