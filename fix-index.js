const fs = require('fs');
const path = require('path');

// Fix index.html paths
const html = fs.readFileSync('app/ui/dist/index.html', 'utf-8');
const fixed = html.replace(/src="\/assets\//g, 'src="./assets/').replace(/href="\/assets\//g, 'href="./assets/');
fs.writeFileSync('app/ui/dist/index.html', fixed);
console.log('Fixed index.html');

// Copy fonts to assets/fonts
const fontsSrcDir = 'app/ui/dist/fonts';
const fontsDestDir = 'app/ui/dist/assets/fonts';
if (fs.existsSync(fontsSrcDir)) {
  if (!fs.existsSync(fontsDestDir)) {
    fs.mkdirSync(fontsDestDir, { recursive: true });
  }
  const fontFiles = fs.readdirSync(fontsSrcDir);
  for (const file of fontFiles) {
    fs.copyFileSync(path.join(fontsSrcDir, file), path.join(fontsDestDir, file));
  }
  console.log('Copied fonts to assets/fonts');
}
console.log('Done');