# Changelog

Changes to Azure DevOps Description Diff are recorded here.

## [Unreleased]

### Maintenance

- Consolidate development and release instructions in CONTRIBUTING.md while preserving the README's installation guide and Firefox button.
- Keep local store-listing resources out of Git and README screenshots in docs/images/.
- Separate unit, browser, and archive test commands; build fresh archives automatically for package checks.
- Exclude temporary files from packages and future Git additions, and remove unused draft artwork from the project.

## [1.0.3] - 2026-10-22

### Added

- Separate Chrome and Firefox packages, optional per-site custom-server access, and permission-aware background registration.
- A packaged privacy policy, Chrome Web Store listing/privacy text, promotional image, and screenshot capture command.
- Reproducible Python packaging and archive validation.
- Acceptance Criteria diffs alongside Description in native History blocks, table rows, and activity feeds.
- Recognition of the Acceptance Criteria display label, `AcceptanceCriteria` alias, and `Microsoft.VSTS.Common.AcceptanceCriteria` reference name.
- Field-specific toolbar titles, Copy labels and feedback, and empty-field messages.
- Independent controls when Description and Acceptance Criteria change in the same revision.
- This changelog in both the installable extension and reviewer source archives.
- Reproducible DOM tests using the supplied Description HTML and native History fixtures for both fields.
- `npm run test:unit` to run diff-engine, DOM, site-access, and archive checks without Chromium.

### Changed

- Shared field definitions drive detection and presentation for both supported fields.
- Popup, Options, and README text describe both fields and display version 1.0.3.
- Isolation tests use an unsupported field to verify that authored headings do not trigger unrelated diffs.

### Fixed

- Required all-sites access replaced by Azure DevOps cloud hosts and optional custom hosts; legacy broad grants are removed on update.
- Permission revocation now restores original content in already-running pages.
- Popup activation status now asks the actual content script instead of matching URL substrings.
- Options no longer claims zero data handling; it explains browser sync and embedded images.
- Diff controls incorrectly appearing in the History field filter after a Description label was mistaken for revision content.
- Detection of native `.update-details .html-field-diff` revisions without a linked History tabpanel.
- Extraction of added, removed, and deleted `.html-field-value` bodies, including added-only and deleted-only revisions.
- Removal of native whole-value `ins`/`del` wrappers before computing word-level changes, while preserving authored formatting.
- Confusion between the outer field label and headings inside markdown content.
- Detection of nested revision values and a shared work-item main content wrapper blocking History scanning.
- Cross-field matching, hidden-label matching, and assumptions that arbitrary siblings were old/new values.
- Revision recomputation and restoration of original native value nodes.
- Popup and Options version labels that still displayed 1.0.0.

## [1.0.2] - Existing baseline

The project already used this version when this changelog was introduced. Its original release date and earlier version-by-version history have not been established.

### Existing features

- Description word-level diffs with Inline, Side-by-Side, and Original views.
- Focus Changes, Copy, change counters, theme support, and saved preferences.
- Azure DevOps cloud and configured on-premise hostname activation.
- Bundled DOMPurify sanitization and extension/source packaging.
