const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { nativeField } = require('./fixtures/native-history');

const root = path.resolve(__dirname, '..');
const scripts = ['content/vendor/purify.js', 'content/htmldiff.js', 'content/content.js']
  .map(name => fs.readFileSync(path.join(root, name), 'utf8'));

function fixture(t, html, { tabs = true } = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(`<!doctype html><html><body>${tabs ? '<button role="tab" aria-selected="true" id="history-tab">History</button><button role="tab" aria-selected="false" id="details-tab">Details</button>' : ''}
    <div class="update-details flex-column">${html}</div></body></html>`, {
    url: 'https://dev.azure.com/org/project/_workitems/edit/1',
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console
  });
  const { window } = dom;
  // jsdom has no layout. Supply visibility geometry only; these tests verify
  // the actual DOM extraction/sanitization and lifecycle, not visual rendering.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get() {
    for (let el = this; el; el = el.parentElement) {
      if (el.hidden || window.getComputedStyle(el).display === 'none') return 0;
    }
    return 1;
  } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get() { return this.offsetWidth; } });
  const listeners = [];
  const values = { enabled: true, defaultView: 'inline', collapseUnchanged: false, customDomains: [] };
  window.chrome = { storage: {
    sync: { get(keys, callback) { callback({ ...values }); } },
    onChanged: { addListener(listener) { listeners.push(listener); } }
  } };
  const changeSettings = updates => {
    const changes = {};
    for (const [key, newValue] of Object.entries(updates)) {
      changes[key] = { oldValue: values[key], newValue };
      values[key] = newValue;
    }
    listeners.forEach(listener => listener(changes, 'sync'));
  };
  t.after(() => {
    changeSettings({ enabled: false });
    window.close();
    assert.deepEqual(errors, [], 'Content script must not throw');
  });
  const sourceNodes = [...window.document.querySelectorAll('.html-field-value')];
  const sourceMarkup = sourceNodes.map(node => node.outerHTML);
  scripts.forEach(script => window.eval(script));
  return { document: window.document, window, changeSettings, sourceNodes, sourceMarkup };
}

async function until(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Expected DOM update did not occur');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('native markdown revisions are extracted by operation and unwrapped once', t => {
  const { document } = fixture(t, nativeField({
    oldHtml: '<h3>Description</h3><p>Keep old wording.</p>',
    newHtml: '<h3>Description</h3><p>Keep new wording.</p>'
  }));
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 1);
  const panes = document.querySelectorAll('.ado-diff-split-pane-body');
  assert.equal(panes[0].textContent, 'DescriptionKeep old wording.');
  assert.equal(panes[1].textContent, 'DescriptionKeep new wording.');
  assert.equal(panes[0].querySelectorAll('ins, del').length, 1);
  assert.equal(panes[1].querySelectorAll('ins, del').length, 1);
  assert.equal(panes[0].querySelector('del').textContent, 'old');
  assert.equal(panes[1].querySelector('ins').textContent, 'new');
});

for (const [name, html, operation] of [
  ['initial creation', nativeField({ newHtml: '<h3>Description</h3><p>First value</p>' }), 'ins'],
  ['removed value', nativeField({ oldHtml: '<h3>Description</h3><p>Last value</p>' }), 'del'],
  ['deleted value', nativeField({ oldHtml: '<h3>Description</h3><p>Last value</p>', oldClass: 'deleted' }), 'del'],
  ['provided truncated HTML', '<div class="html-field-diff"><div class="font-size-ml font-weight-semibold margin-bottom-8">Description</div><div class="added html-field-value padding-vertical-4 padding-horizontal-8 margin-bottom-8"><ins><div class="markdown-content markdown-editor-preview markdown-preview markdown-preview-checkbox-indent"><h3 id="user-content-description">Description</h3>\n<p>\n</div></del></div></div>', 'ins']
]) {
  test(`native ${name} displays one description widget`, t => {
    const { document } = fixture(t, html);
    assert.equal(document.querySelectorAll('.ado-diff-widget').length, 1);
    const inline = document.querySelector('.ado-diff-inline-container');
    assert.equal(inline.querySelectorAll('h3').length, 1);
    assert.ok(inline.querySelector(operation));
    assert.equal(inline.querySelector(operation === 'ins' ? 'del' : 'ins'), null);
  });
}

