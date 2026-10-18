const MODEL_SPECS = {
  kokoro: {
    id: 'kokoro',
    name: 'Kokoro voz (ONNX)',
    engine: 'kokoro',
    files: [
      {
        fileName: 'kokoro-v1.0.onnx',
        sizeBytes: 325505369,
        sha256: 'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a',
        url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx'
      },
      {
        fileName: 'voices-v1.0.bin',
        sizeBytes: 28214398,
        sha256: 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
        url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin'
      }
    ]
  },
  whisper: {
    id: 'whisper',
    name: 'Whisper ggml base',
    engine: 'whisper',
    files: [
      {
        fileName: 'ggml-base.bin',
        sizeBytes: 147951465,
        sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
      }
    ]
  }
};

const CATALOG = Object.values(MODEL_SPECS);

function getSpec(modelId) {
  return MODEL_SPECS[modelId] || null;
}

function getAllSpecs() {
  return CATALOG;
}

module.exports = {
  MODEL_SPECS,
  CATALOG,
  getSpec,
  getAllSpecs
};