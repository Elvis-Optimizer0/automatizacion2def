const fs = require('fs');
const path = require('path');

// Read base64 fonts
const b64_regular = fs.readFileSync('app/ui/dist/assets/fonts/b64_Inter-Regular.txt', 'utf-8').trim();
const b64_medium = fs.readFileSync('app/ui/dist/assets/fonts/b64_Inter-Medium.txt', 'utf-8').trim();
const b64_semibold = fs.readFileSync('app/ui/dist/assets/fonts/b64_Inter-SemiBold.txt', 'utf-8').trim();
const b64_bold = fs.readFileSync('app/ui/dist/assets/fonts/b64_Inter-Bold.txt', 'utf-8').trim();

// Read source CSS
let css = fs.readFileSync('app/ui/src/styles.css', 'utf-8');

// Replace font URLs with base64 data URLs
css = css.replace(/url\(['"]\.\/fonts\/Inter-Regular\.woff2['"]\)/g, `url('data:font/woff2;base64,${b64_regular}')`);
css = css.replace(/url\(['"]\.\/fonts\/Inter-Medium\.woff2['"]\)/g, `url('data:font/woff2;base64,${b64_medium}')`);
css = css.replace(/url\(['"]\.\/fonts\/Inter-SemiBold\.woff2['"]\)/g, `url('data:font/woff2;base64,${b64_semibold}')`);
css = css.replace(/url\(['"]\.\/fonts\/Inter-Bold\.woff2['"]\)/g, `url('data:font/woff2;base64,${b64_bold}')`);

fs.writeFileSync('app/ui/src/styles.css', css, 'utf-8');
console.log('Updated source CSS with base64 fonts');