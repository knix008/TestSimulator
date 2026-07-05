const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'src', 'renderer', 'vendor');

const copies = [
  ['node_modules/marked/marked.min.js', 'marked.min.js'],
  ['node_modules/marked/lib/marked.esm.js', 'marked.esm.js'],
  ['node_modules/turndown/dist/turndown.js', 'turndown.js'],
  ['node_modules/turndown/lib/turndown.es.js', 'turndown.es.js']
];

fs.mkdirSync(vendorDir, { recursive: true });

for (const [source, target] of copies) {
  fs.copyFileSync(path.join(root, source), path.join(vendorDir, target));
}

console.log('Copied renderer vendor scripts.');
