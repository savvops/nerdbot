import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

if (!existsSync(resolve(dist, 'manifest.json'))) {
  throw new Error('dist/manifest.json is missing; run the production build first.');
}

// The manifest version is what the Chrome Web Store reads — name the zip
// after it so the artifact can never claim a different version than it ships.
const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const version = manifest.version;
const output = resolve(root, `nerdbot-v${version}.zip`);

rmSync(output, { force: true });

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
        env: { ...process.env, NERDBOT_DIST: dist, NERDBOT_ZIP: output },
      },
    )
  : spawnSync('zip', ['-r', output, '.', '-x', '*.map'], {
      cwd: dist,
      stdio: 'inherit',
    });

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Extension packaging failed with exit code ${result.status}.`);
}

console.log(`Created ${output}`);
