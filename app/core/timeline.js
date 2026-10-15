function buildTimeline(scenes, images, audioDuration, options = {}) {
  const { adjustToAudio = false } = options;

  if (!scenes || scenes.length === 0) {
    return [];
  }

  const sortedScenes = [...scenes].sort((a, b) => a.number - b.number);
  const sortedImages = [...images].sort((a, b) => {
    const numA = extractSceneNumber(a.name);
    const numB = extractSceneNumber(b.name);
    if (numA !== null && numB !== null) {
      return numA - numB;
    }
    if (numA !== null) return -1;
    if (numB !== null) return 1;
    return 0;
  });

  const timeline = sortedScenes.map((scene, index) => {
    const image = sortedImages[index] || null;
    return {
      number: scene.number,
      start: scene.start,
      end: scene.end,
      duration: scene.end - scene.start,
      text: scene.text,
      image: image ? { name: image.name, path: image.path } : null
    };
  });

  if (adjustToAudio && audioDuration > 0) {
    const totalSceneDuration = timeline.reduce((sum, s) => sum + s.duration, 0);
    if (totalSceneDuration > 0) {
      const scale = audioDuration / totalSceneDuration;
      let accumulated = 0;
      timeline.forEach((scene, _i) => {
        const scaledDuration = scene.duration * scale;
        scene.start = accumulated;
        scene.end = accumulated + scaledDuration;
        scene.duration = scaledDuration;
        accumulated = scene.end;
      });
      timeline[timeline.length - 1].end = audioDuration;
      timeline[timeline.length - 1].duration = audioDuration - timeline[timeline.length - 1].start;
    }
  }

  return timeline;
}

function extractSceneNumber(filename) {
  const match = filename.match(/(?:escena|scene)\s*[:_\-\s]?(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

module.exports = { buildTimeline, extractSceneNumber };