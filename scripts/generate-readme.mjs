#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const tmplPath = path.join(root, 'README.md.tmpl');
const outPath = path.join(root, 'README.md');
const presetsDir = path.join(root, 'assets', 'presets');

function readPresets() {
  try {
    const files = fs.readdirSync(presetsDir)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, 'en'));
    return files;
  } catch (err) {
    console.error(`Failed to read presets from ${presetsDir}:`, err.message);
    process.exit(1);
  }
}

function renderPresetSection(filename) {
  const name = filename.replace(/\.png$/i, '');
  return [
    `### \`${name}\``,
    '',
    '```diff',
    'import astroTakumi, { presets } from "astro-takumi";',
    '',
    'export default defineConfig({',
    '  integrations: [',
    '    astroTakumi({',
    `+      render: presets.${name},`,
    '    }),',
    '  ],',
    '});',
    '```',
    '',
    `![](assets/presets/${filename})`,
    '',
  ].join('\n');
}

function expandTemplate(tmpl, presets) {
  const startMarker = /\{\{\s*range\s+\$preset\s*:=\s*\(ds\s*"presets"\)\s*-\s*\}\}/;
  const endMarker = /\{\{\s*end\s*\}\}/;

  const lines = tmpl.split(/\r?\n/);
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1 && startMarker.test(lines[i])) startIdx = i;
    if (startIdx !== -1 && endMarker.test(lines[i])) { endIdx = i; break; }
  }

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('Could not locate presets block in README.md.tmpl');
  }

  const before = lines.slice(0, startIdx).join('\n');
  const after = lines.slice(endIdx + 1).join('\n');
  const body = presets.map(renderPresetSection).join('\n');
  return [before, body, after].join('\n');
}

function main() {
  const tmpl = fs.readFileSync(tmplPath, 'utf8');
  const presets = readPresets();
  const out = expandTemplate(tmpl, presets);
  fs.writeFileSync(outPath, out);
  console.log(`README generated with ${presets.length} presets → ${outPath}`);
}

main();

