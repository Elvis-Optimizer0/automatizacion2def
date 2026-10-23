const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const vendorDir = path.join('C:\\Users\\zyrothx\\Desktop\\projectwo\\vendor', 'piper', 'models');
fs.mkdirSync(vendorDir, { recursive: true });

const models = [
  {
    name: 'es_MX-ald-medium',
    onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx',
    json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json'
  },
  {
    name: 'es_MX-ald-x_low',
    onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx',
    json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx.json'
  },
  {
    name: 'es_ES-carlfm-x_low',
    onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx',
    json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx.json'
  },
  {
    name: 'en_US-lessac-medium',
    onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json'
  },
  {
    name: 'en_US-lessac-low',
    onnx: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx',
    json: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json'
  }
];

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const doRequest = (requestUrl) => {
      https.get(requestUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          let nextUrl = response.headers.location;
          // Handle relative redirect URLs
          if (nextUrl.startsWith('/') || nextUrl.startsWith('./') || !nextUrl.includes('://')) {
            const baseUrl = new URL(requestUrl);
            nextUrl = new URL(nextUrl, baseUrl.origin).toString();
          }
          doRequest(nextUrl);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} for ${requestUrl}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    doRequest(url);
  });
}

async function main() {
  for (const m of models) {
    const onnxDest = path.join(vendorDir, m.name + '.onnx');
    const jsonDest = path.join(vendorDir, m.name + '.onnx.json');
    
    console.log('Downloading', m.name + '.onnx...');
    await downloadFile(m.onnx, onnxDest);
    console.log('Downloaded', m.name + '.onnx');
    
    console.log('Downloading', m.name + '.onnx.json...');
    await downloadFile(m.json, jsonDest);
    console.log('Downloaded', m.name + '.onnx.json');
    
    // Calculate SHA256
    const onnxHash = crypto.createHash('sha256');
    onnxHash.update(fs.readFileSync(onnxDest));
    console.log(m.name + '.onnx SHA256:', onnxHash.digest('hex'));
    
    const jsonHash = crypto.createHash('sha256');
    jsonHash.update(fs.readFileSync(jsonDest));
    console.log(m.name + '.onnx.json SHA256:', jsonHash.digest('hex'));
    
    const onnxStat = fs.statSync(onnxDest);
    const jsonStat = fs.statSync(jsonDest);
    console.log(m.name + '.onnx size:', onnxStat.size);
    console.log(m.name + '.onnx.json size:', jsonStat.size);
  }
}

main().catch(e => console.error(e));