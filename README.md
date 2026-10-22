# Azure DevOps Description Diff

[![Install on Firefox](https://img.shields.io/badge/Install_on-Firefox-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/azure-devops-description-diff/)

A lightweight browser extension for **Google Chrome**, **Mozilla Firefox**, **Microsoft Edge**, and **Brave** that adds **inline diffs** for **Description** and **Acceptance Criteria** in Azure DevOps Work Item History.

The extension highlights word-level additions and deletions in each supported field. Each revision has independent Inline, Side-by-Side, Original, Focus Changes, and Copy controls.

**Current version:** 1.0.3

**Released:** 22 October 2026
**Firefox add-on ID:** `ado-description-diff@dawiisss`

## ✨ Features

- **⚡ Inline Word-by-Word Diffs**: Added text is highlighted in soft green (`+`), removed text is highlighted in soft red with strikethrough (`-`).
- **🔀 Three View Modes on Every Change**:
  - **Inline Diff** (Default): Unified view showing additions and deletions in-place.
  - **Side-by-Side (Split)**: Synchronized previous vs. current columns with highlights.
  - **Original**: Instant 1-click toggle back to the native Azure DevOps view.
- **🔍 "Focus Changes" Mode**: For long multi-paragraph descriptions where only a few words changed, collapses unchanged sections so you can immediately see the modification.
- **📋 One-Click Copy**: Copy the updated field text directly to clipboard.
- **📊 Change Statistics**: Displays word change counters (`+15`, `-3`) for each supported field revision.
- **🌙 Dark Mode & Light Mode**: Automatically adapts to Azure DevOps themes.
- **🔄 Live Revision Switching**: Smoothly re-computes diffs when clicking through revisions in the left timeline.
- **🔒 Local Diff Processing**: Computes description diffs in your browser without uploading descriptions or sending telemetry or analytics. See the privacy details below for browser sync and embedded resources.
- **🏢 On-Premise Support**: Works out-of-the-box on `dev.azure.com` and `*.visualstudio.com`, with support for custom on-premise TFS / Azure DevOps Server hostnames via the Options page.

---

## 🔒 Privacy & Data Handling

- **No changes to Azure DevOps data:** The extension only changes how the History page is displayed in your browser. It does not edit or save work items, descriptions, revisions, or comments. Disabling it restores the original display.
- **No field uploads or telemetry:** Description and Acceptance Criteria text is processed locally to calculate diffs. The extension has no upload, telemetry, or analytics calls.
- **Preferences may sync:** Settings and custom hostnames use the browser's extension sync storage when available, falling back to local extension storage. They may sync through your browser account. Field text is not stored in either storage area.
- **Embedded resources may make requests:** Images in generated views can load from their original servers. The original Azure DevOps description can also contain embedded resources. Local diff processing does not mean zero network activity.
- **Safe rich-text rendering:** Bundled DOMPurify sanitizes descriptions before diffing and sanitizes the generated views again before display or copying. Formatting, tables, links, and images are supported; scripts, event handlers, unsafe URLs, inline styles, forms, SVG, and embedded frames are removed from the generated views.
- **Clipboard access is user-initiated:** Clicking **Copy** writes the current description text to your clipboard.

---

## 🚀 Installation Guide

### Install on Mozilla Firefox

1. Open the [Azure DevOps Description Diff listing on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/azure-devops-description-diff/) in Firefox.
2. Click **Add to Firefox** and approve the requested permissions.
3. Open an Azure DevOps work item and click the **History** tab.

### Load a development copy

The steps below load a development copy. Download or clone the project first. The bundled sanitizer is included in `content/vendor/`, so loading the extension or opening the demo does not require installing development dependencies.

#### Option A: Google Chrome / Microsoft Edge / Brave

1. Open your browser and navigate to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click **Load unpacked** in the top-left corner.
4. Select the project folder containing `manifest.json`.
5. The extension is now active! Open any Azure DevOps work item and click the **History** tab.

---

#### Option B: Mozilla Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select either `manifest.json` or `dist/ado-description-diff.zip` from this directory.
4. The extension will appear in your installed temporary extensions list and start functioning immediately.

Firefox removes temporary add-ons when it restarts. For a permanent installation in standard Firefox, use the [published Firefox Add-ons release](https://addons.mozilla.org/en-US/firefox/addon/azure-devops-description-diff/). The ZIP produced by this project's packaging command is unsigned until Mozilla signs it. The manifest declares Firefox 109 or later; the automated browser tests currently run in Chromium rather than Firefox.

---

## Browser Permissions

- **Storage:** Saves whether the extension is enabled, the default view, Focus Changes preference, and custom hostnames. Browser sync storage is preferred when available.
- **Access to all websites:** Content scripts are registered on all websites to support custom on-premise hostnames. The diff interface activates only on `dev.azure.com`, `*.visualstudio.com`, configured custom hosts, and the local demo. The broad permission does not mean description text is uploaded.
- **Firefox data declaration:** The manifest contains `data_collection_permissions.required: ["none"]`. There are no description-upload, telemetry, or analytics calls; browser-managed preference sync and embedded images are described above.

---

## 🖥️ Live Preview & Demo

You can test and preview the extension's behavior without opening Azure DevOps:

Open `demo/testbed.html` in any web browser:
```bash
# In Firefox:
firefox demo/testbed.html

# Or in Chrome / default browser:
xdg-open demo/testbed.html
```

The testbed includes:
- A realistic mock of the Azure DevOps Work Item History tab.
- Revisions with Description changes.
- Dark mode toggle button.
- Revision switcher button (simulates clicking between Revision 2 and Revision 3).

---

## 🧪 Running Tests

The 12 diff-engine tests verify formatting, split-view structure, entities, and performance. The 23 DOM tests run the actual sanitizer and content script against native markup for both fields, including initial creation, removal, operation ordering, authored formatting, revision reuse, restoration, filter/editor isolation, clipboard output, and unsafe HTML. All 35 passed for this update. Browser tests additionally cover rendered visibility, preferences, domain activation, themes, and the standalone demo; those tests require Chromium and could not run in the sandbox.

Use Node.js 20 or later and npm to install the development dependencies.

```bash
npm ci
# Install Chromium for Playwright if a system /usr/bin/chromium is unavailable:
npx playwright install chromium
npm test
# Run diff-engine and DOM tests without Chromium:
npm run test:unit
# Run only the diff-engine unit tests:
node --test tests/diff.test.js
```

Set `CHROMIUM_PATH` to use a Chromium executable in another location. The standalone demo also works without extension storage.

---

## 📁 Project Structure

```
azure-devops-description-diff/
├── manifest.json              # WebExtension Manifest V3 (Chrome & Firefox compatible)
├── content/
│   ├── htmldiff.js            # Standalone word-level HTML diff engine
│   ├── content.js             # Azure DevOps History tab observer & widget injector
│   ├── vendor/                # Official DOMPurify release and license
│   └── styles.css             # Light & dark theme diff styling and layout
├── popup/
│   ├── popup.html             # Toolbar popup interface
│   ├── popup.js               # Status check & quick preferences
│   └── popup.css              # Fluent UI popup styling
├── options/
│   ├── options.html           # Options page for custom on-premise domains
│   ├── options.js             # Storage logic for custom domains
│   └── options.css            # Options page layout
├── icons/
│   ├── icon16.png             # 16x16 icon
│   ├── icon32.png             # 32x32 icon
│   ├── icon48.png             # 48x48 icon
│   ├── icon128.png            # 128x128 icon
│   └── icon.svg               # Vector icon source
├── demo/
│   └── testbed.html           # Standalone interactive preview page
├── tests/
│   ├── browser.test.js        # Content-script browser regression tests
│   ├── dom.test.js            # Native History DOM regression tests
│   ├── fixtures/              # Shared native History markup fixtures
│   └── diff.test.js           # Diff-engine unit tests
├── package-extension.js       # Distribution packaging script
├── package.json               # Development scripts
├── package-lock.json          # Exact dependency versions for reproducible builds
├── README.md                  # Setup, features, privacy, and testing
├── CHANGELOG.md               # Version history and release notes
├── LICENSE                    # MIT license for the project
├── SUBMISSION.md              # Version notes and reviewer instructions
└── dist/
    ├── ado-description-diff.zip        # Installable extension package for signing
    └── ado-description-diff-source.zip # Reviewer sources, dependencies, and demo
```

---

## ⚙️ Custom On-Premise Domains

If your organization hosts an internal Azure DevOps Server or Team Foundation Server (TFS):

1. Click the extension icon in your browser toolbar and click **Custom Domains & Options** (or right-click the extension icon and choose **Options**).
2. Enter a hostname or HTTP/HTTPS URL (e.g. `tfs.mycompany.com` or `https://devops.internal`). Only the hostname is used; URL paths are ignored.
3. Click **Add Domain**.
4. The extension will automatically activate on your internal instance.

Domain changes apply to already-open tabs. Removing a domain restores the original view. Activation matches hostnames rather than URL substrings; no background injection is required.

---

## 📜 License

Licensed under the [MIT License](LICENSE).

Copyright (c) 2026 dawiisss (K3to).

Bundled third-party components retain their own licenses:
- **htmldiff.js**: Copyright (c) 2014 The Next Web, based on work by Ian Bicking. Licensed under the [MIT License](https://opensource.org/licenses/MIT).
- **DOMPurify**: Copyright (c) 2024 Mario Heiderich, Cure53. Licensed under the [Apache-2.0 License](content/vendor/DOMPurify-LICENSE) (or MPL-2.0).

