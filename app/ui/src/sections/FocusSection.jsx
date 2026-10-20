import React, { useEffect, useRef } from 'react';
import { Card, Button, Input, Select, SectionHeader } from '../components';
import { useFocus, useConfig, useImages } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

const FORMATS = ['16:9', '9:16', '1:1', '4:5'];

export function FocusSection({ images, config, focus, setFocus }) {
  const editorRef = useRef(null);
  const imgRef = useRef(null);
  const bgRef = useRef(null);
  const boxRef = useRef(null);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const updateFocusBoxPreview = () => {
    const img = imgRef.current;
    const editor = editorRef.current;
    const box = boxRef.current;
    const readout = document.getElementById('focus-readout');
    const scaleReadout = document.getElementById('focus-scale-readout');
    const scaleInput = document.getElementById('focus-scale');
    const { images: imgs, focus: fcs, config: cfg } = { images, focus, config };

    if (!img || !editor || !box) return;
    if (imgs.length === 0 || !img.naturalWidth) {
      box.style.display = 'none';
      return;
    }
    const image = imgs[fcs.imageIndex];
    const dims = { w: 1920, h: 1080 }[fcs.format] || { w: 1920, h: 1080 };
    const targetAspect = dims.w / dims.h;
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const coverW = imageAspect > targetAspect ? (img.naturalHeight * targetAspect) / img.naturalWidth : 1;
    const coverH = imageAspect > targetAspect ? 1 : (img.naturalWidth / targetAspect) / img.naturalHeight;
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[fcs.format];
    const focusData = image[focusKey] || { x: 0.5, y: 0.5, scale: 1.0 };
    const scale = Math.max(0.3, Math.min(3.0, focusData.scale || 1.0));
    const fx = Math.max(0, Math.min(1, focusData.x || 0.5));
    const fy = Math.max(0, Math.min(1, focusData.y || 0.5));
    const frameW = coverW / scale;
    const frameH = coverH / scale;
    const boxLeft = (1 - frameW) * fx;
    const boxTop = (1 - frameH) * fy;

    const rect = editor.getBoundingClientRect();
    const fw = rect.width || 640;
    const fh = rect.height || 360;

    img.style.width = (fw / frameW) + 'px';
    img.style.height = (fh / frameH) + 'px';
    img.style.left = ((-boxLeft / frameW) * fw) + 'px';
    img.style.top = ((-boxTop / frameH) * fh) + 'px';

    box.style.display = 'block';
    box.style.left = (boxLeft * fw) + 'px';
    box.style.top = (boxTop * fh) + 'px';
    box.style.width = (frameW * fw) + 'px';
    box.style.height = (frameH * fh) + 'px';
    box.style.border = '2px solid var(--color-accent)';
    box.style.borderRadius = 'var(--radius-sm)';
    box.style.pointerEvents = 'none';
    box.style.boxShadow = '0 0 20px var(--color-accent)';

    if (readout) readout.textContent = fx.toFixed(2) + ', ' + fy.toFixed(2) + ' \u00d7' + scale.toFixed(2);
    if (scaleReadout) scaleReadout.textContent = scale.toFixed(2);
    if (scaleInput) scaleInput.value = String(scale);
  };

  const handleFocusPointer = (e) => {
    if (images.length === 0) return;
    const editor = editorRef.current;
    const img = imgRef.current;
    if (!editor || !img || !img.naturalWidth) return;

    const rect = editor.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const gx = (e.clientX - rect.left) / rect.width;
    const gy = (e.clientY - rect.top) / rect.height;
    if (isNaN(gx) || isNaN(gy)) return;

    const image = images[focus.imageIndex];
    const dims = { w: 1920, h: 1080 }[focus.format] || { w: 1920, h: 1080 };
    const targetAspect = dims.w / dims.h;
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const coverW = imageAspect > targetAspect ? (img.naturalHeight * targetAspect) / img.naturalWidth : 1;
    const coverH = imageAspect > targetAspect ? 1 : (img.naturalWidth / targetAspect) / img.naturalHeight;
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
    const focusData = image[focusKey] || { x: 0.5, y: 0.5, scale: 1.0 };
    const scale = Math.max(0.3, Math.min(3.0, focusData.scale || 1.0));
    const fx = Math.max(0, Math.min(1, focusData.x || 0.5));
    const fy = Math.max(0, Math.min(1, focusData.y || 0.5));
    const frameW = coverW / scale;
    const frameH = coverH / scale;
    const boxLeft = (1 - frameW) * fx;
    const boxTop = (1 - frameH) * fy;
    const u = boxLeft + gx * frameW;
    const v = boxTop + gy * frameH;

    const newFocus = { x: Math.max(0, Math.min(1, u)), y: Math.max(0, Math.min(1, v)), scale: focusData.scale };
    image[focusKey] = newFocus;
    setFocus({ ...focus, ...newFocus });
    updateFocusBoxPreview();
  };

  const handleWheel = (e) => {
    if (images.length === 0) return;
    e.preventDefault();
    const image = images[focus.imageIndex];
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
    const focusData = image[focusKey] || { x: 0.5, y: 0.5, scale: 1.0 };
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.3, Math.min(3.0, focusData.scale + delta));
    image[focusKey] = { ...focusData, scale: newScale };
    setFocus({ ...focus, scale: newScale });
    updateFocusBoxPreview();
  };

  useEffect(() => {
    updateFocusBoxPreview();
  }, [focus.imageIndex, focus.format, images]);

  const handleScaleChange = (e) => {
    const value = parseFloat(e.target.value);
    if (isNaN(value)) return;
    const image = images[focus.imageIndex];
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
    const focusData = image[focusKey] || { x: 0.5, y: 0.5, scale: 1.0 };
    image[focusKey] = { ...focusData, scale: Math.max(0.3, Math.min(3.0, value)) };
    setFocus({ ...focus, scale: Math.max(0.3, Math.min(3.0, value)) });
    updateFocusBoxPreview();
  };

  const applyAutoScale = () => {
    if (images.length === 0) return;
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const image = images[focus.imageIndex];
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
    const dims = { w: 1920, h: 1080 }[focus.format] || { w: 1920, h: 1080 };
    const targetAspect = dims.w / dims.h;
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const coverW = imageAspect > targetAspect ? (img.naturalHeight * targetAspect) / img.naturalWidth : 1;
    const coverH = imageAspect > targetAspect ? 1 : (img.naturalWidth / targetAspect) / img.naturalHeight;
    const autoScale = Math.max(0.3, Math.min(3.0, Math.min(coverW, coverH)));
    const focusData = image[focusKey] || { x: 0.5, y: 0.5, scale: 1.0 };
    image[focusKey] = { ...focusData, scale: autoScale };
    setFocus({ ...focus, scale: autoScale });
    updateFocusBoxPreview();
  };

  const resetFocus = () => {
    if (images.length === 0) return;
    const image = images[focus.imageIndex];
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
    image[focusKey] = { x: 0.5, y: 0.5, scale: 1.0 };
    setFocus({ ...focus, x: 0.5, y: 0.5, scale: 1.0 });
    updateFocusBoxPreview();
  };

  const applyFocusToAll = () => {
    if (images.length === 0) return;
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
    const source = images[focus.imageIndex][focusKey] || { x: 0.5, y: 0.5, scale: 1.0 };
    images.forEach(image => {
      image[focusKey] = { ...source };
    });
    updateFocusBoxPreview();
  };

  const disabled = images.length === 0;

  return (
    <section id="focus-section" className="import-section" aria-label="Enfoque por formato" style={{ marginBottom: '32px' }}>
      <SectionHeader title="Enfoque por formato" />
      <Card>
        <div className="export-control-row">
          <label htmlFor="focus-image-select">Imagen</label>
          <Select
            id="focus-image-select"
            value={String(focus.imageIndex)}
            onChange={(e) => setFocus({ ...focus, imageIndex: parseInt(e.target.value, 10) || 0 })}
            disabled={disabled}
          >
            {images.map((image, index) => (
              <option key={index} value={String(index)}>{image.name}</option>
            ))}
          </Select>
        </div>
        <div className="export-control-row">
          <label htmlFor="focus-format-select">Formato</label>
          <Select
            id="focus-format-select"
            value={focus.format}
            onChange={(e) => setFocus({ ...focus, format: e.target.value })}
            disabled={disabled}
          >
            {FORMATS.map(format => (
              <option key={format} value={format}>{format}</option>
            ))}
          </Select>
        </div>
        <div className="export-control-row">
          <label htmlFor="focus-scale">Escala</label>
          <Input
            id="focus-scale"
            type="range"
            className="focus-scale"
            min="0.3"
            max="3"
            step="0.05"
            value={images[focus.imageIndex]?.[{ '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format]]?.scale || 1}
            onChange={handleScaleChange}
            disabled={disabled}
            aria-label="Escala del encuadre"
          />
          <span id="focus-scale-readout" className="focus-readout">
            {images[focus.imageIndex]?.[{ '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format]]?.scale?.toFixed(2) || '1.00'}
          </span>
        </div>
        <div id="focus-editor" className="focus-editor" role="application" aria-label="Editor de enfoque" tabIndex={0} ref={editorRef}
          onClick={handleFocusPointer}
          onWheel={handleWheel}
          style={{ 
            aspectRatio: ({ '16:9': '1920/1080', '9:16': '1080/1920', '1:1': '1/1', '4:5': '4/5' }[focus.format] || '1920/1080'),
            backgroundColor: config.backgroundMode === 'blur' ? '#000000' : config.backgroundColor,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            minHeight: '360px'
          }}>
          <img id="focus-bg" className="focus-bg" alt="" aria-hidden="true" draggable="false" ref={bgRef}
            style={{ 
              display: config.backgroundMode === 'blur' ? 'block' : 'none',
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              objectFit: 'cover', filter: 'blur(20px)', opacity: 0.5, zIndex: 0
            }} />
          <img id="focus-image" className="focus-image" alt="Imagen para enfocar" draggable="false" ref={imgRef}
            style={{ 
              position: 'absolute', top: 0, left: 0, 
              transformOrigin: '0 0', zIndex: 1
            }} />
          <div id="focus-box" className="focus-box" ref={boxRef}
            style={{ 
              display: 'none', position: 'absolute', pointerEvents: 'none', zIndex: 2 
            }}></div>
          <div id="focus-empty" className="focus-empty" style={{ 
            display: disabled ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', 
            height: '100%', color: colors.textMuted, fontFamily: 'Inter, sans-serif' 
          }}>
            Importa imágenes para ajustar el enfoque
          </div>
        </div>
        <div className="focus-actions" style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
          <Button onClick={applyFocusToAll} disabled={disabled} id="focus-apply-all-btn" variant="secondary">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Aplicar a todas</span>
          </Button>
          <Button onClick={applyAutoScale} disabled={disabled} id="focus-auto-btn" variant="secondary">
            Ajuste automático
          </Button>
          <Button onClick={resetFocus} disabled={disabled} id="focus-reset-btn" variant="secondary">
            Restablecer
          </Button>
          <span id="focus-readout" className="focus-readout" style={{ alignSelf: 'center', fontFamily: 'Inter, sans-serif', fontSize: font.sm, color: colors.textMuted }}>
            0.50, 0.50 · ×1.00
          </span>
        </div>
      </Card>
    </section>
  );
}