const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');

function readZip(name) {
  const bytes = fs.readFileSync(path.join(root, 'dist', name));
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const compressed = bytes.readUInt32LE(offset + 18);
    const nameSize = bytes.readUInt16LE(offset + 26);
    const extraSize = bytes.readUInt16LE(offset + 28);
    const filename = bytes.subarray(offset + 30, offset + 30 + nameSize).toString();
    const start = offset + 30 + nameSize + extraSize;
    const data = bytes.subarray(start, start + compressed);
    assert.equal(files.has(filename), false, 'No duplicate ZIP paths');
    files.set(filename, method === 8 ? inflateRawSync(data) : data);
    offset = start + compressed;
  }
  assert.ok(files.size > 0, 'ZIP contains extension files');
  return files;
}

test('Chrome release archive contains exactly the current runtime and narrow manifest', () => {
  const files = readZip('ado-description-diff-chrome.zip');
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.version, require('../package.json').version);
  assert.equal(manifest.browser_specific_settings, undefined);
  assert.equal(manifest.background.service_worker, 'background/background.js');
  const resources = [manifest.action.default_popup, manifest.options_ui.page, manifest.background.service_worker,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css]),
    'shared/sites.js', 'PRIVACY.md', 'privacy.html'];
  for (const filename of resources) {
    assert.ok(files.has(filename), filename);
    assert.deepEqual(files.get(filename), fs.readFileSync(path.join(root, filename)), filename);
  }
  assert.equal([...files.keys()].some(name => name.startsWith('node_modules/')), false);
  assert.deepEqual(files.get('manifest.json'), fs.readFileSync(path.join(root, 'manifest.json')));
});

test('Firefox archive uses an event background with the same version and shared runtime', () => {
  const firefox = readZip('ado-description-diff-firefox.zip');
  const chrome = readZip('ado-description-diff-chrome.zip');
  const manifest = JSON.parse(firefox.get('manifest.json'));
  assert.equal(manifest.version, require('../package.json').version);
  assert.deepEqual(manifest.background.scripts, ['shared/sites.js', 'background/background.js']);
  assert.equal(manifest.background.service_worker, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.id, 'ado-description-diff@dawiisss');
  for (const [name, bytes] of chrome) if (name !== 'manifest.json') assert.deepEqual(firefox.get(name), bytes, name);
});

test('source and store packages include current policy, build instructions, and promotional assets', () => {
  const source = readZip('ado-description-diff-source.zip');
  const store = readZip('ado-description-diff-store-assets.zip');
  for (const filename of ['.gitignore', 'README.md', 'PRIVACY.md', 'CONTRIBUTING.md', 'scripts/package.py', 'tests/access.test.js',
    'docs/images/screenshot-640x400.png']) {
    assert.deepEqual(source.get(filename), fs.readFileSync(path.join(root, filename)), filename);
  }
  for (const filename of ['CONTRIBUTING.md', 'store-listing/LISTING.md', 'store-listing/PRIVACY-PRACTICES.md',
    'store-listing/assets/promo-small-440x280.png']) {
    assert.deepEqual(store.get(filename), fs.readFileSync(path.join(root, filename)), filename);
  }
  assert.deepEqual(store.get('store-listing/assets/screenshot-640x400.png'),
    source.get('docs/images/screenshot-640x400.png'));
  assert.equal([...source.keys()].some(name => name.startsWith('generated_images/') || /(?:^|\/)__pycache__\//.test(name)), false);
});