test('authored insertion and deletion formatting survives native wrapper extraction', t => {
  const authored = '<h3>Description</h3><p>Use <del>obsolete</del> <ins>current</ins> ';
  const { document } = fixture(t, nativeField({ oldHtml: authored + 'old text.</p>', newHtml: authored + 'new text.</p>' }));
  for (const pane of document.querySelectorAll('.ado-diff-split-pane-body')) {
    assert.equal(pane.querySelector('del:not([data-operation-index])').textContent, 'obsolete');
    assert.equal(pane.querySelector('ins:not([data-operation-index])').textContent, 'current');
  }
});

test('field filters, editors, and Description headings inside other fields stay intact', t => {
  const { document } = fixture(t, `<div role="listbox"><div role="option">${nativeField({ newHtml: '<p>Filter</p>' })}</div></div>
    <div contenteditable="true">${nativeField({ newHtml: '<p>Editor</p>' })}</div>
    ${nativeField({ label: 'Repro Steps', oldHtml: '<h3>Description</h3><p>Old criteria</p>', newHtml: '<h3>Description</h3><p>New criteria</p>' })}
    ${nativeField({ oldHtml: '<p>Old text</p>', newHtml: '<p>New text</p>' })}`);
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 1);
  assert.equal(document.querySelectorAll('[role="listbox"] .ado-diff-hidden-raw, [contenteditable] .ado-diff-hidden-raw').length, 0);
  assert.equal(document.querySelectorAll('.html-field-diff')[2].querySelector('.ado-diff-hidden-raw'), null);
});

test('Original mode and disabling preserve the actual native source nodes', t => {
  const { document, changeSettings, sourceNodes, sourceMarkup } = fixture(t, nativeField({ oldHtml: '<p>Old</p>', newHtml: '<p>New</p>' }));
  [...document.querySelectorAll('.ado-diff-btn')].find(button => button.textContent === 'Original').click();
  assert.ok(sourceNodes.every(node => !node.classList.contains('ado-diff-hidden-raw')));
  changeSettings({ enabled: false });
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 0);
  assert.deepEqual([...document.querySelectorAll('.html-field-value')], sourceNodes);
  assert.deepEqual(sourceNodes.map(node => node.outerHTML), sourceMarkup);
  changeSettings({ enabled: true });
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 1);
});

test('reused native values recompute and equal values restore the original', async t => {
  const { document } = fixture(t, nativeField({ oldHtml: '<p>Old text</p>', newHtml: '<p>New text</p>' }));
  document.querySelector('.added .markdown-content').innerHTML = '<p>Selected revision</p>';
  await until(() => document.querySelector('.ado-diff-inline-container')?.textContent.includes('Selected revision'));
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 1);
  document.querySelector('.removed .markdown-content').innerHTML = '<p>Selected revision</p>';
  await until(() => !document.querySelector('.ado-diff-widget'));
  assert.equal(document.querySelectorAll('.ado-diff-hidden-raw').length, 0);
});

test('switching to Details restores native history and switching back remounts it', async t => {
  const { document } = fixture(t, nativeField({ oldHtml: '<p>Old</p>', newHtml: '<p>New</p>' }));
  document.querySelector('#history-tab').setAttribute('aria-selected', 'false');
  document.querySelector('#details-tab').setAttribute('aria-selected', 'true');
  await until(() => !document.querySelector('.ado-diff-widget'));
  assert.equal(document.querySelectorAll('.ado-diff-hidden-raw').length, 0);
  document.querySelector('#history-tab').setAttribute('aria-selected', 'true');
  document.querySelector('#details-tab').setAttribute('aria-selected', 'false');
  await until(() => document.querySelector('.ado-diff-widget'));
});

test('observed native history wrappers activate without tab markup', t => {
  const { document } = fixture(t, nativeField({ oldHtml: '<p>Old</p>', newHtml: '<p>New</p>' }), { tabs: false });
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 1);
});

