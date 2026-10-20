# Test Hooks Contract (from original renderer.js)

## `__TEST_STATE__` (exposes `state` object directly)
- `images[]` - array of image objects with {name, path, size, type, preview, focus169, focus916, focus11, focus45, missing}
- `audio.narration` - {name, path, duration, type}
- `audio.music` - {name, path, type}
- `script.raw` - raw script text
- `script.scenes[]` - parsed scenes with {number, start, end, text}
- `script.warnings[]` - array of warning strings
- `timeline[]` - built timeline with {number, start, end, duration, text, image, zoom, transition, words}
- `timelineOptions.adjustToAudio` - boolean
- `audioDuration` - number (seconds)
- `config` - full config object (outputs, fitMode, frameColor, backgroundMode, backgroundColor, musicVolume, voice, extras, subtitles)
- `exportOptions` - zoom/transition options
- `project` - {filePath, missing[]}
- `focus` - {imageIndex, format}
- `hwAccel` - {enabled, available}
- `capabilities` - object
- `pipeline` - {running, stage}
- `export` - {isRendering, progress, outputPath, outputFolder, status}

## `__TEST_RENDER__` Functions (must manipulate DOM directly)

| Function | DOM Targets | Purpose |
|----------|-------------|---------|
| `renderImages()` | `#images-list` | Renders image grid with `.image-item` containing `.image-thumbnail`, `.image-name`, `.image-path` |
| `renderAudio()` | `#audio-narration`, `#audio-narration-info`, `#audio-music`, `#audio-music-info` | Updates audio inputs and info displays |
| `renderScript()` | `#script-textarea`, `#script-warnings`, `#script-summary` | Updates script textarea, warnings, summary count |
| `renderTimeline()` | `#timeline-tbody`, `#timeline-empty`, `#timeline-summary` | Builds timeline table with rows for each scene |
| `renderAll()` | calls renderImages, renderAudio, renderScript | Full re-render |
| `updateExportButton()` | `#export-btn` | Enables/disables export button based on state readiness |
| `renderFocusEditor()` | `#focus-image-select`, `#focus-image`, `#focus-bg`, `#focus-editor`, `#focus-box`, `#focus-readout`, `#focus-scale-readout`, `#focus-scale`, `#focus-empty` | Renders focus editor for current image |
| `updateFocusBoxPreview()` | Updates `#focus-box` position/size, `#focus-readout`, `#focus-scale-readout`, `#focus-scale` | Updates focus box preview |
| `renderOutputChips()` | `.format-chip` | Updates format chip active states |
| `setFocusScale(value)` | Updates focus scale for current image/format | Sets focus scale |
| `applyAutoScale()` | Calls `updateFocusBoxPreview()` | Auto-fits image |
| `resetFocus()` | Resets focus to center/scale 1 | Resets focus |
| `renderOutputChips()` | `.format-chip[data-format]` | Updates format chip active states |
| `updateSubtitlePreview()` | `#subtitle-preview`, `#subtitle-preview-text` | Updates subtitle preview box |
| `syncSubtitleControls()` | All subtitle control IDs | Syncs subtitle config to DOM |
| `refreshFontList(preferredFamily)` | `#subtitle-font` | Populates font dropdown |
| `refreshKeywordList()` | `#keywords-list` | Renders keyword rows with checkboxes/colors |
| `refreshPresets(selectedName)` | `#preset-select` | Populates presets dropdown |
| `applyPresetByName(name)` | Applies preset to subtitle config | Applies preset |
| `snapshotSubtitleStyle()` | Returns subtitle style object | Snapshots current style |
| `refreshPreviewScenes()` | `#preview-scene-select` | Populates scene dropdown for preview |
| `selectSuggestedKeywords()` | `#keywords-list` checkboxes | Selects suggested keywords |
| `addSearchTerm()` | `#subtitle-term-search` | Adds custom search term |
| `updateSubtitlePreview()` | `#subtitle-preview`, `#subtitle-preview-text` | Updates preview |
| `syncSubtitleControls()` | All subtitle control IDs | Syncs config to DOM |
| `refreshFontList(preferredFamily)` | `#subtitle-font` | Populates font dropdown |
| `refreshKeywordList()` | `#keywords-list` | Renders keyword rows |
| `refreshPresets(selectedName)` | `#preset-select` | Populates presets |
| `applyPresetByName(name)` | Applies preset | Applies preset |
| `snapshotSubtitleStyle()` | Returns style object | Snapshots style |
| `refreshPreviewScenes()` | `#preview-scene-select` | Populates preview scenes |
| `selectSuggestedKeywords()` | Selects suggested keywords | Selects suggested |
| `addSearchTerm()` | Adds custom term | Adds term |
| `refreshVoiceLanguages()` | `#voice-language` | Populates language dropdown |
| `refreshVoiceSelect()` | `#voice-select` | Populates voice dropdown |
| `syncVoiceControls()` | `#voice-language`, `#voice-select`, `#voice-speed`, `#voice-pause` | Syncs voice config |
| `handleGenerateVoice()` | Generates voice via API | Generates voice |
| `handleVoiceClean()` | Fills `#voice-text` with clean script | Cleans script for voice |
| `cleanScriptForVoice(script)` | Returns cleaned script | Cleans script |
| `refreshModelsList()` | `#models-list` | Renders model list |
| `handleDownloadModels()` | Downloads models via API | Downloads models |
| `handleImportModel(filePath)` | Imports model via API | Imports model |
| `handleSyncScenes()` | Syncs scenes with narration via API | Syncs scenes |
| `handleGenerateFullVideo()` | Full pipeline | Generates full video |
| `handleProbeGpu()` | `#directml-checkbox`, `#gpu-info`, `#capabilities-panel` | Probes GPU |
| `renderCapabilities(capabilities)` | `#gpu-info`, `#directml-checkbox`, `#capabilities-panel` | Renders capabilities |
| `renderCapabilities()` | Renders capabilities | Renders capabilities |

