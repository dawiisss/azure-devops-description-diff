# Changelog

Changes to Azure DevOps Description Diff are recorded here.

## [1.0.3] - 2026-10-22

### Added

- Acceptance Criteria diffs alongside Description in native History blocks, table rows, and activity feeds.
- Recognition of the Acceptance Criteria display label, `AcceptanceCriteria` alias, and `Microsoft.VSTS.Common.AcceptanceCriteria` reference name.
- Field-specific toolbar titles, Copy labels and feedback, and empty-field messages.
- Independent controls when Description and Acceptance Criteria change in the same revision.
- This changelog in both the installable extension and reviewer source archives.
- Reproducible DOM tests using the supplied Description HTML and native History fixtures for both fields.
- `npm run test:unit` to run diff-engine and DOM checks without Chromium.

### Changed

- Shared field definitions drive detection and presentation for both supported fields.
- Popup, Options, and README text describe both fields and display version 1.0.3.
- Isolation tests use an unsupported field to verify that authored headings do not trigger unrelated diffs.

### Fixed

- Diff controls incorrectly appearing in the History field filter after a Description label was mistaken for revision content.
- Detection of native `.update-details .html-field-diff` revisions without a linked History tabpanel.
- Extraction of added, removed, and deleted `.html-field-value` bodies, including added-only and deleted-only revisions.
- Removal of native whole-value `ins`/`del` wrappers before computing word-level changes, while preserving authored formatting.
- Confusion between the outer field label and headings inside markdown content.
- Detection of nested revision values and a shared work-item main content wrapper blocking History scanning.
- Cross-field matching, hidden-label matching, and assumptions that arbitrary siblings were old/new values.
- Revision recomputation and restoration of original native value nodes.
- Popup and Options version labels that still displayed 1.0.0.

### Validation status

- Passed 12 diff-engine tests and 23 DOM tests for the current implementation.
- JavaScript syntax, whitespace, and package-content checks passed.
- Browser rendering and the authenticated Azure DevOps page remain unverified because Chromium cannot launch in the execution sandbox.

## [1.0.2] - Existing baseline

The project already used this version when this changelog was introduced. Its original release date and earlier version-by-version history have not been established.

### Existing features

- Description word-level diffs with Inline, Side-by-Side, and Original views.
- Focus Changes, Copy, change counters, theme support, and saved preferences.
- Azure DevOps cloud and configured on-premise hostname activation.
- Bundled DOMPurify sanitization and extension/source packaging.