test('unsupported native bodies do not infer revisions from authored strike formatting', t => {
  const { document } = fixture(t, '<div class="html-field-diff"><div>Description</div><div class="html-field-value"><div class="markdown-content"><p>Use <del>old</del> formatting.</p></div></div></div>');
  assert.equal(document.querySelectorAll('.ado-diff-widget, .ado-diff-hidden-raw').length, 0);
});

test('native generated descriptions remain sanitized', t => {
  const { document } = fixture(t, nativeField({ oldHtml: '<p>Old</p>', newHtml: '<p onclick="alert(1)" style="color:red">New</p><a href="javascript:alert(1)">Unsafe</a><img src="/image" onerror="alert(1)"><script>alert(1)</script>' }));
  assert.equal(document.querySelectorAll('.ado-diff-widget [onclick], .ado-diff-widget [onerror], .ado-diff-inline-container [style], .ado-diff-widget a[href^="javascript:"], .ado-diff-widget script').length, 0);
});

test('Description and Acceptance Criteria have independent native diff widgets', t => {
  const { document, changeSettings } = fixture(t,
    nativeField({ oldHtml: '<p>Old description</p>', newHtml: '<p>New description</p>' }) +
    nativeField({ label: 'Acceptance Criteria', oldHtml: '<p>Allow five attempts</p>', newHtml: '<p>Allow three attempts</p>' }));
  const widgets = [...document.querySelectorAll('.ado-diff-widget')];
  assert.equal(widgets.length, 2);
  assert.deepEqual(widgets.map(widget => widget.querySelector('.ado-diff-title-badge').textContent),
    ['Description Diff', 'Acceptance Criteria Diff']);
  assert.deepEqual(widgets.map(widget => widget.dataset.adoDiffField),
    ['System.Description', 'Microsoft.VSTS.Common.AcceptanceCriteria']);
  const criteria = widgets[1];
  assert.equal(criteria.querySelector('.ado-diff-inline-container del').textContent, 'five');
  assert.equal(criteria.querySelector('.ado-diff-inline-container ins').textContent, 'three');
  [...criteria.querySelectorAll('.ado-diff-btn')].find(button => button.textContent === 'Original').click();
  const fields = document.querySelectorAll('.html-field-diff');
  assert.equal(fields[1].querySelectorAll('.ado-diff-hidden-raw').length, 0);
  assert.equal(fields[0].querySelectorAll('.ado-diff-hidden-raw').length, 2);
  changeSettings({ enabled: false });
  assert.equal(document.querySelectorAll('.ado-diff-widget, .ado-diff-hidden-raw').length, 0);
});

for (const [name, values, operation] of [
  ['creation', { newHtml: '<h3>Acceptance Criteria</h3><p>First criteria</p>' }, 'ins'],
  ['clearing', { oldHtml: '<h3>Acceptance Criteria</h3><p>Previous criteria</p>' }, 'del']
]) {
  test(`Acceptance Criteria ${name} uses the correct field label`, t => {
    const { document } = fixture(t, nativeField({ label: 'Acceptance Criteria', ...values }));
    const widget = document.querySelector('.ado-diff-widget');
    assert.equal(widget.querySelector('.ado-diff-title-badge').textContent, 'Acceptance Criteria Diff');
    assert.ok(widget.querySelector('.ado-diff-inline-container ' + operation));
    assert.equal(widget.querySelector('.ado-diff-inline-container ' + (operation === 'ins' ? 'del' : 'ins')), null);
  });
}