## `__TEST_EXPORT__` Functions
- `handleExport()` - triggers export
- `handleOpenOutputFolder()` - opens output folder
- `toggleOutputFormat(format)` - toggles format chip
- `buildExportImages()` - builds images array for export
- `frameGeometry()` - calculates frame geometry
- `buildProjectData()` - builds project data for save
- `loadProject(project, missing)` - loads project into state
- `handleSaveProject()` - saves project
- `handleOpenProject()` - opens project dialog
- `handlePreview()` - renders preview

## `__TEST_CONTROLS__`
Array of {id, tipo, hasHandler} from CONTROLS array

## DOM IDs Required by Tests (from original index.html and tests)
- `#import-images-btn` - "Seleccionar imágenes"
- `#images-drop-zone` - "Arrastra imágenes aquí"
- `#audio-narration` - input for narration path
- `#audio-music` - input for music path
- `#script-textarea` - script editor
- `#paste-script-btn` - "Pegar del portapapeles"
- `#load-script-btn` - "Cargar .txt"
- `#timeline-empty` - "Carga un guion e imágenes"
- `#adjust-timeline-checkbox` - checkbox
- `#export-btn` - export button
- `#images-list` - container for `.image-item`
- `#audio-narration-info` - narration info display
- `#audio-music-info` - music info display
- `#script-summary` - "N escenas detectadas · M imágenes asignadas"
- `#script-warnings` - container for `.warning-item`
- `#timeline-tbody` - timeline table body
- `#timeline-summary` - duration summary
- `#images-drop-zone` - drop zone for images
- `#audio-narration-drop` - drop zone for narration
- `#audio-music-drop` - drop zone for music
- `#voice-language` - language select
- `#voice-select` - voice select
- `#voice-speed` - speed input
- `#voice-pause` - pause input
- `#voice-text` - voice text textarea
- `#voice-sample-btn` - "Escuchar muestra"
- `#voice-clean-btn` - "Usar guion limpio"
- `#voice-generate-btn` - "Generar voz"
- `#voice-cancel-btn` - "Cancelar"
- `#sync-scenes-btn` - "Sincronizar escenas con la voz"
- `#voice-progress` - progress container
- `#voice-progress-fill` - progress bar fill
- `#voice-progress-text` - progress text
- `#voice-status` - status message
- `#models-panel` - models panel
- `#models-list` - model list container
- `#models-download-btn` - "Descargar modelos"
- `#models-import-btn` - "Importar modelo…"
- `#models-cancel-btn` - "Cancelar"
- `#models-progress` - progress container
- `#models-progress-fill` - progress bar fill
- `#models-progress-text` - progress text
- `#models-status` - status message
- `#voice-panel-toggle-btn` - toggle voice/models panel
- `#voice-panel` - voice panel container
- `#output-chip-16x9`, `#output-chip-9x16`, `#output-chip-1x1`, `#output-chip-4x5` - format chips
- `#fit-mode` - fit mode select
- `#frame-color` - color input
- `#focus-image-select` - focus image select
- `#focus-format-select` - focus format select
- `#focus-scale` - focus scale range
- `#focus-auto-btn` - auto focus button
- `#focus-reset-btn` - reset focus button
- `#focus-apply-all-btn` - apply focus to all button
- `#focus-editor` - focus editor container
- `#background-mode` - background mode select
- `#background-color` - background color input
- `#subtitles-enabled` - subtitles checkbox
- `#subtitle-font-family` - font select
- `#subtitle-size-h` - horizontal size
- `#subtitle-size-v` - vertical size
- `#subtitle-color` - text color
- `#subtitle-outline` - outline width
- `#subtitle-shadow` - shadow distance
- `#subtitle-align` - alignment select
- `#subtitle-position-y` - position Y
- `#subtitles-word-highlight` - word highlight checkbox
- `#subtitles-voice-detect` - voice detect checkbox
- `#preset-select` - preset select
- `#save-preset-btn` - save preset
- `#load-preset-btn` - load preset
- `#subtitle-align` - alignment select
- `#subtitle-letter-spacing` - letter spacing
- `#subtitle-line-height` - line height
- `#subtitle-position-y` - position Y
- `#subtitles-word-highlight` - word highlight
- `#subtitles-voice-detect` - voice detect
- `#keywords-list` - keywords container
- `#subtitle-term-search` - search term input
- `#subtitle-size-h` - horizontal size
- `#subtitle-size-v` - vertical size
- `#subtitle-bold` - bold checkbox
- `#subtitle-italic` - italic checkbox
- `#subtitle-letter-spacing` - letter spacing
- `#subtitle-text-color` - text color
- `#subtitle-outline-width` - outline width
- `#subtitle-outline-color` - outline color
- `#subtitle-alignment` - alignment
- `#subtitle-margin-h` - margin H
- `#subtitle-margin-v` - margin V
- `#subtitle-delay` - delay
- `#subtitles-word-highlight` - word highlight
- `#subtitles-voice-detect` - voice detect
- `#subtitles-background-enabled` - background enabled
- `#subtitles-background-color` - background color
- `#subtitles-background-opacity` - background opacity
- `#subtitles-shadow-enabled` - shadow enabled
- `#subtitles-shadow-color` - shadow color
- `#subtitles-shadow-opacity` - shadow opacity
- `#subtitles-shadow-distance` - shadow distance
- `#subtitles-shadow-angle` - shadow angle
- `#subtitles-shadow-blur` - shadow blur
- `#subtitle-animation` - animation select
- `#subtitles-highlight-enabled` - highlight enabled
- `#subtitle-terms-input` - terms input
- `#subtitle-terms-limit` - terms limit
- `#subtitles-detect-numbers` - detect numbers
- `#subtitles-detect-percent` - detect percent
- `#subtitles-detect-currency` - detect currency
- `#subtitle-delay` - delay
- `#subtitles-voice-detect` - voice detect
- `#subtitles-word-highlight` - word highlight
- `#subtitle-terms-limit` - terms limit
- `#import-images-btn` - "Importar imágenes"
- `#import-audio-btn` - "Generar voz" (for narration)
- `#import-music-btn` - "Seleccionar" (for music)
- `#audio-narration-drop` - narration drop zone
- `#audio-music-drop` - music drop zone
- `#import-folder-btn` - "Importar carpeta"
- `#images-grid` - image grid container
- `#images-status` - status message
- `#font-import-btn` - "Importar tipografía"
- `#subtitle-font-family` - font family select
- `#subtitle-font-size` - font size
- `#subtitle-color` - text color
- `#subtitle-outline` - outline
- `#subtitle-shadow` - shadow
- `#save-preset-btn` - save preset
- `#load-preset-btn` - load preset
- `#subtitle-align` - alignment
- `#subtitle-letter-spacing` - letter spacing
- `#subtitle-line-height` - line height
- `#subtitle-position-y` - position Y
- `#subtitles-word-highlight` - word highlight
- `#subtitles-voice-detect` - voice detect
- `#zoom-type` - zoom type select
- `#zoom-intensity` - intensity range
- `#zoom-seed` - seed input
- `#zoom-per-scene` - per scene checkbox
- `#apply-scene-settings-btn` - apply to all
- `#save-project-btn` - save project
- `#open-project-btn` - open project
- `#zoom-enabled-checkbox` - zoom enabled
- `#transition-type` - transition type
- `#transition-mode` - transition mode
- `#transition-seed` - seed
- `#transition-duration` - duration
- `#badge-enabled` - badge enabled
- `#badge-text` - badge text
- `#badge-position` - badge position
- `#badge-animation` - badge animation
- `#lower-third-enabled` - lower third enabled
- `#lower-third-text` - lower third text
- `#lower-third-opacity` - lower third opacity
- `#progress-bar-enabled` - progress bar enabled
- `#progress-bar-color` - progress bar color
- `#progress-bar-height` - progress bar height
- `#export-cancel-btn` - cancel export
- `#export-progress` - export progress
- `#export-progress-fill` - export progress fill
- `#export-progress-text` - export progress text
- `#export-status` - export status
- `#open-output-folder-btn` - open folder
- `#output-format-chips` - format chips container
- `#gpu-probe-btn` - probe GPU
- `#directml-checkbox` - DirectML checkbox
- `#gpu-status` - GPU status
- `#capabilities-panel` - capabilities panel
- `#preview-scene-select` - preview scene select
- `#preview-video` - preview video element
- `#subtitle-preview` - subtitle preview box
- `#subtitle-preview-text` - subtitle preview text
- `#preset-select` - preset select
- `#preset-name-input` - preset name input
- `#preset-name-draft` - preset name draft
- `#import-font-btn` - import font button
- `#font-status` - font status
- `#font-grid` - font grid
- `#timeline-duration-*` - duration inputs
- `#timeline-zoom-*` - zoom selects
- `#timeline-transition-*` - transition selects
- `#timeline-intensity-*` - intensity inputs