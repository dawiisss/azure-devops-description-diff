# Development and releases

## Setup

Use Node.js 20 or newer for development and Python 3 for packaging. Runtime scripts, DOMPurify, and its license are already included in the repository.

The scripts/ and store-listing/ folders are local release resources excluded from Git. Packaging and store-image commands require those folders, which are also included in the reviewer source archive.

```bash
npm ci
```

Load the project folder as an unpacked extension in Chrome, Edge, or Brave. For Firefox development, build and load `dist/ado-description-diff-firefox.zip` through `about:debugging#/runtime/this-firefox`.

## Tests

```bash
# Diff engine, DOM, and site-permission checks; no browser or ZIPs needed:
npm run test:unit

# Rebuild ZIPs automatically, then validate their contents:
npm run test:package

# Browser regressions:
npx playwright install chromium
npm run test:browser

# All checks, including a fresh package build and browser regressions:
npm test
```

Set `CHROMIUM_PATH` to use an installed Chromium executable. DOM tests simulate layout and browser APIs; browser regressions exercise the rendered widgets. Also test an installed extension against Azure DevOps before releasing permission or History-detection changes.

Useful manual coverage includes both fields separately and together, added/cleared fields, revision switching, Original, Focus Changes, Copy, themes, unaffected Details/filter controls, custom-site grant denial and revocation, and embedded work-item frames.

## Packages

```bash
npm run package
# Without npm dependencies:
python3 scripts/package.py
```

| Output in dist/ | Purpose |
| --- | --- |
| ado-description-diff-chrome.zip | Chrome Web Store upload. |
| ado-description-diff.zip | Identical Chrome archive with the legacy filename. |
| ado-description-diff-firefox.zip | Firefox package for temporary testing or signing. |
| ado-description-diff-source.zip | Source, tests, documentation, and build scripts. |
| ado-description-diff-store-assets.zip | Store listing, privacy text, policy, and images. |

The packager uses only Python's standard library and fixed ZIP metadata for repeatable builds. It verifies that manifest.json and package.json versions match. It does not transpile, bundle, minify, or download runtime code. Firefox's manifest is derived from manifest.json plus manifest.firefox.json.

Generated packages and temporary files are ignored for new Git additions. Two legacy ZIPs are already tracked; ignore rules do not remove existing files from Git tracking. Store distribution archives as release attachments when maintaining future releases.

## Store images

The README screenshot is kept in `docs/images/screenshot-640x400.png`. The local `store-listing/assets/` folder holds the promotional tile and store icon. Packaging includes the README screenshot in the store-assets ZIP automatically.

```bash
# Capture optional 1280×800 Inline and Side-by-Side views:
npm run store:images
```

The capture command uses `demo/store-preview.html` with the real bundled scripts/styles and fictitious data. Review the images for clipping before upload, then rebuild the packages. Use sample data in public images.

The promotional tile's source is `scripts/create-promo.py`; regenerating it requires Pillow and DejaVu Sans fonts. That script also copies the current extension icon into the store assets.

## Release checklist

1. Update manifest.json, package.json/package-lock.json, visible version labels, and CHANGELOG.md for the next extension release. Keep a published version's runtime immutable; cleanup alone does not require a new store upload.
2. Run the unit, package, and browser checks, then smoke-test the packaged extension in Chrome and Firefox as applicable.
3. Review [PRIVACY.md](PRIVACY.md) and the packaged [privacy.html](privacy.html) together after any data-handling change. Keep both copies consistent and publish the policy update.
4. Review the local `store-listing/LISTING.md`, `store-listing/PRIVACY-PRACTICES.md`, and current images.
5. Build the final packages. Upload the browser-specific ZIP and complete that store's listing and privacy declarations. The publisher completes any required account verification and certification.
6. After publication, update installation links and release notes with the actual store URLs. Attach distribution archives to the corresponding release if using GitHub Releases.

Version 1.0.3 was released on 22 October 2026. The publisher confirmed Chrome testing and publication; the public privacy policy was verified against the packaged copy.

## Source layout

- `content/`: History detection, sanitizer, diff engine, and styles.
- `shared/`, `background/`: custom-host validation and permission-aware script registration.
- `popup/`, `options/`: extension controls and per-site permission requests.
- `tests/`: unit, DOM, permission, archive, and browser regressions.
- `demo/`: interactive fixtures and sample-data previews.
- `docs/images/`: images displayed in the README.
- `scripts/`: local packaging and store-image tools, ignored by Git.
- `store-listing/`: local publication text and assets, ignored by Git.
