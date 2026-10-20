import React from 'react';
import { Card, Button, Input, Select, Chip, SectionHeader } from '../components';
import { useConfig, useExportOptions } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

const FORMATS = ['16:9', '9:16', '1:1', '4:5'];
const FORMAT_IDS = ['16x9', '9x16', '1x1', '4x5'];
const FIT_MODES = ['cover', 'contain', 'stretch'];
const ZOOM_TYPES = ['none', 'kenburns', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'alternate', 'random'];
const ZOOM_MODES = ['fixed', 'alternate', 'random'];
const TRANSITION_TYPES = ['cut', 'fade', 'fadeblack', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'curtainLeft', 'curtainRight', 'circle'];
const TRANSITION_MODES = ['fixed', 'alternate', 'random'];

export function ConfigSection({ config, updateConfig, exportOptions, updateOption, toggleOutput }) {
  return (
    <section id="config-section" style={{ marginBottom: '32px' }}>
      <SectionHeader title="Configuración" subtitle="Formatos, zoom, transiciones y modos de ajuste" />
      <Card>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>
            Formatos de salida
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
{FORMATS.map((format, index) => (
               <Chip
                 key={format}
                 id={`output-chip-${FORMAT_IDS[index]}`}
                 active={config.outputs.includes(format)}
                 aria-pressed={config.outputs.includes(format)}
                 onClick={() => toggleOutput(format)}
               >
                 {format}
               </Chip>
             ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="export-control-row">
            <label htmlFor="fit-mode">Modo de ajuste</label>
            <Select
              id="fit-mode"
              value={config.fitMode}
              onChange={(e) => updateConfig('fitMode', e.target.value)}
            >
              {FIT_MODES.map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </Select>
          </div>

          <div className="export-control-row">
            <label htmlFor="frame-color">Color de bandas</label>
            <Input
              id="frame-color"
              type="color"
              value={config.frameColor}
              onChange={(e) => updateConfig('frameColor', e.target.value)}
              style={{ height: '44px', padding: '4px' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>
            Zoom y Ken Burns
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="export-control-row">
              <label>Zoom activado</label>
              <label className="checkbox-label">
                <input
                  id="zoom-enabled-checkbox"
                  type="checkbox"
                  checked={exportOptions.zoomEnabled}
                  onChange={(e) => updateOption('zoomEnabled', e.target.checked)}
                />
                <span className="checkmark"></span>
                Activado
              </label>
            </div>
            <div className="export-control-row">
              <label htmlFor="zoom-type">Tipo de zoom</label>
              <Select
                id="zoom-type"
                value={exportOptions.zoomType}
                onChange={(e) => updateOption('zoomType', e.target.value)}
              >
                {ZOOM_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </div>
            <div className="export-control-row">
              <label htmlFor="zoom-mode">Modo de zoom</label>
              <Select
                id="zoom-mode"
                value={exportOptions.zoomMode}
                onChange={(e) => updateOption('zoomMode', e.target.value)}
              >
                {ZOOM_MODES.map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </Select>
            </div>
            <div className="export-control-row">
              <label htmlFor="zoom-start-scale">Escala inicial</label>
              <Input
                id="zoom-start-scale"
                type="number"
                min="1.0"
                max="2.0"
                step="0.05"
                value={exportOptions.zoomStartScale || 1.0}
                onChange={(e) => updateOption('zoomStartScale', parseFloat(e.target.value) || 1.0)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="zoom-intensity">Intensidad</label>
              <Input
                id="zoom-intensity"
                type="range"
                min="0"
                max="100"
                value={Math.round(exportOptions.zoomIntensity * 100)}
                onChange={(e) => updateOption('zoomIntensity', parseInt(e.target.value, 10) / 100)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="zoom-seed">Semilla</label>
              <Input
                id="zoom-seed"
                type="number"
                min="0"
                max="999999"
                value={exportOptions.zoomSeed}
                onChange={(e) => updateOption('zoomSeed', parseInt(e.target.value, 10) || 12345)}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>
            Transiciones
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="export-control-row">
              <label htmlFor="transition-type">Tipo</label>
              <Select
                id="transition-type"
                value={exportOptions.transitionType}
                onChange={(e) => updateOption('transitionType', e.target.value)}
              >
                {TRANSITION_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </div>
            <div className="export-control-row">
              <label htmlFor="transition-mode">Modo</label>
              <Select
                id="transition-mode"
                value={exportOptions.transitionMode}
                onChange={(e) => updateOption('transitionMode', e.target.value)}
              >
                {TRANSITION_MODES.map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </Select>
            </div>
            <div className="export-control-row">
              <label htmlFor="transition-duration">Duración (s)</label>
              <Input
                id="transition-duration"
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={exportOptions.transitionDuration}
                onChange={(e) => updateOption('transitionDuration', parseFloat(e.target.value) || 1.0)}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="transition-seed">Semilla</label>
              <Input
                id="transition-seed"
                type="number"
                min="0"
                max="999999"
                value={exportOptions.transitionSeed}
                onChange={(e) => updateOption('transitionSeed', parseInt(e.target.value, 10) || 4242)}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>
            Fondo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="export-control-row">
              <label htmlFor="background-mode">Modo</label>
              <Select
                id="background-mode"
                value={config.backgroundMode}
                onChange={(e) => updateConfig('backgroundMode', e.target.value)}
              >
                <option value="color">Color sólido</option>
                <option value="blur">Desenfoque (blur)</option>
              </Select>
            </div>
            <div className="export-control-row">
              <label htmlFor="background-color">Color</label>
              <Input
                id="background-color"
                type="color"
                value={config.backgroundColor}
                onChange={(e) => updateConfig('backgroundColor', e.target.value)}
                style={{ height: '44px', padding: '4px' }}
              />
            </div>
            <div className="export-control-row">
              <label htmlFor="music-volume">Volumen música</label>
              <Input
                id="music-volume"
                type="range"
                min="0"
                max="100"
                value={Math.round(config.musicVolume * 100)}
                onChange={(e) => updateConfig('musicVolume', parseInt(e.target.value, 10) / 100)}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>
            Rendimiento
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="export-control-row">
              <label className="checkbox-label">
                <input
                  id="hwaccel-checkbox"
                  type="checkbox"
                  checked={config.hwAccel?.enabled ?? true}
                  onChange={(e) => updateConfig('hwAccel.enabled', e.target.checked)}
                />
                <span className="checkmark"></span>
                Aceleración por hardware (AMD AMF)
              </label>
            </div>
            <p id="hwaccel-info" className="subtitle-notice" style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, color: colors.textMuted }}>Detectando codificadores…</p>
            <div className="export-control-row">
              <label className="checkbox-label">
                <input
                  id="directml-checkbox"
                  type="checkbox"
                  checked={config.capabilities?.directmlRequested ?? true}
                  onChange={(e) => {
                    if (config.capabilities) config.capabilities.directmlRequested = e.target.checked;
                  }}
                />
                <span className="checkmark"></span>
                Probar DirectML para la voz (con respaldo a CPU)
              </label>
            </div>
            <div className="export-control-row">
              <Button id="gpu-probe-btn" variant="secondary" className="btn-sm" onClick={() => {}}>
                Detectar aceleración
              </Button>
            </div>
            <p id="gpu-info" className="subtitle-notice" style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, color: colors.textMuted }}>Detectando GPU.</p>
          </div>
        </div>
      </Card>
    </section>
  );
}