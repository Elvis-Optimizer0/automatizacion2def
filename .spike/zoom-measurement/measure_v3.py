#!/usr/bin/env python3
"""
Measure zoom stability by rendering through ffmpeg filter graph and analyzing marker positions.
Uses the grid image with known markers for accurate tracking.
"""

import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path
import numpy as np
import cv2

# Paths
SCRIPT_DIR = Path(__file__).parent
GRID_IMAGE = SCRIPT_DIR / 'grid_3840x2160.png'
MARKERS_JSON = SCRIPT_DIR / 'grid_3840x2160_markers.json'

with open(MARKERS_JSON) as f:
    MARKERS_DATA = json.load(f)

# Use all markers from all categories
ALL_MARKERS = {}
for category, markers in MARKERS_DATA.items():
    if isinstance(markers, dict):
        ALL_MARKERS.update(markers)
    else:
        ALL_MARKERS[category] = markers

# FFmpeg path
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
DURATION = 6  # seconds
TOTAL_FRAMES = FPS * DURATION

# Output formats to test
FORMATS = {
    '16:9': {'w': 1920, 'h': 1080},
    '9:16': {'w': 1080, 'h': 1920},
}

# Zoom effects to test (matching zoom-v3.js)
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

def build_zoom_filter_upscale_crop_downscale(w, h, effect_params, focus_x=0.5, focus_y=0.5, upscale=2, up_flags='bilinear', down_flags='lanczos'):
    """Build zoom filter using the upscale-crop-downscale method"""
    zoom_type = effect_params['zoomType']
    start = effect_params['zoomStartScale']
    intensity = effect_params['zoomIntensity']
    max_zoom = start + intensity
    around = start + intensity / 2
    fx = focus_x
    fy = focus_y
    duration = DURATION
    
    UPSCALE = upscale
    uw = w * UPSCALE
    uh = h * UPSCALE
    
    ease = f't/{duration}'
    smooth = f'3*{ease}*{ease}-2*{ease}*{ease}*{ease}'
    
    if zoom_type == 'zoomOut':
        z_expr = f'{max_zoom}-{intensity}*{smooth}'
    elif zoom_type == 'pulse':
        z_expr = f'{around}-{intensity/2}*cos(2*PI*t/{duration})'
    elif zoom_type == 'kenburns':
        z_expr = f'{start}+{intensity}*{smooth}'
    else:  # zoomIn, panLeft, panRight, panUp, panDown
        z_expr = f'{start}+{intensity}*{smooth}' if zoom_type == 'zoomIn' else f'{max_zoom}'
    z_expr = f'min(max({z_expr},{start}),{max_zoom})'
    
    ufx = fx * uw
    ufy = fy * uh
    ucenter_x = uw / 2
    ucenter_y = uh / 2
    
    if zoom_type == 'kenburns':
        cx_expr = f'{ucenter_x}+({ufx}-{ucenter_x})*{smooth}'
        cy_expr = f'{ucenter_y}+({ufy}-{ucenter_y})*{smooth}'
    elif zoom_type == 'panLeft':
        cx_expr = f'{uw}-{w}/{max_zoom}/2+({w}/{max_zoom}/2-{uw}+{w}/{max_zoom}/2)*{smooth}'
        cy_expr = f'{ucenter_y}'
    elif zoom_type == 'panRight':
        cx_expr = f'{w}/{max_zoom}/2+({uw}-{w}/{max_zoom}/2-{w}/{max_zoom}/2)*{smooth}'
        cy_expr = f'{ucenter_y}'
    elif zoom_type == 'panUp':
        cx_expr = f'{ucenter_x}'
        cy_expr = f'{uh}-{h}/{max_zoom}/2+({h}/{max_zoom}/2-{uh}+{h}/{max_zoom}/2)*{smooth}'
    elif zoom_type == 'panDown':
        cx_expr = f'{ucenter_x}'
        cy_expr = f'{h}/{max_zoom}/2+({uh}-{h}/{max_zoom}/2-{h}/{max_zoom}/2)*{smooth}'
    else:  # zoomIn, zoomOut, pulse
        cx_expr = f'{ufx}'
        cy_expr = f'{ufy}'
    
    cropW = f'iw/{z_expr}'
    cropH = f'ih/{z_expr}'
    cropX = f'max(0,min(iw-{cropW},{cx_expr}-{cropW}/2))'
    cropY = f'max(0,min(ih-{cropH},{cy_expr}-{cropH}/2))'
    
    return f"scale={uw}:{uh}:flags={up_flags},crop=w='{cropW}':h='{cropH}':x='{cropX}':y='{cropY}',scale={w}:{h}:flags={down_flags}"

