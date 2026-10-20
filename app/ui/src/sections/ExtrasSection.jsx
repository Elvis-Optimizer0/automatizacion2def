import React from 'react';
import { Card, Button, Input, Select, SectionHeader } from '../components';
import { useConfig } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

export function ExtrasSection({ config, updateConfig }) {
  const s = config.subtitles;
  const e = config.extras;

  return (
    <section id="extras-section" style={{ marginBottom: '32px' }}>
      <SectionHeader title="Extras" subtitle="Subtítulos, franja inferior, badge y barra de progreso" />
      <Card>
        <fieldset className="export-fieldset" style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: `1px solid ${colors.border}` }}>
          <legend style={{ fontFamily: 'Inter, sans-serif', fontSize: font.lg, fontWeight: 600, color: colors.text, marginBottom: '16px' }}>Subtítulos</legend>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
            <input
              id="subtitles-enabled"
              type="checkbox"
              checked={s.enabled}
              onChange={(evt) => updateConfig('subtitles.enabled', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Activar subtítulos automáticos
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="export-control-row">
              <label htmlFor="subtitle-font">Tipografía</label>
              <Select
                id="subtitle-font"
                value={s.fontFamily}
                onChange={(evt) => updateConfig('subtitles.fontFamily', evt.target.value)}
              >
                <option value="Roboto">Roboto</option>
                <option value="Inter">Inter</option>
                <option value="Open Sans">Open Sans</option>
                <option value="Montserrat">Montserrat</option>
                <option value="Playfair Display">Playfair Display</option>
                <option value="Oswald">Oswald</option>
              </Select>
            </div>
            <Button id="import-font-btn" variant="secondary" className="btn-sm" onClick={() => {}}>
              Importar tipografía
            </Button>
            <div className="export-control-row">
              <label htmlFor="subtitle-size-h">Tamaño horizontal (px)</label>
              <Input
                id="subtitle-size-h"
                type="number"
                min="8"
                max="400"
                step="1"
                value={s.fontSizeH}
                onChange={(evt) => updateConfig('subtitles.fontSizeH', parseInt(evt.target.value, 10) || 48)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-size-v">Tamaño vertical (px)</label>
              <Input
                id="subtitle-size-v"
                type="number"
                min="8"
                max="400"
                step="1"
                value={s.fontSizeV}
                onChange={(evt) => updateConfig('subtitles.fontSizeV', parseInt(evt.target.value, 10) || 64)}
              />
            </div>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                id="subtitle-bold"
                type="checkbox"
                checked={s.bold}
                onChange={(evt) => updateConfig('subtitles.bold', evt.target.checked)}
              />
              <span className="checkmark"></span>
              Negrita
            </label>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                id="subtitle-italic"
                type="checkbox"
                checked={s.italic}
                onChange={(evt) => updateConfig('subtitles.italic', evt.target.checked)}
              />
              <span className="checkmark"></span>
              Cursiva
            </label>
            <div className="export-control-row">
              <label htmlFor="subtitle-letter-spacing">Espaciado de letras</label>
              <Input
                id="subtitle-letter-spacing"
                type="number"
                min="-20"
                max="50"
                step="1"
                value={s.letterSpacing}
                onChange={(evt) => updateConfig('subtitles.letterSpacing', parseFloat(evt.target.value) || 0)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-text-color">Color del texto</label>
              <Input
                id="subtitle-text-color"
                type="color"
                value={s.textColor}
                onChange={(evt) => updateConfig('subtitles.textColor', evt.target.value)}
                style={{ height: '44px', padding: '4px' }}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-outline-width">Contorno</label>
              <Input
                id="subtitle-outline-width"
                type="number"
                min="0"
                max="10"
                step="1"
                value={s.outlineWidth}
                onChange={(evt) => updateConfig('subtitles.outlineWidth', parseFloat(evt.target.value) || 0)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-outline-color">Color del contorno</label>
              <Input
                id="subtitle-outline-color"
                type="color"
                value={s.outlineColor}
                onChange={(evt) => updateConfig('subtitles.outlineColor', evt.target.value)}
                style={{ height: '44px', padding: '4px' }}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-alignment">Alineación</label>
              <Select
                id="subtitle-alignment"
                value={String(s.alignment)}
                onChange={(evt) => updateConfig('subtitles.alignment', parseInt(evt.target.value, 10) || 2)}
              >
                <option value="1">Abajo izquierda</option>
                <option value="2">Abajo centro</option>
                <option value="3">Abajo derecha</option>
                <option value="4">Medio izquierda</option>
                <option value="5">Centro</option>
                <option value="6">Medio derecha</option>
                <option value="7">Arriba izquierda</option>
                <option value="8">Arriba centro</option>
                <option value="9">Arriba derecha</option>
              </Select>
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-margin-h">Margen lateral</label>
              <Input
                id="subtitle-margin-h"
                type="number"
                min="0"
                max="1000"
                step="1"
                value={s.marginH}
                onChange={(evt) => updateConfig('subtitles.marginH', parseInt(evt.target.value, 10) || 40)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-margin-v">Margen vertical</label>
              <Input
                id="subtitle-margin-v"
                type="number"
                min="0"
                max="1000"
                step="1"
                value={s.marginV}
                onChange={(evt) => updateConfig('subtitles.marginV', parseInt(evt.target.value, 10) || 85)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="subtitle-delay">Retraso de subtítulos (s)</label>
              <Input
                id="subtitle-delay"
                type="number"
                min="-2"
                max="5"
                step="0.1"
                value={s.delay}
                onChange={(evt) => updateConfig('subtitles.delay', parseFloat(evt.target.value) || 0)}
              />
            </div>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                id="subtitles-voice-detect"
                type="checkbox"
                checked={s.autoVoiceStart}
                onChange={(evt) => updateConfig('subtitles.autoVoiceStart', evt.target.checked)}
              />
              <span className="checkmark"></span>
              Detectar inicio de voz
            </label>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                id="subtitles-word-highlight"
                type="checkbox"
                checked={s.wordHighlight}
                onChange={(evt) => updateConfig('subtitles.wordHighlight', evt.target.checked)}
              />
              <span className="checkmark"></span>
              Subtítulos por palabra (tiempos de Whisper)
            </label>
          </div>

          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', cursor: 'pointer' }}>
            <input
              id="subtitles-background-enabled"
              type="checkbox"
              checked={s.background?.enabled}
              onChange={(evt) => updateConfig('subtitles.background.enabled', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Fondo de texto
          </label>
          <div className="export-control-row" hidden={!s.background?.enabled}>
            <label htmlFor="subtitles-background-color">Color del fondo</label>
            <Input
              id="subtitles-background-color"
              type="color"
              value={s.background?.color || '#000000'}
              onChange={(evt) => updateConfig('subtitles.background.color', evt.target.value)}
              style={{ height: '44px', padding: '4px' }}
            />
          </div>
          <div className="export-control-row" hidden={!s.background?.enabled}>
            <label htmlFor="subtitles-background-opacity">Opacidad del fondo</label>
            <Input
              id="subtitles-background-opacity"
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={s.background?.opacity || 0.5}
              onChange={(evt) => updateConfig('subtitles.background.opacity', parseFloat(evt.target.value) || 0.5)}
            />
          </div>

          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', cursor: 'pointer' }}>
            <input
              id="subtitles-shadow-enabled"
              type="checkbox"
              checked={s.shadow?.enabled}
              onChange={(evt) => updateConfig('subtitles.shadow.enabled', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Sombra
          </label>
          <div className="export-control-row" hidden={!s.shadow?.enabled}>
            <label htmlFor="subtitles-shadow-color">Color de la sombra</label>
            <Input
              id="subtitles-shadow-color"
              type="color"
              value={s.shadow?.color || '#000000'}
              onChange={(evt) => updateConfig('subtitles.shadow.color', evt.target.value)}
              style={{ height: '44px', padding: '4px' }}
            />
          </div>
          <div className="export-control-row" hidden={!s.shadow?.enabled}>
            <label htmlFor="subtitles-shadow-opacity">Opacidad de la sombra</label>
            <Input
              id="subtitles-shadow-opacity"
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={s.shadow?.opacity || 0.7}
              onChange={(evt) => updateConfig('subtitles.shadow.opacity', parseFloat(evt.target.value) || 0.7)}
            />
          </div>
          <div className="export-control-row" hidden={!s.shadow?.enabled}>
            <label htmlFor="subtitles-shadow-distance">Distancia de la sombra</label>
            <Input
              id="subtitles-shadow-distance"
              type="number"
              min="0"
              max="100"
              step="1"
              value={s.shadow?.distance || 3}
              onChange={(evt) => updateConfig('subtitles.shadow.distance', parseInt(evt.target.value, 10) || 3)}
            />
          </div>
          <div className="export-control-row" hidden={!s.shadow?.enabled}>
            <label htmlFor="subtitles-shadow-angle">Ángulo de la sombra</label>
            <Input
              id="subtitles-shadow-angle"
              type="number"
              min="0"
              max="360"
              step="1"
              value={s.shadow?.angle || 45}
              onChange={(evt) => updateConfig('subtitles.shadow.angle', parseInt(evt.target.value, 10) || 45)}
            />
          </div>
          <div className="export-control-row" hidden={!s.shadow?.enabled}>
            <label htmlFor="subtitles-shadow-blur">Desenfoque de la sombra</label>
            <Input
              id="subtitles-shadow-blur"
              type="number"
              min="0"
              max="100"
              step="1"
              value={s.shadow?.blur || 4}
              onChange={(evt) => updateConfig('subtitles.shadow.blur', parseInt(evt.target.value, 10) || 4)}
            />
          </div>

          <div className="export-control-row" style={{ marginTop: '16px' }}>
            <label htmlFor="subtitle-animation">Animación de entrada</label>
            <Select
              id="subtitle-animation"
              value={s.animation}
              onChange={(evt) => updateConfig('subtitles.animation', evt.target.value)}
            >
              <option value="none">Sin animación</option>
              <option value="fade">Aparecer</option>
              <option value="pop">Pop</option>
            </Select>
          </div>

          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', cursor: 'pointer' }}>
            <input
              id="subtitles-highlight-enabled"
              type="checkbox"
              checked={s.highlight?.enabled}
              onChange={(evt) => updateConfig('subtitles.highlight.enabled', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Resaltar palabras clave
          </label>
          <div className="export-control-row" hidden={!s.highlight?.enabled}>
            <label htmlFor="subtitle-terms-input">Términos financieros</label>
            <Input
              id="subtitle-terms-input"
              value={(s.highlight?.terms || []).join(', ')}
              onChange={(evt) => updateConfig('subtitles.highlight.terms', evt.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder="deuda, interés, sueldo"
            />
          </div>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} hidden={!s.highlight?.enabled}>
            <input
              id="subtitles-detect-numbers"
              type="checkbox"
              checked={s.highlight?.detect?.numbers}
              onChange={(evt) => updateConfig('subtitles.highlight.detect.numbers', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Detectar cifras
          </label>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} hidden={!s.highlight?.enabled}>
            <input
              id="subtitles-detect-percent"
              type="checkbox"
              checked={s.highlight?.detect?.percent}
              onChange={(evt) => updateConfig('subtitles.highlight.detect.percent', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Detectar porcentajes
          </label>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} hidden={!s.highlight?.enabled}>
            <input
              id="subtitles-detect-currency"
              type="checkbox"
              checked={s.highlight?.detect?.currency}
              onChange={(evt) => updateConfig('subtitles.highlight.detect.currency', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Detectar montos en dólares
          </label>
          <div className="export-control-row" hidden={!s.highlight?.enabled}>
            <label htmlFor="subtitle-terms-limit">Máximo de propuestas</label>
            <Input
              id="subtitle-terms-limit"
              type="number"
              min="1"
              max="200"
              step="1"
              value={s.highlight?.limit || 30}
              onChange={(evt) => updateConfig('subtitles.highlight.limit', parseInt(evt.target.value, 10) || 30)}
            />
          </div>
          <Button id="detect-keywords-btn" variant="secondary" className="btn-sm" onClick={() => {}} style={{ marginTop: '8px' }}>
            Detectar palabras clave
          </Button>
          <Button id="subtitles-select-suggested-btn" variant="secondary" className="btn-sm" onClick={() => {}} style={{ marginTop: '8px', marginLeft: '8px' }}>
            Seleccionar sugeridas (top N)
          </Button>
          <div className="export-control-row" style={{ marginTop: '16px' }}>
            <label htmlFor="keywords-color">Color para resaltar</label>
            <Input
              id="keywords-color"
              type="color"
              value={s.highlight?.colors ? Object.values(s.highlight.colors)[0] : '#ff0000'}
              onChange={(evt) => {
                const term = Object.keys(s.highlight?.colors || {})[0];
                if (term) updateConfig('subtitles.highlight.colors.' + term, evt.target.value);
              }}
              style={{ height: '44px', padding: '4px' }}
            />
          </div>
          <Button id="keywords-apply-color-btn" variant="secondary" className="btn-sm" onClick={() => {}} style={{ marginTop: '8px' }}>
            Resaltar todas con este color
          </Button>
          <div className="export-control-row" style={{ marginTop: '16px' }}>
            <label htmlFor="subtitle-term-search">Buscar y añadir palabra del guion</label>
            <Input
              id="subtitle-term-search"
              type="text"
              placeholder="presupuesto"
              onChange={() => {}}
            />
          </div>
          <Button id="subtitle-term-add-btn" variant="secondary" className="btn-sm" onClick={() => {}} style={{ marginTop: '8px' }}>
            Añadir palabra
          </Button>
          <div id="keywords-list" className="keywords-list" aria-live="polite" style={{ marginTop: '16px' }}></div>
        </fieldset>

        <fieldset className="export-fieldset" style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: `1px solid ${colors.border}` }}>
          <legend style={{ fontFamily: 'Inter, sans-serif', fontSize: font.lg, fontWeight: 600, color: colors.text, marginBottom: '16px' }}>Insignia</legend>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
            <input
              id="badge-enabled"
              type="checkbox"
              checked={e.badge.enabled}
              onChange={(evt) => updateConfig('extras.badge.enabled', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Insignia
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }} hidden={!e.badge.enabled}>
            <div className="export-control-row">
              <label htmlFor="badge-text">Texto</label>
              <Input
                id="badge-text"
                value={e.badge.text}
                onChange={(evt) => updateConfig('extras.badge.text', evt.target.value)}
                placeholder="OFERTA"
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="badge-position">Posición</label>
              <Select
                id="badge-position"
                value={e.badge.position}
                onChange={(evt) => updateConfig('extras.badge.position', evt.target.value)}
              >
                <option value="topLeft">Arriba izquierda</option>
                <option value="topRight">Arriba derecha</option>
                <option value="bottomLeft">Abajo izquierda</option>
                <option value="bottomRight">Abajo derecha</option>
              </Select>
            </div>
            <div className="export-control-row">
              <label htmlFor="badge-animation">Animación</label>
              <Select
                id="badge-animation"
                value={e.badge.animation}
                onChange={(evt) => updateConfig('extras.badge.animation', evt.target.value)}
              >
                <option value="none">Sin animación</option>
                <option value="fade">Aparecer</option>
                <option value="pulse">Pulso</option>
                <option value="slide">Deslizar</option>
                <option value="pop">Pop</option>
              </Select>
            </div>
          </div>
        </fieldset>

        <fieldset className="export-fieldset" style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: `1px solid ${colors.border}` }}>
          <legend style={{ fontFamily: 'Inter, sans-serif', fontSize: font.lg, fontWeight: 600, color: colors.text, marginBottom: '16px' }}>Tercio inferior</legend>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
            <input
              id="lower-third-enabled"
              type="checkbox"
              checked={e.lowerThird.enabled}
              onChange={(evt) => updateConfig('extras.lowerThird.enabled', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Tercio inferior
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }} hidden={!e.lowerThird.enabled}>
            <div className="export-control-row">
              <label htmlFor="lower-third-text">Texto</label>
              <Input
                id="lower-third-text"
                value={e.lowerThird.text}
                onChange={(evt) => updateConfig('extras.lowerThird.text', evt.target.value)}
                placeholder="Nombre / cargo"
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="lower-third-opacity">Opacidad</label>
              <Input
                id="lower-third-opacity"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={e.lowerThird.opacity}
                onChange={(evt) => updateConfig('extras.lowerThird.opacity', parseFloat(evt.target.value) || 0.6)}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="export-fieldset">
          <legend style={{ fontFamily: 'Inter, sans-serif', fontSize: font.lg, fontWeight: 600, color: colors.text, marginBottom: '16px' }}>Barra de progreso</legend>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer' }}>
            <input
              id="progress-bar-enabled"
              type="checkbox"
              checked={e.progressBar.enabled}
              onChange={(evt) => updateConfig('extras.progressBar.enabled', evt.target.checked)}
            />
            <span className="checkmark"></span>
            Barra de progreso
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }} hidden={!e.progressBar.enabled}>
            <div className="export-control-row">
              <label htmlFor="progress-bar-color">Color</label>
              <Input
                id="progress-bar-color"
                type="color"
                value={e.progressBar.color}
                onChange={(evt) => updateConfig('extras.progressBar.color', evt.target.value)}
                style={{ height: '44px', padding: '4px' }}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="progress-bar-height">Altura (px)</label>
              <Input
                id="progress-bar-height"
                type="number"
                min="1"
                max="200"
                step="1"
                value={e.progressBar.height}
                onChange={(evt) => updateConfig('extras.progressBar.height', parseInt(evt.target.value, 10) || 8)}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="export-fieldset" style={{ marginBottom: '24px' }}>
          <legend style={{ fontFamily: 'Inter, sans-serif', fontSize: font.lg, fontWeight: 600, color: colors.text, marginBottom: '16px' }}>Vista previa de subtítulos</legend>
          <div id="subtitle-preview" className="subtitle-preview" aria-label="Vista previa de subtítulos" style={{ position: 'relative', padding: '20px', backgroundColor: colors.surface1, borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
            <span id="subtitle-preview-text" className="subtitle-preview-text" style={{ fontFamily: '"Roboto", sans-serif', fontSize: '24px', fontWeight: 700, color: '#ffffff', textShadow: '2px 2px 4px #000000' }}>
              La deuda sube 30% y el interés afecta tu sueldo
            </span>
          </div>
          <div className="export-control-row" style={{ marginTop: '16px' }}>
            <label htmlFor="preview-scene-select">Escena de la vista previa</label>
            <Select
              id="preview-scene-select"
              value=""
              onChange={() => {}}
            >
              <option value="">Sin escenas</option>
            </Select>
          </div>
          <Button id="preview-btn" variant="secondary" className="btn-sm" onClick={() => {}} style={{ marginTop: '8px' }}>
            Vista previa (5 s)
          </Button>
          <video id="preview-video" className="preview-video" controls hidden style={{ marginTop: '16px', maxWidth: '100%' }}></video>
          <p className="subtitle-notice" style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, color: colors.textMuted, marginTop: '8px' }}>
            La vista previa es aproximada (640 px de ancho) y usa la escena elegida; el video final es el que manda.
          </p>
        </fieldset>
      </Card>
    </section>
  );
}