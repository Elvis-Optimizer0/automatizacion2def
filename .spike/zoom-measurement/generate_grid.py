#!/usr/bin/env python3
"""
Generate a synthetic 3840x2160 grid image with identifiable markers at known coordinates.
Markers are placed at specific positions to track zoom/pan motion precisely.
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os

def generate_grid_image(output_path, width=3840, height=2160):
    """Generate a grid image with markers at known coordinates."""
    img = Image.new('RGB', (width, height), color='#1a1a2e')
    draw = ImageDraw.Draw(img)
    
    # Grid lines every 120 pixels (32x18 grid)
    grid_step = 120
    grid_color = '#2a2a4e'
    
    # Vertical grid lines
    for x in range(0, width, grid_step):
        draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
    
    # Horizontal grid lines
    for y in range(0, height, grid_step):
        draw.line([(0, y), (width, y)], fill=grid_color, width=1)
    
    # Major grid lines every 480 pixels (8x4.5 major grid)
    major_step = 480
    major_color = '#3a3a6e'
    
    for x in range(0, width, major_step):
        draw.line([(x, 0), (x, height)], fill=major_color, width=2)
    
    for y in range(0, height, major_step):
        draw.line([(0, y), (width, y)], fill=major_color, width=2)
    
    # Center crosshair
    center_x, center_y = width // 2, height // 2
    draw.line([(center_x - 50, center_y), (center_x + 50, center_y)], fill='#ff6b6b', width=3)
    draw.line([(center_x, center_y - 50), (center_x, center_y + 50)], fill='#ff6b6b', width=3)
    draw.ellipse([center_x - 10, center_y - 10, center_x + 10, center_y + 10], outline='#ff6b6b', width=3)
    
    # Corner markers with unique patterns for each corner
    marker_size = 80
    corner_positions = [
        (marker_size, marker_size),  # top-left
        (width - marker_size, marker_size),  # top-right
        (marker_size, height - marker_size),  # bottom-left
        (width - marker_size, height - marker_size),  # bottom-right
    ]
    
    # Unique patterns for each corner
    corner_colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3']
    corner_labels = ['TL', 'TR', 'BL', 'BR']
    
    for i, (cx, cy) in enumerate(corner_positions):
        color = corner_colors[i]
        label = corner_labels[i]
        # Draw unique marker pattern
        draw.rectangle([cx - 40, cy - 40, cx + 40, cy + 40], outline=color, width=4)
        draw.line([(cx - 30, cy), (cx + 30, cy)], fill=color, width=3)
        draw.line([(cx, cy - 30), (cx, cy + 30)], fill=color, width=3)
        # Add label
        try:
            font = ImageFont.truetype("arial.ttf", 36)
        except:
            font = ImageFont.load_default()
        text_bbox = draw.textbbox((cx, cy + 50), label, font=font)
        draw.text((cx - (text_bbox[2] - text_bbox[0]) // 2, cy + 50), label, fill=color, font=font)
    
    # Edge center markers
    edge_positions = [
        (center_x, marker_size),  # top
        (center_x, height - marker_size),  # bottom
        (marker_size, center_y),  # left
        (width - marker_size, center_y),  # right
    ]
    edge_labels = ['T', 'B', 'L', 'R']
    edge_colors = ['#ffa07a', '#ffa07a', '#a0d0ff', '#a0d0ff']
    
    for i, (cx, cy) in enumerate(edge_positions):
        color = edge_colors[i]
        label = edge_labels[i]
        draw.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], outline=color, width=3)
        draw.line([(cx - 20, cy), (cx + 20, cy)], fill=color, width=2)
        draw.line([(cx, cy - 20), (cx, cy + 20)], fill=color, width=2)
        try:
            font = ImageFont.truetype("arial.ttf", 28)
        except:
            font = ImageFont.load_default()
        text_bbox = draw.textbbox((cx, cy + 40), label, font=font)
        draw.text((cx - (text_bbox[2] - text_bbox[0]) // 2, cy + 40), label, fill=color, font=font)
    
    # Quarter markers (for detecting pan direction)
    quarter_positions = [
        (width // 4, height // 4),  # Q1
        (3 * width // 4, height // 4),  # Q2
        (width // 4, 3 * height // 4),  # Q3
        (3 * width // 4, 3 * height // 4),  # Q4
    ]
    quarter_labels = ['Q1', 'Q2', 'Q3', 'Q4']
    quarter_color = '#c7ceea'
    
    for i, (cx, cy) in enumerate(quarter_positions):
        label = quarter_labels[i]
        draw.rectangle([cx - 25, cy - 25, cx + 25, cy + 25], outline=quarter_color, width=2)
        draw.line([(cx - 15, cy), (cx + 15, cy)], fill=quarter_color, width=2)
        draw.line([(cx, cy - 15), (cx, cy + 15)], fill=quarter_color, width=2)
        try:
            font = ImageFont.truetype("arial.ttf", 24)
        except:
            font = ImageFont.load_default()
        text_bbox = draw.textbbox((cx, cy + 35), label, font=font)
        draw.text((cx - (text_bbox[2] - text_bbox[0]) // 2, cy + 35), label, fill=quarter_color, font=font)
    
    # Coordinate reference text at known positions
    ref_points = [
        (100, 100, "(0,0)"),
        (width - 200, 100, f"({width},0)"),
        (100, height - 100, f"(0,{height})"),
        (width - 250, height - 100, f"({width},{height})"),
        (center_x - 80, 100, f"({center_x},0)"),
        (center_x - 80, height - 100, f"({center_x},{height})"),
        (100, center_y - 20, f"(0,{center_y})"),
        (width - 200, center_y - 20, f"({width},{center_y})"),
    ]
    
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except:
        font = ImageFont.load_default()
    
    for x, y, text in ref_points:
        draw.text((x, y), text, fill='#8888aa', font=font)
    
    img.save(output_path, 'PNG')
    print(f"Generated grid image: {output_path} ({width}x{height})")
    
    # Also save marker coordinates for reference
    markers = {
        'corners': {
            'TL': (marker_size, marker_size),
            'TR': (width - marker_size, marker_size),
            'BL': (marker_size, height - marker_size),
            'BR': (width - marker_size, height - marker_size),
        },
        'edges': {
            'T': (center_x, marker_size),
            'B': (center_x, height - marker_size),
            'L': (marker_size, center_y),
            'R': (width - marker_size, center_y),
        },
        'quarters': {
            'Q1': (width // 4, height // 4),
            'Q2': (3 * width // 4, height // 4),
            'Q3': (width // 4, 3 * height // 4),
            'Q4': (3 * width // 4, 3 * height // 4),
        },
        'center': (center_x, center_y),
    }
    
    import json
    with open(output_path.replace('.png', '_markers.json'), 'w') as f:
        json.dump(markers, f, indent=2)
    print(f"Saved marker coordinates: {output_path.replace('.png', '_markers.json')}")

if __name__ == '__main__':
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, 'grid_3840x2160.png')
    generate_grid_image(output_path)