test('Acceptance Criteria works in table rows and through its canonical field reference', t => {
  const { document } = fixture(t,
    '<div class="work-item-history-control"><table><tbody><tr><td>Acceptance Criteria</td><td>Old table criteria</td><td>New table criteria</td></tr></tbody></table>' +
    '<div class="field-change" data-field-reference-name="Microsoft.VSTS.Common.AcceptanceCriteria"><div class="old-value">Old metadata criteria</div><div class="new-value">New metadata criteria</div></div></div>');
  const widgets = [...document.querySelectorAll('.ado-diff-widget')];
  assert.equal(widgets.length, 2);
  assert.ok(widgets.every(widget => widget.querySelector('.ado-diff-title-badge').textContent === 'Acceptance Criteria Diff'));
  assert.ok(widgets[0].closest('td.ado-diff-cell-td'));
  assert.equal(widgets[1].querySelectorAll('.ado-diff-split-pane-body')[1].textContent, 'New metadata criteria');
});

for (const [name, html] of [
  ['changed heading', '<div class="history-item"><p>Changed Acceptance Criteria</p><div class="old-value">Old criteria</div><div class="new-value">New criteria</div></div>'],
  ['plain-text prefix', '<div class="history-item">Acceptance Criteria: <s>Old criteria</s>New criteria</div>'],
  ['reference-name prefix', '<div class="history-item">Microsoft.VSTS.Common.AcceptanceCriteria: <s>Old criteria</s>New criteria</div>']
]) {
  test(`Acceptance Criteria legacy feed supports ${name}`, t => {
    const { document } = fixture(t, html);
    const widget = document.querySelector('.ado-diff-widget');
    assert.ok(widget);
    assert.equal(widget.querySelector('.ado-diff-title-badge').textContent, 'Acceptance Criteria Diff');
    assert.equal(widget.querySelector('.ado-diff-split-pane-body').textContent, 'Old criteria');
    assert.equal(widget.querySelectorAll('.ado-diff-split-pane-body')[1].textContent, 'New criteria');
    assert.equal(widget.querySelector('.ado-diff-inline-container').textContent.includes('Acceptance Criteria:'), false);
  });
}

test('Acceptance Criteria copy uses current sanitized content and field-specific feedback', async t => {
  const { document, window } = fixture(t, nativeField({ label: 'Acceptance Criteria',
    oldHtml: '<p>Old criteria</p>', newHtml: '<p>New criteria</p><script>unsafe()</script>' }));
  let copied;
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  const button = [...document.querySelectorAll('.ado-diff-action-btn')].find(button => button.textContent === 'Copy');
  assert.equal(button.title, 'Copy new acceptance criteria to clipboard');
  button.click();
  await until(() => copied !== undefined && document.querySelector('.ado-diff-toast'));
  assert.equal(copied, 'New criteria');
  assert.equal(document.querySelector('.ado-diff-toast').textContent, 'Acceptance Criteria copied to clipboard');
});

test('Acceptance Criteria filter choices and Details editors stay untouched', t => {
  const html = nativeField({ label: 'Acceptance Criteria', oldHtml: '<p>Old criteria</p>', newHtml: '<p>New criteria</p>' });
  const { document } = fixture(t, `<div role="listbox"><div role="option">${html}</div></div>
    <div class="work-item-form-details">${html}</div>${html}`);
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 1);
  assert.equal(document.querySelectorAll('[role="listbox"] .ado-diff-widget, .work-item-form-details .ado-diff-widget').length, 0);
});

test('Acceptance Criteria revision updates preserve the separate Description widget', async t => {
  const { document } = fixture(t,
    nativeField({ oldHtml: '<p>Old description</p>', newHtml: '<p>New description</p>' }) +
    nativeField({ label: 'Acceptance Criteria', oldHtml: '<p>Old criteria</p>', newHtml: '<p>New criteria</p>' }));
  const descriptionWidget = document.querySelector('.ado-diff-widget');
  const criteriaField = document.querySelectorAll('.html-field-diff')[1];
  criteriaField.querySelector('.added .markdown-content').innerHTML = '<p>Selected criteria revision</p>';
  await until(() => criteriaField.querySelector('.ado-diff-inline-container')?.textContent.includes('Selected criteria revision'));
  assert.equal(document.querySelector('.ado-diff-widget'), descriptionWidget);
  assert.equal(document.querySelectorAll('.ado-diff-widget').length, 2);
  assert.equal(criteriaField.querySelector('.ado-diff-title-badge').textContent, 'Acceptance Criteria Diff');
});
