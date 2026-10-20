import React from 'react';
import { Card, Button, SectionHeader, ProgressBar, Chip } from '../components';
import { useExport } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

const FORMATS = ['16:9', '9:16', '1:1', '4:5'];

export function ExportSection({ config, timeline, narration, exportOptions, onExport, onOpenFolder }) {
  const exportHook = useExport();

  const handleExport = async () => {
    if (timeline.length === 0) return;
    if (!narration.narration) return;
    if (timeline.some(s => !s.image)) return;
    if (config.outputs.length === 0) return;

    const scenes = timeline.map(s => ({
      number: s.number,
      duration: s.duration,
      text: s.text || '',
      words: s.words,
      zoom: s.zoom,
      transition: s.transition,
    }));

    const images = timeline.map(s => s.image).filter(Boolean);

    const success = await exportHook.exportVideo({
      scenes,
      images,
      narration: narration.narration,
      music: null,
      outputPath: '', // Will be prompted
      audioDuration: narration.duration,
      outputIds: config.outputs,
      config,
      renderOptions: exportOptions,
      useHardwareAcceleration: false,
    });

    if (success) {
      onExport?.();
    }
  };

  const handleGenerateFull = async () => {
    // Generate full video pipeline
  };

  return (
    <section id="export-section" style={{ marginBottom: '32px' }}>
      <SectionHeader title="Exportar" subtitle={exportHook.status.message} />
      <Card>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: font.sm, fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>
            Formatos de salida
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {FORMATS.map(format => (
              <Chip
                key={format}
                id={`output-chip-${format}`}
                active={config.outputs.includes(format)}
                aria-pressed={config.outputs.includes(format)}
                onClick={() => {
                  const idx = config.outputs.indexOf(format);
                  if (idx >= 0) {
                    if (config.outputs.length === 1) return;
                    config.outputs.splice(idx, 1);
                  } else {
                    config.outputs.push(format);
                  }
                }}
              >
                {format} · {format === '16:9' ? '1920×1080' : format === '9:16' ? '1080×1920' : format === '1:1' ? '1080×1080' : '1080×1350'}
              </Chip>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <Button
            onClick={handleExport}
            disabled={exportHook.isRendering || timeline.length === 0 || !narration.narration || timeline.some(s => !s.image) || config.outputs.length === 0}
            className="btn-lg"
            id="export-btn"
            style={{
              backgroundColor: colors.accent,
              borderColor: colors.accent,
              boxShadow: '0 0 32px rgba(220,40,40,0.55)',
            }}
          >
            {exportHook.isRendering ? 'Exportando...' : 'Exportar video'}
          </Button>
          <Button variant="secondary" onClick={handleGenerateFull} className="btn-lg" id="generate-full-btn">
            Generar video completo
          </Button>
          <Button variant="secondary" onClick={onOpenFolder} disabled={!exportHook.outputFolder} className="btn-lg" id="open-output-folder-btn">
            Abrir carpeta
          </Button>
        </div>

        <p id="pipeline-status" className="export-status" style={{ marginBottom: '16px', fontFamily: 'Inter, sans-serif', fontSize: font.base, color: colors.textMuted }} hidden={!exportHook.pipelineStatus}>
          {exportHook.pipelineStatus}
        </p>

        <div id="export-progress" className="export-progress" style={{ marginBottom: '16px' }} hidden={exportHook.progress <= 0}>
          <div className="progress-bar">
            <div id="progress-fill" className="progress-fill" style={{ width: exportHook.progress + '%' }}></div>
          </div>
          <div className="progress-info">
            <span id="progress-text">{Math.round(exportHook.progress)}%</span>
            <span id="progress-time">0:00 / 0:00</span>
          </div>
        </div>

        <div id="export-status" className={`export-status ${exportHook.status.type}`} hidden={!exportHook.status.message}>
          {exportHook.status.message}
        </div>
      </Card>
    </section>
  );
}