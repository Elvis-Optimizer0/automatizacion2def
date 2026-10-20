import React, { useEffect } from 'react';
import { registerTestHooks, unregisterTestHooks } from './testHooks';
import { StarfieldCanvas, ToastContainer } from './components';
import {
  ImportSection,
  ScriptSection,
  VoiceSection,
  ConfigSection,
  ExtrasSection,
  TimelineSection,
  ExportSection,
  FocusSection,
} from './sections';
import {
  useImages,
  useNarration,
  useMusic,
  useScript,
  useTimeline,
  useConfig,
  useExportOptions,
  useFocus,
  useExportState,
  useProject,
} from './store';
import { colors, font } from './design-system';
import packageJson from '../../../package.json';

function App() {
  const images = useImages();
  const narration = useNarration();
  const music = useMusic();
  const script = useScript();
  const config = useConfig();
  const exportOptions = useExportOptions();
  const focus = useFocus();
  const exportState = useExportState();
  const project = useProject();

  const { timeline, setTimeline, setAdjustToAudio } = useTimeline(
    images.images, 
    script.scenes, 
    narration.duration, 
    narration.narration
  );

  useEffect(() => {
    document.title = `Video Maker v${packageJson.version}`;
  }, []);

  // Register test hooks on mount
  useEffect(() => {
    registerTestHooks();
    if (typeof window !== 'undefined') {
      window.__APP_MOUNTED__ = true;
    }
    return () => {
      unregisterTestHooks();
      if (typeof window !== 'undefined') {
        window.__APP_MOUNTED__ = false;
      }
    };
  }, []);

  // Ensure test hooks are ready after React has fully rendered
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__APP_MOUNTED__) {
      requestAnimationFrame(() => {
        window.__TEST_HOOKS_READY__ = true;
      });
    }
  }, []);

  const handleNarrationGenerated = (result) => {
    narration.setNarration({ ...result, type: 'audio' });
    narration.setDuration(result.duration);
  };

  const handleSyncScenes = (aligned) => {
    setTimeline(aligned);
  };

  const handleExport = async () => {
    if (timeline.length === 0) return;
    if (!narration.narration) return;
    if (timeline.some(s => !s.image)) return;
    if (config.config.outputs.length === 0) return;

    const scenes = timeline.map(s => ({
      number: s.number,
      duration: s.duration,
      text: s.text || '',
      words: s.words,
      zoom: s.zoom,
      transition: s.transition,
    }));

    const imagesList = timeline.map(s => s.image).filter(Boolean);

    const success = await exportState.exportVideo({
      scenes,
      images: imagesList,
      narration: narration.narration,
      music: music.music,
      outputPath: '',
      audioDuration: narration.duration,
      outputIds: config.config.outputs,
      config: config.config,
      renderOptions: exportOptions.options,
      useHardwareAcceleration: false,
    });

    if (success) {
      // Export successful
    }
  };

  const handleOpenFolder = async () => {
    if (exportState.outputFolder) {
      await exportState.openOutputFolder();
    }
  };

  return (
    <>
      <StarfieldCanvas />
      <ToastContainer />

      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          backgroundColor: 'rgba(8, 8, 15, 0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${colors.border}`,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: font.title,
              fontWeight: 700,
              color: colors.accent,
              textShadow: '0 0 20px rgba(220,40,40,0.35)',
              margin: 0,
            }}
          >
            Video Maker
          </h1>
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: font.sm,
              color: colors.textMuted,
            }}
          >
            v{packageJson.version}
          </span>
        </div>
      </header>

      <main
        id="main-content"
        style={{
          paddingTop: '88px',
          paddingBottom: '32px',
          paddingLeft: '32px',
          paddingRight: '32px',
          maxWidth: '960px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          minHeight: '100vh',
        }}
      >
        <ImportSection
          images={images}
          narration={narration}
          music={music}
        />
        <ScriptSection
          images={images.images}
          narration={narration}
          script={script}
          timeline={timeline}
          adjustToAudio={config.config.timelineOptions?.adjustToAudio || false}
          setAdjustToAudio={setAdjustToAudio}
        />
        <VoiceSection
          narration={narration}
          timeline={timeline}
          audioDuration={narration.duration}
          onNarrationGenerated={handleNarrationGenerated}
          onSyncScenes={handleSyncScenes}
        />
        <ConfigSection
          config={config.config}
          updateConfig={config.updateConfig}
          exportOptions={exportOptions.options}
          updateOption={exportOptions.updateOption}
          toggleOutput={config.toggleOutput}
        />
        <ExtrasSection
          config={config.config}
          updateConfig={config.updateConfig}
        />
        <FocusSection
          images={images.images}
          config={config.config}
          focus={focus.focus}
          setFocus={focus.setFocus}
        />
        <TimelineSection
          images={images.images}
          scenes={script.scenes}
          audioDuration={narration.duration}
          narration={narration}
          adjustToAudio={config.config.timelineOptions?.adjustToAudio || false}
          setAdjustToAudio={setAdjustToAudio}
          onTimelineChange={setTimeline}
        />
        <ExportSection
          config={config.config}
          timeline={timeline}
          narration={narration}
          exportOptions={exportOptions.options}
          onExport={handleExport}
          onOpenFolder={handleOpenFolder}
        />
      </main>
    </>
  );
}

export default App;