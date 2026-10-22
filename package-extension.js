/**
 * Packages the extension into a zip file for Chrome and Firefox distribution.
 */

const { execSync } = require('child_process');
const fs = require('fs');

// Bundle the official, unmodified release with its license for offline use.
const path = require('path');
const vendorDir = path.join(__dirname, 'content', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'node_modules/dompurify/dist/purify.js'), path.join(vendorDir, 'purify.js'));
fs.copyFileSync(path.join(__dirname, 'node_modules/dompurify/LICENSE'), path.join(vendorDir, 'DOMPurify-LICENSE'));

const pyScript = `
import zipfile
import os
import json

dist_dir = 'dist'
os.makedirs(dist_dir, exist_ok=True)

# 1. Universal Package (No background script - works out-of-the-box in Chrome & Firefox)
universal_zip_path = os.path.join(dist_dir, 'ado-description-diff.zip')

files_to_pack = [
    'LICENSE',
    'CHANGELOG.md',
    'manifest.json',
    'content/content.js',
    'content/htmldiff.js',
    'content/vendor/purify.js',
    'content/vendor/DOMPurify-LICENSE',
    'content/styles.css',
    'popup/popup.html',
    'popup/popup.js',
    'popup/popup.css',
    'options/options.html',
    'options/options.js',
    'options/options.css',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'icons/icon.svg'
]

with zipfile.ZipFile(universal_zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files_to_pack:
        if os.path.exists(f):
            z.write(f, f)
            print(f"Added {f}")
        else:
            raise FileNotFoundError(f)

print(f"\\nSuccessfully generated universal zip: {universal_zip_path} ({os.path.getsize(universal_zip_path)} bytes)")

# Reviewer sources include the demo and the original DOMPurify package, never
# the full node_modules tree or local account/configuration files.
source_zip_path = os.path.join(dist_dir, 'ado-description-diff-source.zip')
source_files = [
    'manifest.json', 'package.json', 'package-lock.json',
    'package-extension.js', 'README.md', 'CHANGELOG.md', 'SUBMISSION.md', 'LICENSE'
]
for folder in ['content', 'popup', 'options', 'icons', 'demo', 'tests', 'node_modules/dompurify']:
    for directory, subdirectories, filenames in os.walk(folder):
        subdirectories.sort()
        source_files.extend(os.path.join(directory, filename) for filename in sorted(filenames))
with zipfile.ZipFile(source_zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for filename in source_files:
        z.write(filename, filename)
print(f"Successfully generated reviewer source zip: {source_zip_path} ({os.path.getsize(source_zip_path)} bytes)")
`;

fs.writeFileSync('/tmp/pack_extension.py', pyScript);
try {
  const out = execSync('python3 /tmp/pack_extension.py', { encoding: 'utf8' });
  console.log(out);
} catch (err) {
  console.error('Packaging failed:', err.message);
  process.exitCode = 1;
}
