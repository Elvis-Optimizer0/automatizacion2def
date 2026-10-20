import React from 'react';
import { Card, SectionHeader, Badge, Input, Select, Button } from '../components';
import { useTimeline } from '../hooks/useData';
import { colors, radius, font } from '../design-system';

const ZOOM_TYPES = ['none', 'kenburns', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'alternate', 'random'];
const TRANSITION_TYPES = ['cut', 'fade', 'fadeblack', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'curtainLeft', 'curtainRight', 'circle'];

export function TimelineSection({ images, scenes, audioDuration, narration, adjustToAudio, setAdjustToAudio, onTimelineChange }) {
  const timeline = useTimeline(images, scenes, audioDuration, adjustToAudio);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleDurationChange = (index, e) => {
    const newDuration = parseFloat(e.target.value);
    if (isNaN(newDuration) || newDuration < 0.1) {
      e.target.value = timeline.timeline[index].duration.toFixed(1);
      return;
    }
    timeline.updateDuration(index, newDuration);
    onTimelineChange?.(timeline.timeline);
  };

  const handleSceneZoomChange = (index, e) => {
    const value = e.target.value;
    if (!value) {
      timeline.updateSceneZoom(index, undefined);
    } else {
      timeline.updateSceneZoom(index, { type: value });
    }
    onTimelineChange?.(timeline.timeline);
  };

  const handleSceneTransitionChange = (index, e) => {
    const value = e.target.value;
    if (!value) {
      timeline.updateSceneTransition(index, undefined);
    } else {
      timeline.updateSceneTransition(index, { type: value });
    }
    onTimelineChange?.(timeline.timeline);
  };

  return (
    <section id="timeline-section" className="timeline-section" aria-label="Línea de tiempo" style={{ marginBottom: '32px' }}>
      <SectionHeader title="Línea de tiempo" subtitle={`Duración total: ${formatTime(timeline.totalDuration)}${audioDuration > 0 ? ` · Audio: ${formatTime(audioDuration)}` : ''}${Math.abs(timeline.totalDuration - audioDuration) > 0.1 ? ' ⚠ Desajuste' : ''}`} />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <label htmlFor="adjust-timeline-checkbox" className="checkbox-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              id="adjust-timeline-checkbox"
              type="checkbox"
              defaultChecked={adjustToAudio}
              onChange={(e) => setAdjustToAudio(e.target.checked)}
              style={{ accentColor: colors.accent, width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span className="checkmark" style={{ pointerEvents: 'none' }}></span>
            <span style={{ pointerEvents: 'none' }}>Ajustar a la duración del audio</span>
          </label>
          <Button variant="secondary" onClick={timeline.applySettingsToAll} disabled={timeline.timeline.length === 0} className="btn-sm" id="apply-scene-settings-btn">
            Aplicar ajustes a todas
          </Button>
        </div>

        {timeline.timeline.length === 0 ? (
          <>
            <div id="timeline-empty" className="timeline-empty">
              Carga un guion e imágenes para ver la línea de tiempo
            </div>
            <div id="timeline-table-container" className="timeline-table-container" hidden>
              <table id="timeline-table" className="timeline-table" aria-label="Tabla de línea de tiempo">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Escena</th>
                    <th style={{ width: '80px' }}>Miniatura</th>
                    <th style={{ width: '100px' }}>Inicio</th>
                    <th style={{ width: '100px' }}>Fin</th>
                    <th style={{ width: '100px' }}>Duración (s)</th>
                    <th style={{ width: '180px' }}>Imagen</th>
                    <th style={{ width: '140px' }}>Zoom</th>
                    <th style={{ width: '100px' }}>Intensidad</th>
                    <th style={{ width: '140px' }}>Transición</th>
                    <th>Texto</th>
                  </tr>
                </thead>
                <tbody id="timeline-tbody"></tbody>
              </table>
            </div>
            <div id="timeline-summary" className="timeline-summary" hidden></div>
          </>
        ) : (
          <>
            <div id="timeline-empty" className="timeline-empty" hidden>
              Carga un guion e imágenes para ver la línea de tiempo
            </div>
            <div id="timeline-table-container" className="timeline-table-container">
              <table id="timeline-table" className="timeline-table" aria-label="Tabla de línea de tiempo">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Escena</th>
                    <th style={{ width: '80px' }}>Miniatura</th>
                    <th style={{ width: '100px' }}>Inicio</th>
                    <th style={{ width: '100px' }}>Fin</th>
                    <th style={{ width: '100px' }}>Duración (s)</th>
                    <th style={{ width: '180px' }}>Imagen</th>
                    <th style={{ width: '140px' }}>Zoom</th>
                    <th style={{ width: '100px' }}>Intensidad</th>
                    <th style={{ width: '140px' }}>Transición</th>
                    <th>Texto</th>
                  </tr>
                </thead>
                <tbody id="timeline-tbody">
                  {timeline.timeline.map((scene, index) => (
                    <tr key={index} style={{ backgroundColor: index % 2 === 0 ? colors.surface1 : colors.surface2 }}>
                      <td style={{ fontWeight: 600, color: colors.accent }}>
                        <Badge>{scene.number}</Badge>
                      </td>
                      <td>
                        {scene.image && (
                          <img
                            src={`file://${scene.image.path}`}
                            alt={`Miniatura de ${scene.image.name}`}
                            className="timeline-thumbnail"
                            loading="lazy"
                          />
                        )}
                      </td>
                      <td>{formatTime(scene.start)}</td>
                      <td>{formatTime(scene.end)}</td>
                      <td>
                        <Input
                          id={`timeline-duration-${index}`}
                          className="timeline-duration-input"
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={scene.duration.toFixed(1)}
                          onChange={(e) => handleDurationChange(index, e)}
                        />
                      </td>
                      <td>{scene.image ? scene.image.name : <span style={{ color: colors.warning }}>Sin imagen</span>}</td>
                      <td>
                        <Select
                          id={`timeline-zoom-${index}`}
                          className="timeline-zoom-select"
                          value={scene.zoom?.type || ''}
                          onChange={(e) => handleSceneZoomChange(index, e)}
                        >
                          <option value="">(global)</option>
                          {ZOOM_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </Select>
                      </td>
                      <td>
                        <Input
                          id={`timeline-intensity-${index}`}
                          className="timeline-intensity-input"
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={(scene.zoom?.intensity ?? 0.15).toFixed(2)}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value) && value >= 0) {
                              timeline.updateSceneZoom(index, { ...scene.zoom, intensity: Math.min(1, Math.max(0, value)) });
                              onTimelineChange?.(timeline.timeline);
                            }
                          }}
                        />
                      </td>
                      <td>
                        <Select
                          id={`timeline-transition-${index}`}
                          className="timeline-transition-select"
                          value={scene.transition?.type || ''}
                          onChange={(e) => handleSceneTransitionChange(index, e)}
                        >
                          <option value="">(global)</option>
                          {TRANSITION_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </Select>
                      </td>
                      <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {scene.text || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div id="timeline-summary" className="timeline-summary">
              Duración total: {formatTime(timeline.totalDuration)}
              {audioDuration > 0 && ` · Audio: ${formatTime(audioDuration)}`}
              {Math.abs(timeline.totalDuration - audioDuration) > 0.1 && ' ⚠ Desajuste'}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}