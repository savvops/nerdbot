import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const distFirefox = resolve(root, 'dist-firefox');
const firefoxManifest = resolve(root, 'manifest.firefox.json');

if (!existsSync(resolve(dist, 'manifest.json'))) {
  throw new Error('dist/ is missing; run "npm run build" first.');
}
if (!existsSync(firefoxManifest)) {
  throw new Error('manifest.firefox.json is missing.');
}

// 1. Clean and prepare dist-firefox
rmSync(distFirefox, { recursive: true, force: true });
mkdirSync(distFirefox, { recursive: true });

// 2. Copy dist files into dist-firefox
cpSync(dist, distFirefox, { recursive: true });

// 3. Overwrite manifest.json with Firefox-specific manifest
copyFileSync(firefoxManifest, resolve(distFirefox, 'manifest.json'));

// 4. Create zip / xpi artifact
const manifestData = JSON.parse(readFileSync(firefoxManifest, 'utf8'));
const version = manifestData.version || '1.1.0';
const outputZip = resolve(root, `nerdbot-firefox-v${version}.zip`);
const outputXpi = resolve(root, `nerdbot-firefox-v${version}.xpi`);

rmSync(outputZip, { force: true });
rmSync(outputXpi, { force: true });

const result = process.platform === 'win32'
  ? spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:NERDBOT_DIST, $env:NERDBOT_ZIP, [System.IO.Compression.CompressionLevel]::Optimal, $false)",
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, NERDBOT_DIST: distFirefox, NERDBOT_ZIP: outputZip },
      },
    )
  : spawnSync('zip', ['-r', outputZip, '.', '-x', '*.map'], {
      cwd: distFirefox,
      stdio: 'inherit',
    });

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Firefox packaging failed with exit code ${result.status}.`);
}

// Also make a copy with .xpi extension for Firefox
copyFileSync(outputZip, outputXpi);

console.log(`\nFirefox build ready!`);
console.log(`Unpacked folder: ${distFirefox}`);
console.log(`Packaged zip:    ${outputZip}`);
console.log(`Firefox XPI:     ${outputXpi}`);