def render_with_filter(filter_graph, output_path, format_name, input_path):
    """Render video using ffmpeg with the given filter graph."""
    fmt = FORMATS[format_name]
    w, h = fmt['w'], fmt['h']
    
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
        '-movflags', '+faststart',
        '-shortest',
    ]
    
    cmd = [
        FFMPEG, '-y',
        *input_args,
        '-filter_complex', filter_str,
        *output_args,
        str(output_path)
    ]
    
    print(f"  Running ffmpeg...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr}")
        return False
    
    return True

def extract_frames(video_path, output_dir, max_frames=None):
    """Extract all frames from video as PNG."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        FFMPEG, '-y',
        '-i', str(video_path),
        '-fps_mode', 'passthrough',
        str(output_dir / 'frame_%04d.png')
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    
    if result.returncode != 0:
        print(f"  Frame extraction failed: {result.stderr}")
        return []
    
    frames = sorted(output_dir.glob('frame_*.png'))
    if max_frames:
        frames = frames[:max_frames]
    return frames

def detect_marker_template(frame, marker_name, expected_pos, search_radius=80):
    """Detect marker centroid in a frame using template matching."""
    h, w = frame.shape[:2]
    exp_x, exp_y = expected_pos
    
    # Search region around expected position
    x1 = max(0, int(exp_x) - search_radius)
    y1 = max(0, int(exp_y) - search_radius)
    x2 = min(w, int(exp_x) + search_radius)
    y2 = min(h, int(exp_y) + search_radius)
    
    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return None
    
    # Convert to grayscale
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    
    # The grid markers are white crosshairs on dark background
    # Use adaptive threshold
    _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
    
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    # Find the contour closest to center of ROI
    roi_center = (roi.shape[1] // 2, roi.shape[0] // 2)
    best_contour = None
    best_dist = float('inf')
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 30 or area > 10000:
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

def compute_expected_marker_position(marker_pos, w, h, effect_name, progress, focus_x=0.5, focus_y=0.5, start=1.0, intensity=0.15, upscale=2, input_w=3840, input_h=2160):
    """Compute expected marker position at given progress for an effect."""
    sx, sy = marker_pos
    max_zoom = start + intensity
    around = start + intensity / 2
    
    # Smoothstep easing
    def smoothstep(p):
        return 3 * p * p - 2 * p * p * p
    
    eased = smoothstep(progress)
    
    if effect_name == 'zoomIn':
        z = start + intensity * eased
    elif effect_name == 'zoomOut':
        z = max_zoom - intensity * eased
    elif effect_name == 'pulse':
        import math
        z = around - (intensity / 2) * math.cos(2 * math.pi * progress)
    elif effect_name == 'kenburns':
        z = start + intensity * eased
    elif effect_name in ['panLeft', 'panRight', 'panUp', 'panDown']:
        z = max_zoom
    else:
        z = start + intensity * eased
    z = max(start, min(max_zoom, z))
    
    # Filter chain:
    # 1. Input: input_w x input_h (grid: 3840x2160)
    # 2. scale=w*upscale:h*upscale (e.g., 3840x2160 for 1920x1080 output with 2x upscale)
    # 3. crop=w='iw/z':h='ih/z':x='cx-crop_w/2':y='cy-crop_h/2' on the upscaled space
    # 4. scale=w:h (downscale to output)
    
    uw = w * upscale
    uh = h * upscale
    
    # The scale filter (step 2) maps input coordinates to upscaled coordinates
    # If input_w == uw and input_h == uh, it's a no-op (coordinates unchanged)
    # In general: scale_x = uw / input_w, scale_y = uh / input_h
    scale_x = uw / input_w
    scale_y = uh / input_h
    
    # Marker position in upscaled space
    marker_x_up = sx * scale_x
    marker_y_up = sy * scale_y
    
    # Focus point in upscaled coordinates
    ufx = focus_x * uw
    ufy = focus_y * uh
    ucenter_x = uw / 2
    ucenter_y = uh / 2
    
    if effect_name == 'kenburns':
        cx = ucenter_x + (ufx - ucenter_x) * eased
        cy = ucenter_y + (ufy - ucenter_y) * eased
    elif effect_name == 'panLeft':
        cx = uw - w / z / 2 + (w / z / 2 - uw + w / z / 2) * eased
        cy = ucenter_y
    elif effect_name == 'panRight':
        cx = w / z / 2 + (uw - w / z / 2 - w / z / 2) * eased
        cy = ucenter_y
    elif effect_name == 'panUp':
        cx = ucenter_x
        cy = uh - h / z / 2 + (h / z / 2 - uh + h / z / 2) * eased
    elif effect_name == 'panDown':
        cx = ucenter_x
        cy = h / z / 2 + (uh - h / z / 2 - h / z / 2) * eased
    else:  # zoomIn, zoomOut, pulse
        cx = ufx
        cy = ufy
    
    # Crop dimensions in upscaled space
    crop_w_up = uw / z
    crop_h_up = uh / z
    
    # Crop top-left in upscaled space
    crop_x_up = cx - crop_w_up / 2
    crop_y_up = cy - crop_h_up / 2
    
    # Position relative to crop top-left
    rel_x = marker_x_up - crop_x_up
    rel_y = marker_y_up - crop_y_up
    
    # Downscale factor from crop to output
    downscale_factor = w / crop_w_up  # = z / upscale
    
    # Position in output
    out_x = rel_x * downscale_factor
    out_y = rel_y * downscale_factor
    
    return (out_x, out_y)

def analyze_zoom_stability(frames_dir, format_name, effect_name, marker_positions):
    """Analyze zoom stability by tracking marker positions across frames."""
    frames = sorted(frames_dir.glob('frame_*.png'))
    if not frames:
        return None
    
    fmt = FORMATS[format_name]
    w, h = fmt['w'], fmt['h']
    
    marker_tracks = {name: [] for name in marker_positions}
    
    for i, frame_path in enumerate(frames):
        if i >= TOTAL_FRAMES:
            break
        frame = cv2.imread(str(frame_path))
        if frame is None:
            continue
        
        for marker_name, marker_pos in marker_positions.items():
            progress = i / (TOTAL_FRAMES - 1)
            expected_pos = compute_expected_marker_position(marker_pos, w, h, effect_name, progress)
            
            centroid = detect_marker_template(frame, marker_name, expected_pos)
            if centroid:
                marker_tracks[marker_name].append((i, centroid[0], centroid[1], expected_pos[0], expected_pos[1]))
    
    results = {}
    for marker_name, track in marker_tracks.items():
        if len(track) < 10:
            continue
        
        frame_indices = [t[0] for t in track]
        x_measured = [t[1] for t in track]
        y_measured = [t[2] for t in track]
        x_expected = [t[3] for t in track]
        y_expected = [t[4] for t in track]
        
        x_dev = [abs(x_measured[i] - x_expected[i]) for i in range(len(x_measured))]
        y_dev = [abs(y_measured[i] - y_expected[i]) for i in range(len(y_measured))]
        
        max_dev = max(max(x_dev) if x_dev else 0, max(y_dev) if y_dev else 0)
        mean_dev = (sum(x_dev) + sum(y_dev)) / (len(x_dev) + len(y_dev)) if (len(x_dev) + len(y_dev)) > 0 else 0
        
        stutter_count = 0
        for i in range(1, len(x_measured)):
            if abs(x_measured[i] - x_measured[i-1]) < 0.01 and abs(y_measured[i] - y_measured[i-1]) < 0.01:
                stutter_count += 1
        
        non_monotone = 0
        if effect_name in ['zoomIn', 'zoomOut']:
            center = (w/2, h/2)
            for i in range(1, len(x_measured)):
                d_prev = np.hypot(x_measured[i-1] - center[0], y_measured[i-1] - center[1])
                d_curr = np.hypot(x_measured[i] - center[0], y_measured[i] - center[1])
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
        'markers_tracked': len(results),
        'markers': results,
    }

def run_measurement(format_name, effect_name, effect_params, method_name, upscale=2, up_flags='bilinear', down_flags='lanczos'):
    """Run a single measurement test."""
    print(f"\n{'='*60}")
    print(f"Testing: {format_name} | {effect_name} | {method_name}")
    print(f"{'='*60}")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        frames_dir = tmpdir / 'frames'
        video_path = tmpdir / f"{format_name.replace(':', 'x')}_{effect_name}_{method_name}.mp4"
        
        fmt = FORMATS[format_name]
        w, h = fmt['w'], fmt['h']
        filter_str = build_zoom_filter_upscale_crop_downscale(w, h, effect_params, upscale=upscale, up_flags=up_flags, down_flags=down_flags)
        
        # Render using grid image
        success = render_with_filter(filter_str, video_path, format_name, GRID_IMAGE)
        if not success:
            return None
        
        # Extract frames
        frames = extract_frames(video_path, frames_dir, max_frames=TOTAL_FRAMES)
        print(f"  Extracted {len(frames)} frames")
        
        if len(frames) < TOTAL_FRAMES * 0.9:
            print(f"  WARNING: Only got {len(frames)} frames, expected {TOTAL_FRAMES}")
        
        # Analyze
        results = analyze_zoom_stability(frames_dir, format_name, effect_name, ALL_MARKERS)
        
        if results:
            print(f"  Max deviation: {results['max_deviation_px']:.3f} px")
            print(f"  Mean deviation: {results['mean_deviation_px']:.3f} px")
            print(f"  Stutters: {results['total_stutters']}")
            print(f"  Non-monotone: {results['total_non_monotone']}")
            print(f"  Markers tracked: {results['markers_tracked']}")
        
        return results

def main():
    print("Starting zoom stability measurement (v3)...")
    print(f"Grid image: {GRID_IMAGE}")
    print(f"Markers: {len(ALL_MARKERS)} markers")
    
    # Methods to test
    METHODS = [
        ('2x-bilinear-lanczos', 2, 'bilinear', 'lanczos'),
        ('4x-lanczos-lanczos', 4, 'lanczos', 'lanczos'),
        ('4x-bilinear-lanczos', 4, 'bilinear', 'lanczos'),
        ('3x-lanczos-lanczos', 3, 'lanczos', 'lanczos'),
    ]
    
    all_results = {}
    
    for format_name in FORMATS:
        for effect_name, effect_params in ZOOM_EFFECTS.items():
            for method_name, upscale, up_flags, down_flags in METHODS:
                key = f"{format_name.replace(':', 'x')}_{effect_name}_{method_name}"
                results = run_measurement(format_name, effect_name, effect_params, method_name, upscale, up_flags, down_flags)
                all_results[key] = results
    
    # Save results
    output_file = SCRIPT_DIR / 'zoom_v3_measurement_results.json'
    with open(output_file, 'w') as f:
        def convert(obj):
            if isinstance(obj, (np.integer, np.floating)):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, dict):
                return {k: convert(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert(v) for v in obj]
            return obj
        json.dump(convert(all_results), f, indent=2)
    
    print(f"\n\nResults saved to: {output_file}")
    
    # Print summary
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    for key, results in all_results.items():
        if results:
            print(f"{key:60s}  max={results['max_deviation_px']:.3f}px  mean={results['mean_deviation_px']:.3f}px  stutters={results['total_stutters']}  non-mono={results['total_non_monotone']}  markers={results['markers_tracked']}")
        else:
            print(f"{key:60s}  FAILED")

if __name__ == '__main__':
    main()