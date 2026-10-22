/** Build browser-specific ZIPs using Python's standard library. */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'scripts/package.py')], {
  cwd: __dirname, stdio: 'inherit'
});
if (result.error) console.error('Packaging failed:', result.error.message);
process.exitCode = result.status ?? 1;
