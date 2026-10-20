import React from 'react';
import { Card, DropZone, Badge, Button, SectionHeader, Input } from '../components';
import { useImages, useNarration, useMusic, useProject } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

export function ImportSection({ images, narration, music }) {
  const project = useProject();
  
  return (
    <>
      <section id="project-bar" className="project-bar" aria-label="Proyecto" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={project.saveProject} id="save-project-btn" variant="secondary">
            Guardar proyecto
          </Button>
          <Button onClick={project.openProject} id="open-project-btn" variant="secondary">
            Abrir proyecto
          </Button>
          <span id="project-status" className="project-status" style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, color: colors.textMuted }}>
            {project.status || ''}
          </span>
        </div>
      </section>

      <section id="import-section" className="import-section" aria-label="Imágenes" style={{ marginBottom: '32px' }}>
        <SectionHeader title="Imágenes" />
        <Card>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <Button onClick={images.importImages} disabled={images.loading} id="import-images-btn">
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span>Seleccionar imágenes</span>
            </Button>
            <Button onClick={images.clearImages} disabled={images.loading || images.images.length === 0} variant="secondary">
              Limpiar
            </Button>
          </div>
          <DropZone id="images-drop-zone" onDrop={images.handleDrop} accept="image/*" style={{ marginBottom: '24px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="1.5" style={{ marginBottom: '12px' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: font.base, color: colors.textMuted }}>
              Arrastra imágenes aquí
            </p>
          </DropZone>
          <div id="images-list" className="images-grid">
            {images.images.map((image, index) => (
              <div key={index} className="image-item" style={{ position: 'relative' }}>
                <img
                  src={image.preview}
                  alt={`Miniatura de ${image.name}`}
                  className="image-thumbnail"
                  loading="lazy"
                />
                <div className="image-info">
                  <div className="image-name" title={image.name}>
                    <span className="image-name-text">{image.name}</span>
                    <Badge style={{ marginLeft: '8px', verticalAlign: 'middle' }}>{index + 1}</Badge>
                  </div>
                  <div className="image-path" title={image.path}>{image.path}</div>
                </div>
                <button
                  onClick={() => images.removeImage(index)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.surface1,
                    color: colors.textMuted,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.target.style.backgroundColor = colors.accentDim; e.target.style.color = colors.accent; e.target.style.borderColor = colors.accent; }}
                  onMouseLeave={e => { e.target.style.backgroundColor = colors.surface1; e.target.style.color = colors.textMuted; e.target.style.borderColor = colors.border; }}
                  aria-label={`Eliminar ${image.name}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            ))}
          </div>
          {images.images.length === 0 && (
            <p style={{ textAlign: 'center', color: colors.textMuted, padding: '40px' }}>No hay imágenes importadas</p>
          )}
        </Card>
      </section>

      <section className="audio-section" aria-label="Audio" style={{ marginBottom: '32px' }}>
        <SectionHeader title="Audio" />
        <Card>
          <div className="audio-row">
            <div className="audio-field">
              <label htmlFor="audio-narration" className="audio-label">Narración (obligatorio)</label>
              <div className="audio-input-wrapper">
                <Input
                  id="audio-narration"
                  className="audio-input"
                  readOnly
                  placeholder="Ningún archivo seleccionado"
                  value={narration.narration ? narration.narration.path : ''}
                  aria-label="Ruta del archivo de narración"
                />
                <Button onClick={narration.importNarration} disabled={narration.loading} id="import-audio-btn" variant="secondary">
                  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>Generar voz</span>
                </Button>
              </div>
              <DropZone id="audio-narration-drop" onDrop={narration.handleDrop} accept="audio/*" role="region" aria-label="Zona de arrastrar y soltar narración" tabIndex={0}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Arrastra archivo de audio aquí</span>
              </DropZone>
              <div id="audio-narration-info" className="audio-info">
                {narration.narration && `${narration.narration.name} · ${formatTime(narration.duration)}`}
              </div>
            </div>

            <div className="audio-field">
              <label htmlFor="audio-music" className="audio-label">Música (opcional)</label>
              <div className="audio-input-wrapper">
                <Input
                  id="audio-music"
                  className="audio-input"
                  readOnly
                  placeholder="Ningún archivo seleccionado"
                  value={music.music ? music.music.path : ''}
                  aria-label="Ruta del archivo de música"
                />
                <Button onClick={music.importMusic} disabled={music.loading} id="import-music-btn" variant="secondary">
                  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>Seleccionar</span>
                </Button>
              </div>
              <DropZone id="audio-music-drop" onDrop={music.handleDrop} accept="audio/*" role="region" aria-label="Zona de arrastrar y soltar música" tabIndex={0}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Arrastra archivo de audio aquí</span>
              </DropZone>
              <div id="audio-music-info" className="audio-info">
                {music.music && music.music.name}
              </div>
            </div>
          </div>
        </Card>
      </section>
    </>
  );
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}