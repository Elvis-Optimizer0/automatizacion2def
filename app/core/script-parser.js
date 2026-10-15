function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(p => parseFloat(p));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function parseScenes(script) {
  const lines = script.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const scenes = [];
  const seenNumbers = new Set();
  const warnings = [];

  // eslint-disable-next-line no-useless-escape
  const sceneRegex = /^\s*[\[\(]?\s*(?:escena|scene)\s*[:#]?\s*(\d+)\s*[\]\)]?/i;
  const timeRangeRegex = /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—a]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/i;
  // eslint-disable-next-line no-useless-escape
  const timeRangeParenRegex = /[\[\(](\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—a]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)[\]\)]/i;
  const timeRangeDeRegex = /de\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+a\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/i;

  let currentScene = null;
  let currentTextLines = [];

  function finalizeScene() {
    if (currentScene) {
      currentScene.text = currentTextLines.join('\n').trim();
      scenes.push(currentScene);
      currentScene = null;
      currentTextLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sceneMatch = line.match(sceneRegex);

    if (sceneMatch) {
      finalizeScene();

      const number = parseInt(sceneMatch[1], 10);
      let start = 0;
      let end = 0;

      let timeMatch = line.match(timeRangeRegex);
      if (!timeMatch) {
        timeMatch = line.match(timeRangeParenRegex);
      }
      if (!timeMatch) {
        timeMatch = line.match(timeRangeDeRegex);
      }

      if (timeMatch) {
        start = parseTimeToSeconds(timeMatch[1]);
        end = parseTimeToSeconds(timeMatch[2]);
      }

      if (seenNumbers.has(number)) {
        warnings.push(`Número de escena repetido: ${number}`);
      }
      seenNumbers.add(number);

      const textAfterMarker = line.replace(sceneRegex, '').replace(timeRangeRegex, '').replace(timeRangeParenRegex, '').replace(timeRangeDeRegex, '').trim();
      currentScene = { number, start, end };
      if (textAfterMarker) {
        currentTextLines.push(textAfterMarker);
      }
    } else if (currentScene) {
      currentTextLines.push(line);
    } else {
      currentTextLines.push(line);
    }
  }

  finalizeScene();

  scenes.sort((a, b) => a.number - b.number);

  for (let i = 0; i < scenes.length - 1; i++) {
    if (scenes[i].end > scenes[i + 1].start) {
      warnings.push(`Rangos solapados: escena ${scenes[i].number} (${scenes[i].end}s) > escena ${scenes[i + 1].number} (${scenes[i + 1].start}s)`);
    }
    if (scenes[i].end < scenes[i + 1].start) {
      const gap = scenes[i + 1].start - scenes[i].end;
      if (gap > 1) {
        warnings.push(`Hueco detectado entre escena ${scenes[i].number} y ${scenes[i + 1].number}: ${gap.toFixed(1)}s`);
      }
    }
  }

  return { scenes, warnings };
}

module.exports = { parseScenes, parseTimeToSeconds };