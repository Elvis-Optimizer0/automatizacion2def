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
  },
  piper: {
    id: 'piper',
    name: 'Piper TTS voces',
    engine: 'piper',
    files: [
      {
        fileName: 'es_MX-ald-medium.onnx',
        sizeBytes: 63201294,
        sha256: '019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63',
        license: 'Unlicense',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/es/es_MX/ald/medium/MODEL_CARD',
        commercialUse: true,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx'
      },
      {
        fileName: 'es_MX-ald-medium.onnx.json',
        sizeBytes: 4878,
        sha256: '5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d',
        license: 'Unlicense',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/es/es_MX/ald/medium/MODEL_CARD',
        commercialUse: true,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json'
      },
      {
        fileName: 'es_MX-ald-x_low.onnx',
        sizeBytes: 20986952,
        sha256: 'd8aae54aee9eafb37fb85d6da676facafca31c2d84d11acdca1a5b6dd82b1df6',
        license: 'No declarada en MODEL_CARD',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/es/es_MX/ald/x_low/MODEL_CARD',
        commercialUse: false,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx'
      },
      {
        fileName: 'es_MX-ald-x_low.onnx.json',
        sizeBytes: 4877,
        sha256: '5b372adf1f8c8d8f0610b9057fc2df001ad3f5f42cd9d6f853a78bef3f8b0644',
        license: 'No declarada en MODEL_CARD',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/es/es_MX/ald/x_low/MODEL_CARD',
        commercialUse: false,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx.json'
      },
      {
        fileName: 'es_ES-carlfm-x_low.onnx',
        sizeBytes: 28130791,
        sha256: 'd69677323a907cd4963f42b29c20a98b5d6bfa7f3e64df339915e4650c00d125',
        license: 'Public domain',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/es/es_ES/carlfm/x_low/MODEL_CARD',
        commercialUse: true,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx'
      },
      {
        fileName: 'es_ES-carlfm-x_low.onnx.json',
        sizeBytes: 4159,
        sha256: 'd9bdfa9ff01eb2bc9e62e7d2593939d1e4c4d8eb7cf75f972731539d12399966',
        license: 'Public domain',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/es/es_ES/carlfm/x_low/MODEL_CARD',
        commercialUse: true,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx.json'
      },
      {
        fileName: 'en_US-lessac-medium.onnx',
        sizeBytes: 63201294,
        sha256: '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f',
        license: 'Blizzard (non-commercial)',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/lessac/medium/MODEL_CARD',
        commercialUse: false,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx'
      },
      {
        fileName: 'en_US-lessac-medium.onnx.json',
        sizeBytes: 4885,
        sha256: 'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0',
        license: 'Blizzard (non-commercial)',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/lessac/medium/MODEL_CARD',
        commercialUse: false,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json'
      },
      {
        fileName: 'en_US-lessac-low.onnx',
        sizeBytes: 63201294,
        sha256: 'f7d01dde371555732c4c314111ac79672b1a5ce2fc19266ab42178fd8df7f375',
        license: 'Blizzard (non-commercial)',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/lessac/low/MODEL_CARD',
        commercialUse: false,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx'
      },
      {
        fileName: 'en_US-lessac-low.onnx.json',
        sizeBytes: 4882,
        sha256: '45754dfdebb3b8661c3fc564713772deec6e064feeb5b4e9594857dc7305193a',
        license: 'Blizzard (non-commercial)',
        licenseSource: 'https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/lessac/low/MODEL_CARD',
        commercialUse: false,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json'
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