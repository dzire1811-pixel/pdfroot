const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
if (manifest.version !== '0.7.0-beta.20') throw new Error('Startup overlay requires assembled Beta 20 source.');
fs.cpSync(path.join(__dirname, 'app'), app, { recursive: true });
for (const file of ['package.json', 'package-lock.json']) {
  const name = path.join(app, file);
  fs.writeFileSync(name, fs.readFileSync(name, 'utf8').replaceAll('0.7.0-beta.20', '0.7.0-beta.21'));
}
console.log('Windows startup and prepared shortcut windows applied (Beta 21).');
