import React, { useState } from 'react';
import { Card, Button, Input, Select, SectionHeader, ProgressBar } from '../components';
import { useVoice, useModels, useScript } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

export function VoiceSection({ narration, timeline, audioDuration, onNarrationGenerated, onSyncScenes }) {
  const voice = useVoice();
  const models = useModels();
  const script = useScript();
  const [showModels, setShowModels] = useState(false);
  const [voiceText, setVoiceText] = useState('');

  const cleanScriptForVoice = (scriptText) => {
    const sceneMarker = /^\s*(?:\[|\()?\s*(?:escena|scene|parte|part)\s*[:#]?\s*\d+\s*(?:\]|\))?/i;
    const timeRange = /\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/gi;
    const timeRangeWords = /(?:de|from)\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s+(?:a|to)\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/gi;
    const technical = /(?:voz en off|voice ?over|narrador|narrator|locutor|plano|toma|shot|b-?roll|texto en pantalla|música|musica|music|sfx|transition|transición)\s*[:#]\s*/gi;
    const timestampOnly = /^\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?\s*$/;
    const out = [];

    String(scriptText == null ? '' : scriptText).split(/\r?\n/).forEach((raw) => {
      let text = raw.trim();
      if (!text || timestampOnly.test(text)) return;
      text = text
        .replace(sceneMarker, ' ')
        .replace(timeRange, ' ')
        .replace(timeRangeWords, ' ')
        .replace(technical, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]{0,80}\)/g, ' ')
        .replace(/^[-–—•·*]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || timestampOnly.test(text)) return;
      out.push(text);
    });

    return out.join('\n');
  };

  const handleGenerateVoice = async () => {
    const result = await voice.generateVoice(voiceText);
    if (result) {
      onNarrationGenerated?.(result);
    }
  };

  const handleSyncScenesClick = async () => {
    const aligned = await voice.syncScenes(timeline, audioDuration, narration.narration);
    if (aligned) {
      onSyncScenes?.(aligned);
    }
  };

  const fillVoiceTextFromScript = () => {
    setVoiceText(cleanScriptForVoice(script.raw));
  };

  return (
    <section id="voice-section" style={{ marginBottom: '32px' }}>
      <SectionHeader title="Voz" subtitle={voice.status.message} />
      <Card>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <Button
            variant={showModels ? 'secondary' : 'primary'}
            onClick={() => setShowModels(!showModels)}
            id="voice-panel-toggle-btn"
          >
            {showModels ? 'Modelos' : 'Generar voz'}
          </Button>
        </div>

        {!showModels && (
          <div id="voice-panel">
            <div className="voice-grid">
              <div className="export-control-row">
                <label htmlFor="voice-language">Idioma de la voz</label>
                <select
                  id="voice-language"
                  className="export-select"
                  value={voice.voiceConfig.language}
                  onChange={(e) => voice.setVoiceConfig({ ...voice.voiceConfig, language: e.target.value })}
                >
                  {voice.languages.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="export-control-row">
                <label htmlFor="voice-select">Voz</label>
                <select
                  id="voice-select"
                  className="export-select"
                  value={voice.voiceConfig.voiceId}
                  onChange={(e) => voice.setVoiceConfig({ ...voice.voiceConfig, voiceId: e.target.value })}
                  disabled={voice.refreshVoices().length === 0}
                >
                  {voice.refreshVoices().map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.engine})</option>
                  ))}
                </select>
              </div>
              <div className="export-control-row">
                <label htmlFor="voice-speed">Velocidad</label>
                <Input
                  id="voice-speed"
                  type="number"
                  min="0.5"
                  max="2"
                  step="0.05"
                  value={voice.voiceConfig.speed}
                  onChange={(e) => voice.setVoiceConfig({ ...voice.voiceConfig, speed: parseFloat(e.target.value) })}
                />
              </div>
              <div className="export-control-row">
                <label htmlFor="voice-pause">Pausa entre párrafos (s)</label>
                <Input
                  id="voice-pause"
                  type="number"
                  min="0"
                  max="3"
                  step="0.1"
                  value={voice.voiceConfig.pause}
                  onChange={(e) => voice.setVoiceConfig({ ...voice.voiceConfig, pause: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="voice-actions" style={{ marginBottom: '16px' }}>
              <Button variant="secondary" onClick={voice.generateSample} disabled={voice.generating || voice.refreshVoices().length === 0} className="btn-sm" id="voice-sample-btn">
                Escuchar muestra
              </Button>
            </div>

            <label htmlFor="voice-text" className="audio-label" style={{ display: 'block', marginBottom: '8px' }}>
              Texto que se va a leer (editable)
            </label>
            <textarea
              id="voice-text"
              className="voice-text"
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              rows={4}
              placeholder="Usa el guion limpio"
            />

            <div className="voice-actions" style={{ marginTop: '12px' }}>
              <Button variant="secondary" onClick={fillVoiceTextFromScript} className="btn-sm" id="voice-clean-btn">
                Usar guion limpio
              </Button>
              <Button onClick={handleGenerateVoice} disabled={voice.generating} className="btn-sm" id="voice-generate-btn">
                {voice.generating ? 'Generando...' : 'Generar voz'}
              </Button>
              <Button variant="secondary" onClick={voice.cancelVoice} disabled={!voice.generating} className="btn-sm" id="voice-cancel-btn">
                Cancelar
              </Button>
            </div>

            <div className="voice-actions" style={{ marginTop: '12px' }}>
              <Button variant="secondary" onClick={handleSyncScenesClick} disabled={voice.generating || !narration.narration || timeline.length === 0} className="btn-sm" id="sync-scenes-btn">
                Sincronizar escenas con la voz
              </Button>
            </div>

            <div id="voice-progress" className="export-progress" style={{ marginTop: '16px' }} hidden={voice.progress <= 0}>
              <ProgressBar value={voice.progress} fillId="voice-progress-fill" />
              <div className="progress-info">
                <span id="voice-progress-text">{Math.round(voice.progress)}%</span>
              </div>
            </div>

            <div id="voice-status" className={`export-status ${voice.status.type}`} hidden={!voice.status.message}>
              {voice.status.message}
            </div>
          </div>
        )}

        <div id="models-panel" hidden={!showModels}>
          <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: font.lg, fontWeight: 600, color: colors.text, marginBottom: '16px' }}>
            Modelos locales (voz y alineación)
          </h3>
          <div id="models-list" className="models-list">
              {models.models.map((model) => (
                <div key={model.id} className="model-row model-row-stack">
                  <div className="model-row-head">
                    <span className="model-name">{model.name}</span>
                    <span className={`model-status ${model.installed ? (model.verified ? 'ok' : 'warn') : 'missing'}`}>
                      {model.installed ? (model.verified ? 'Instalado y verificado' : 'Instalado (sin verificar)') : 'Incompleto'}
                    </span>
                  </div>
                  {(model.files || []).map((file) => (
                    <div key={file.fileName} className="model-file">
                      <span className="model-file-name">{file.fileName}</span>
                      <span className={`model-status ${file.verifying ? 'verifying' : file.exists ? (file.verified ? 'ok' : 'warn') : 'missing'}`}>
                        {file.exists ? (file.verified ? 'Listo' : (file.verifying ? 'Verificando…' : 'Sin verificar')) : `falta ${file.fileName}`}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="voice-actions" style={{ marginTop: '16px' }}>
              <Button variant="secondary" onClick={models.download} disabled={models.downloading} className="btn-sm" id="models-download-btn">
                {models.downloading ? 'Descargando...' : 'Descargar modelos'}
              </Button>
              <Button variant="secondary" onClick={() => models.importModel(undefined)} disabled={models.downloading} className="btn-sm" id="models-import-btn">
                Importar modelo…
              </Button>
              <Button variant="secondary" onClick={models.cancel} disabled={!models.downloading} className="btn-sm" id="models-cancel-btn">
                Cancelar
              </Button>
            </div>

            <div id="models-progress" className="export-progress" style={{ marginTop: '16px' }} hidden={models.progress <= 0}>
              <ProgressBar value={models.progress} fillId="models-progress-fill" />
              <div className="progress-info">
                <span id="models-progress-text">{Math.round(models.progress)}%</span>
              </div>
            </div>

            <div id="models-status" className={`export-status ${models.status.type}`} hidden={!models.status.message}>
              {models.status.message}
            </div>
          </div>
      </Card>
    </section>
  );
}