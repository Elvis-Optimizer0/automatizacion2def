import React, { useEffect } from 'react';
import { Card, Button, Textarea, SectionHeader } from '../components';
import { useScript, useTimeline } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

export function ScriptSection({ images, narration, script, timeline, adjustToAudio, setAdjustToAudio }) {
  // Sync with test hooks in test mode
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__TEST_SCRIPT_DATA__) {
      script.setScript(window.__TEST_SCRIPT_DATA__);
      window.__TEST_SCRIPT_DATA__ = null;
    }
  }, [script]);
  const assignedImages = script.scenes.filter(s => {
    const img = images.find(i => {
      const num = i.name.match(/(?:escena|scene)\s*[:_\-\s]?(\d+)/i);
      return num ? parseInt(num[1], 10) === s.number : false;
    });
    return !!img;
  }).length;

  return (
    <section id="script-section" className="import-section" aria-label="Guion" style={{ marginBottom: '32px' }}>
      <SectionHeader title="Guion" subtitle={`${script.scenes.length} escenas detectadas · ${assignedImages} imágenes asignadas`} />
      <Card>
        <div className="script-actions" style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <Button onClick={script.pasteFromClipboard} id="paste-script-btn">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Pegar del portapapeles</span>
          </Button>
          <Button onClick={script.loadFromFile} id="load-script-btn">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>Cargar .txt</span>
          </Button>
        </div>
        <Textarea
          id="script-textarea"
          className="script-editor"
          value={script.raw}
          onChange={(e) => script.loadScript(e.target.value)}
          placeholder="Escribe o pega tu guion aquí...\n\nEjemplo:\n[Escena 1] 0:00 - 2:50 Primera escena\n[Escena 2] 2:50 - 5:00 Segunda escena"
          rows={10}
        />
        <div id="script-warnings" style={{ marginTop: '12px' }} hidden={script.warnings.length === 0}>
          {script.warnings.map((w, i) => (
            <div key={i} className="warning-item" style={{ color: colors.warning }}>
              ⚠ {w}
            </div>
          ))}
        </div>
        <div id="script-summary" style={{ marginTop: '12px', fontFamily: 'Inter, sans-serif', fontSize: font.sm, color: colors.textMuted }}>
          {script.scenes.length} escenas detectadas · {assignedImages} imágenes asignadas
        </div>
      </Card>
    </section>
  );
}