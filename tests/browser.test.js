const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { nativeField } = require('./fixtures/native-history');

const root = path.resolve(__dirname, '..');
let browser;

before(async () => {
  const executablePath = process.env.CHROMIUM_PATH ||
    (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ headless: true, executablePath });
});
after(async () => { if (browser) await browser.close(); });

function row(oldHtml = '<p>Old description</p>', newHtml = '<p>New description</p>') {
  return `<div role="row" id="description-row"><div>Description</div>
    <div class="old-value">${oldHtml}</div><div class="new-value">${newHtml}</div></div>`;
}

async function fixture(t, { html = row(), settings = {}, url = 'https://dev.azure.com/org/project/_workitems/edit/1', storage = true, beforeContent, linkedHistoryPanel = true } = {}) {
  const context = await browser.newContext({ colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'Content script must not throw in the browser');
  });
  await page.route('**/*', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <button id="details-tab" role="tab" aria-selected="false">Details</button>
      <button id="history-tab" role="tab" aria-selected="true" ${linkedHistoryPanel ? 'aria-controls="history"' : ''}>History</button>
      <div id="history" ${linkedHistoryPanel ? 'role="tabpanel"' : ''}>${html}</div>
    </body></html>`
  }));
  await page.goto(url);
  if (storage) {
    await page.evaluate(settings => {
      const values = { enabled: true, defaultView: 'inline', collapseUnchanged: false, customDomains: [], ...settings };
      const listeners = [];
      window.chrome = { storage: {
        sync: { get(keys, callback) { queueMicrotask(() => callback({ ...values })); } },
        onChanged: { addListener(listener) { listeners.push(listener); } }
      } };
      window.changeSettings = updates => {
        const changes = {};
        for (const [key, newValue] of Object.entries(updates)) {
          changes[key] = { oldValue: values[key], newValue };
          values[key] = newValue;
        }
        listeners.forEach(listener => listener(changes, 'sync'));
      };
    }, settings);
  }
  await page.addStyleTag({ path: path.join(root, 'content/styles.css') });
  await page.addScriptTag({ path: path.join(root, 'content/vendor/purify.js') });
  await page.addScriptTag({ path: path.join(root, 'content/htmldiff.js') });
  if (beforeContent) await beforeContent(page);
  await page.addScriptTag({ path: path.join(root, 'content/content.js') });
  return page;
}

test('description views strip active HTML, event handlers, styles, and unsafe URLs', async t => {
  const dangerous = `<a href="javascript:window.__unsafeDescription=true" onclick="window.__unsafeDescription=true">Unsafe link</a>
    <img src="/not-an-image" onerror="if(this.closest('.ado-diff-widget')) window.__unsafeDescription=true" alt="Example">
    <svg><a href="javascript:window.__unsafeDescription=true">SVG link</a></svg>
    <form><input name="__unsafeDescription"><button>Submit</button></form>`;
  const page = await fixture(t, { html: row('<p>Old description</p>',
    `<p style="color:red" onclick="window.__unsafeDescription=true">New <strong>formatted</strong> description</p>${dangerous}`) });
  await page.waitForSelector('.ado-diff-widget');
  const containers = page.locator('.ado-diff-inline-container, .ado-diff-split-pane-body');
  for (const container of await containers.all()) {
    assert.equal(await container.locator('script, style, svg, math, iframe, object, embed, form, input, button').count(), 0);
    assert.equal(await container.locator('[style], [onclick], [onerror], [name]').count(), 0);
    assert.equal(await container.locator('a[href^="javascript:"]').count(), 0);
  }
  const inline = page.locator('.ado-diff-inline-container');
  assert.equal(await inline.locator('strong').textContent(), 'formatted');
  assert.equal(await inline.locator('img').getAttribute('alt'), 'Example');
  await inline.locator('a').filter({ hasText: 'Unsafe link' }).click();
  await inline.locator('img').dispatchEvent('error');
  assert.equal(await page.evaluate(() => window.__unsafeDescription === true), false);
});

test('sanitizes diff engine output again before rendering and copying', async t => {
  const page = await fixture(t, { beforeContent: async page => {
    await page.evaluate(() => {
      const withViews = window.htmldiff.withViews;
      window.htmldiff.withViews = (...args) => {
        const views = withViews(...args);
        const injected = '<img src="/invalid" onerror="if(this.closest(\'.ado-diff-widget\')) window.__unsafeDiff=true">' +
          '<a href="javascript:window.__unsafeDiff=true" onclick="window.__unsafeDiff=true">Engine link</a>' +
          '<script>window.__unsafeDiff=true</script><iframe srcdoc="malicious"></iframe>';
        for (const key of ['diffHtml', 'leftHtml', 'rightHtml']) views[key] += injected;
        return views;
      };
      Object.defineProperty(navigator, 'clipboard', { value: {
        writeText: async text => { window.__copiedDescription = text; }
      } });
    });
  } });
  await page.waitForSelector('.ado-diff-widget');
  const containers = page.locator('.ado-diff-inline-container, .ado-diff-split-pane-body');
  assert.equal(await containers.locator('[onerror], [onclick], script, iframe, a[href^="javascript:"]').count(), 0);
  await page.locator('.ado-diff-action-btn').filter({ hasText: /^Copy$/ }).click();
  assert.equal(await page.evaluate(() => window.__copiedDescription), 'New descriptionEngine link');
  assert.equal(await page.locator('.ado-diff-action-btn').filter({ hasText: 'Copied!' }).count(), 1);
  assert.equal(await page.evaluate(() => window.__unsafeDiff === true), false);
});

test('preserves normal rich text and safe links in sanitized description views', async t => {
  const page = await fixture(t, { html: row('<p>Old description</p>',
    '<h2>New description</h2><p><strong>Bold</strong> <em>italic</em> <code>x &lt; y</code> ' +
    '<a href="https://example.com/docs" title="Documentation">Docs</a></p>' +
    '<table><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>') });
  await page.waitForSelector('.ado-diff-widget');
  const current = page.locator('.ado-diff-split-pane-body').nth(1);
  assert.equal(await current.locator('h2').textContent(), 'New description');
  assert.equal(await current.locator('strong').textContent(), 'Bold');
  assert.equal(await current.locator('em').textContent(), 'italic');
  assert.equal(await current.locator('code').textContent(), 'x < y');
  assert.equal(await current.locator('a').getAttribute('href'), 'https://example.com/docs');
  assert.equal(await current.locator('td').getAttribute('colspan'), '2');
});

test('recomputes reused revision rows and removes diffs when values become equal', async t => {
  const page = await fixture(t);
  await page.waitForSelector('.ado-diff-widget');
  await page.evaluate(() => {
    document.querySelector('.old-value').innerHTML = '<p>Previous revision</p>';
    document.querySelector('.new-value').innerHTML = '<p>Selected revision</p>';
  });
  await page.waitForFunction(() => document.querySelector('.ado-diff-inline-container')?.textContent.includes('Selected revision'));
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
  await page.evaluate(() => {
    document.querySelector('.old-value').innerHTML = '<p>Same revision</p>';
    document.querySelector('.new-value').innerHTML = '<p>Same revision</p>';
  });
  await page.waitForFunction(() => !document.querySelector('.ado-diff-widget'));
  assert.equal(await page.locator('.new-value').isVisible(), true);
});

test('recreates a widget removed by the host and handles direct text edits', async t => {
  const page = await fixture(t);
  await page.waitForSelector('.ado-diff-widget');
  await page.evaluate(() => document.querySelector('.ado-diff-widget').remove());
  await page.waitForSelector('.ado-diff-widget');
  await page.evaluate(() => document.querySelector('.new-value p').firstChild.data = 'Edited text');
  await page.waitForFunction(() => document.querySelector('.ado-diff-inline-container')?.textContent.includes('Edited text'));
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
});

test('restores nested feed values and preserves their original styles', async t => {
  const page = await fixture(t, { html: `<div class="history-item"><p>Changed description</p><section>
    <div class="old-value" style="display: inline-block"><p>Old</p></div>
    <div class="new-value" style="display: flex"><p>New</p></div>
    </section></div>` });
  await page.waitForSelector('.ado-diff-widget');
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  assert.equal(await page.locator('.ado-diff-widget').count(), 0);
  assert.deepEqual(await page.locator('.old-value, .new-value').evaluateAll(els => els.map(el => getComputedStyle(el).display)), ['inline-block', 'flex']);
  await page.evaluate(() => window.changeSettings({ enabled: true }));
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
  await page.locator('.ado-diff-btn').filter({ hasText: /^Original$/ }).click();
  assert.equal(await page.locator('.new-value').isVisible(), true);
});

test('custom domains activate and deactivate on already-open pages', async t => {
  const page = await fixture(t, { url: 'https://devops.internal/project/history' });
  assert.equal(await page.locator('.ado-diff-widget').count(), 0);
  await page.evaluate(() => window.changeSettings({ customDomains: ['*://devops.internal/*'] }));
  await page.waitForSelector('.ado-diff-widget');
  await page.evaluate(() => window.changeSettings({ customDomains: [] }));
  assert.equal(await page.locator('.ado-diff-widget').count(), 0);
  assert.equal(await page.locator('.new-value').isVisible(), true);
});

test('saved custom domains work on initial load without Azure-specific paths or markers', async t => {
  const page = await fixture(t, {
    url: 'https://devops.internal/project/history',
    settings: { customDomains: ['*://devops.internal/*'] }
  });
  await page.waitForSelector('.ado-diff-widget');
});

test('domain matching rejects lookalikes, URL substrings, and unrelated DOM markers', async t => {
  for (const url of [
    'https://dev.azure.com.attacker.invalid/demo',
    'https://notvisualstudio.com/_workitems',
    'https://devops.internal.attacker.invalid/project/history',
    'https://other.invalid/demo/testbed.html?next=dev.azure.com'
  ]) {
    const page = await fixture(t, { url, settings: { customDomains: ['*://devops.internal/*'] }, html: `<div data-is-focusable="true">${row()}</div>` });
    assert.equal(await page.locator('.ado-diff-widget').count(), 0, url);
  }
});

test('visualstudio subdomains and configured wildcard domains work', async t => {
  for (const url of ['https://org.visualstudio.com/project', 'https://team.devops.internal/project', 'https://devops.internal/project']) {
    const page = await fixture(t, { url, settings: { customDomains: ['*://*.devops.internal/*'] } });
    await page.waitForSelector('.ado-diff-widget');
  }
});

test('split views remove deleted list items and table rows', async t => {
  const page = await fixture(t, { html: row(
    '<ul><li>A</li><li>B</li></ul><table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>',
    '<ul><li>A</li></ul><table><tbody><tr><td>A</td></tr></tbody></table>'
  ) });
  await page.waitForSelector('.ado-diff-widget');
  const panes = page.locator('.ado-diff-split-pane-body');
  assert.equal(await panes.nth(0).locator('li').count(), 2);
  assert.equal(await panes.nth(1).locator('li').count(), 1);
  assert.equal(await panes.nth(0).locator('tr').count(), 2);
  assert.equal(await panes.nth(1).locator('tr').count(), 1);
});

test('split views remove inserted structure and preserve source ins/del formatting', async t => {
  const page = await fixture(t, { html: row(
    '<p>Use <del>obsolete</del> <ins>current</ins> old text.</p><ul><li>A</li></ul>',
    '<p>Use <del>obsolete</del> <ins>current</ins> new text.</p><ul><li>A</li><li>B</li></ul>'
  ) });
  await page.waitForSelector('.ado-diff-widget');
  assert.equal(await page.locator('.ado-diff-widget').count(), 1, 'Do not scan native strike formatting twice');
  const panes = page.locator('.ado-diff-split-pane-body');
  for (const pane of [panes.nth(0), panes.nth(1)]) {
    assert.equal(await pane.locator('del:not([data-operation-index])').textContent(), 'obsolete');
    assert.equal(await pane.locator('ins:not([data-operation-index])').textContent(), 'current');
  }
  assert.equal(await panes.nth(0).locator('li').count(), 1);
  assert.equal(await panes.nth(1).locator('li').count(), 2);
});

test('theme classes, data attributes, and system dark mode change widget colors', async t => {
  const page = await fixture(t);
  await page.waitForSelector('.ado-diff-widget');
  const background = () => page.locator('.ado-diff-widget').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.equal(await background(), 'rgb(255, 255, 255)');
  await page.evaluate(() => document.body.classList.add('theme-dark'));
  assert.equal(await background(), 'rgb(37, 37, 38)');
  await page.evaluate(() => { document.body.classList.remove('theme-dark'); document.documentElement.dataset.theme = 'dark'; });
  assert.equal(await background(), 'rgb(37, 37, 38)');
  await page.evaluate(() => delete document.documentElement.dataset.theme);
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await background(), 'rgb(37, 37, 38)');
});

test('saved view and focus changes update existing widgets in place', async t => {
  const page = await fixture(t, { html: row('<p>One</p><p>Two</p><p>Old</p>', '<p>One</p><p>Two</p><p>New</p>') });
  await page.waitForSelector('.ado-diff-widget');
  await page.evaluate(() => {
    window.savedWidget = document.querySelector('.ado-diff-widget');
    window.changeSettings({ collapseUnchanged: true, defaultView: 'split' });
  });
  assert.equal(await page.locator('.ado-diff-unchanged-hidden').count(), 2);
  assert.equal(await page.locator('.ado-diff-split-container').isVisible(), true);
  await page.evaluate(() => window.changeSettings({ defaultView: 'original', collapseUnchanged: false }));
  assert.equal(await page.locator('.ado-diff-unchanged-hidden').count(), 0);
  assert.equal(await page.locator('.new-value').isVisible(), true);
  assert.equal(await page.evaluate(() => document.querySelector('.ado-diff-widget') === window.savedWidget), true);
});

test('strikethrough feeds hide raw text, exclude labels, and restore actual text nodes', async t => {
  const page = await fixture(t, { html: '<div class="history-item">Description: <s>Previous description</s>New description</div>' });
  await page.waitForSelector('.ado-diff-widget');
  const content = await page.locator('.ado-diff-inline-container').textContent();
  assert.equal(content.includes('Description:'), false);
  assert.equal(await page.locator('.history-item').evaluate(el => el.innerText.startsWith('Description Diff')), true);
  await page.locator('.ado-diff-btn').filter({ hasText: /^Original$/ }).click();
  assert.equal(await page.locator('.ado-diff-source-text').last().isVisible(), true);
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  assert.equal(await page.locator('.ado-diff-source-text').count(), 0);
  assert.equal(await page.locator('.history-item').textContent(), 'Description: Previous descriptionNew description');
});

test('switching to Details restores originals and leaves editors untouched', async t => {
  const page = await fixture(t, { html: row() + `<div contenteditable="true" id="editor">${row()}</div>` });
  await page.waitForSelector('.ado-diff-widget');
  assert.equal(await page.locator('#editor .ado-diff-widget').count(), 0);
  await page.evaluate(() => {
    document.querySelector('#history-tab').setAttribute('aria-selected', 'false');
    document.querySelector('#details-tab').setAttribute('aria-selected', 'true');
  });
  await page.waitForFunction(() => !document.querySelector('.ado-diff-widget'));
  assert.equal(await page.locator('.ado-diff-hidden-raw').count(), 0);
});

test('table rows restore their original cells and remove generated diff cells', async t => {
  const page = await fixture(t, { html: '<table><tbody><tr><td>Description</td><td>Old</td><td>New</td></tr></tbody></table>' });
  await page.waitForSelector('.ado-diff-widget');
  assert.equal(await page.locator('.ado-diff-cell-td').getAttribute('colspan'), '2');
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  assert.equal(await page.locator('td').count(), 3);
  assert.equal(await page.locator('td').nth(2).isVisible(), true);
});

test('leaves Description filter options and neighbouring controls unchanged', async t => {
  const filters = `<div id="filters">
    <div role="listbox"><div role="option"><span>Description</span><span>Selected</span><span>Clear</span></div></div>
    <div role="menu"><div role="menuitemcheckbox"><span>Description</span><span>Checked</span><span>Remove</span></div></div>
    <div class="bolt-dropdown"><span>Description</span><span>Acceptance Criteria</span><span>Area Path</span></div>
    <div class="filter-choice"><span>Description</span><span>Acceptance Criteria</span><span>Area Path</span></div>
  </div>`;
  const page = await fixture(t, { html: filters + row(), beforeContent: async page => {
    await page.evaluate(() => { window.originalFilters = document.querySelector('#filters').innerHTML; });
  } });
  await page.waitForSelector('#description-row .ado-diff-widget');
  assert.equal(await page.locator('#filters .ado-diff-widget, #filters .ado-diff-hidden-raw').count(), 0);
  assert.equal(await page.locator('#filters').innerHTML(), await page.evaluate(() => window.originalFilters),
    'Filter markup must remain intact');
});

test('finds nested old/new values without treating the heading wrapper as a value', async t => {
  const page = await fixture(t, { html: `<section class="history-field-change" id="nested-change">
    <header><span>Description</span><button>Expand</button></header>
    <div class="history-field-values"><div><div class="old-value"><p>Previous nested value</p></div></div>
      <div><div class="new-value"><p>Current nested value</p></div></div></div>
    </section>` });
  await page.waitForSelector('#nested-change .ado-diff-widget', { timeout: 3000 });
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
  assert.equal(await page.locator('.ado-diff-inline-container').textContent(), 'PreviousCurrent nested value');
  assert.equal(await page.locator('#nested-change header').isVisible(), true);
  assert.equal(await page.locator('#nested-change .old-value').isVisible(), false);
  await page.locator('.ado-diff-btn').filter({ hasText: /^Original$/ }).click();
  assert.equal(await page.locator('#nested-change .old-value').isVisible(), true);
});

test('supports rich-text comparison value containers and empty description values', async t => {
  const page = await fixture(t, { html: `<section class="history-field-change">
    <h3>Description</h3><div class="comparison"><div class="html-diff-old"></div>
    <div class="html-diff-new"><p>First description</p></div></div></section>` });
  await page.waitForSelector('.ado-diff-widget', { timeout: 3000 });
  assert.equal(await page.locator('.ado-diff-inline-container ins').textContent(), 'First description');
  await page.evaluate(() => {
    document.querySelector('.html-diff-old').innerHTML = '<p>Last description</p>';
    document.querySelector('.html-diff-new').innerHTML = '';
  });
  await page.waitForFunction(() => document.querySelector('.ado-diff-inline-container del')?.textContent === 'Last description');
});

test('reconstructs complete revisions from unified native rich-text changes', async t => {
  const page = await fixture(t, { html: `<section class="history-field-change">
    <h3>Description</h3><div class="native-diff"><p>Shared <del>old</del><ins>new</ins> ending.</p></div>
    </section>` });
  await page.waitForSelector('.ado-diff-widget', { timeout: 3000 });
  const panes = page.locator('.ado-diff-split-pane-body');
  assert.equal(await panes.nth(0).textContent(), 'Shared old ending.');
  assert.equal(await panes.nth(1).textContent(), 'Shared new ending.');
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
});

test('ignores history list choices and values under a different field', async t => {
  const page = await fixture(t, { html: `<div class="history-item" id="unrelated">
    <div role="option"><span>Description</span></div>
    <section class="history-field-change"><h3>Repro Steps</h3>
      <div class="old-value"><p>Description of old criteria</p></div>
      <div class="new-value"><p>Description of new criteria</p></div></section>
    </div>` });
  // Trigger and await another complete scan without waiting for a nonexistent widget.
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  await page.evaluate(() => window.changeSettings({ enabled: true }));
  assert.equal(await page.locator('.ado-diff-widget, .ado-diff-hidden-raw').count(), 0);
});

test('does not infer revisions from arbitrary siblings or hidden Description labels', async t => {
  const page = await fixture(t, { html: `<section><span>Description</span><p>Summary</p><p>Metadata</p></section>
    <div role="row"><span hidden>Description</span><div>Old</div><div>New</div></div>` });
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  await page.evaluate(() => window.changeSettings({ enabled: true }));
  assert.equal(await page.locator('.ado-diff-widget, .ado-diff-hidden-raw').count(), 0);
});

test('processes active History inside the shared work-item form content', async t => {
  const page = await fixture(t, { html: `<div class="work-item-form-mainContent">${row()}</div>` });
  await page.waitForSelector('.ado-diff-widget', { timeout: 3000 });
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
});

test('discovers the observed update-details and html-field-diff wrappers without a linked tabpanel', async t => {
  // The outer wrappers and heading come from the reported page. The revision
  // body is a fixture: its exact markup is not visible in the supplied image.
  const page = await fixture(t, { linkedHistoryPanel: false, html: `<div class="v-scroll-auto">
    <div class="update-details flex-column"><div class="update-details-header flex-row">Revision</div>
      <div class="html-field-diff margin-bottom-16">
        <div class="font-size-ml font-weight-semibold margin-bottom-8">Description</div>
        <div class="old-value"><p>Previous fixture text</p></div>
        <div class="new-value"><p>Current fixture text</p></div>
      </div>
    </div></div>` });
  await page.waitForSelector('.html-field-diff .ado-diff-widget', { timeout: 3000 });
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
  await page.evaluate(() => {
    document.querySelector('#history-tab').setAttribute('aria-selected', 'false');
    document.querySelector('#details-tab').setAttribute('aria-selected', 'true');
  });
  await page.waitForFunction(() => !document.querySelector('.ado-diff-widget'));
  assert.equal(await page.locator('.ado-diff-hidden-raw').count(), 0);
});

test('keeps observed native field wrappers isolated from neighbouring rich-text fields', async t => {
  const page = await fixture(t, { linkedHistoryPanel: false, html: `<div class="update-details flex-column">
    <div class="html-field-diff" id="description-field"><div>Description</div><div>Unexpanded description</div></div>
    <div class="html-field-diff" id="criteria-field"><div>Repro Steps</div>
      <div class="old-value">Previous criteria</div><div class="new-value">Current criteria</div></div>
    </div>` });
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  await page.evaluate(() => window.changeSettings({ enabled: true }));
  assert.equal(await page.locator('.ado-diff-widget, .ado-diff-hidden-raw').count(), 0);
});

test('extracts native added/removed markdown values in their semantic order', async t => {
  const page = await fixture(t, { linkedHistoryPanel: false, html: `<div class="update-details flex-column">${nativeField({
    oldHtml: '<h3>Description</h3><p>Keep old wording.</p>',
    newHtml: '<h3>Description</h3><p>Keep new wording.</p>'
  })}</div>` });
  await page.waitForSelector('.html-field-diff .ado-diff-widget', { timeout: 3000 });
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
  const panes = page.locator('.ado-diff-split-pane-body');
  assert.equal(await panes.nth(0).textContent(), 'DescriptionKeep old wording.');
  assert.equal(await panes.nth(1).textContent(), 'DescriptionKeep new wording.');
  assert.equal(await panes.nth(0).locator('ins, del').count(), 1, 'Only the changed word is marked');
  assert.equal(await panes.nth(1).locator('ins, del').count(), 1, 'Whole-value native wrappers are removed');
  assert.equal(await page.locator('.html-field-value').first().isVisible(), false);
  await page.locator('.ado-diff-btn').filter({ hasText: /^Original$/ }).click();
  assert.equal(await page.locator('.html-field-value').first().isVisible(), true);
  assert.equal(await page.locator('.html-field-value > ins').count(), 1);
  assert.equal(await page.locator('.html-field-value > del').count(), 1);
});

test('handles initial added-only and deleted-only native descriptions', async t => {
  for (const value of [
    { newHtml: '<h3>Description</h3><p>First value</p>' },
    { oldHtml: '<h3>Description</h3><p>Last value</p>', oldClass: 'deleted' }
  ]) {
    const page = await fixture(t, { linkedHistoryPanel: false, html: `<div class="update-details">${nativeField(value)}</div>` });
    await page.waitForSelector('.ado-diff-widget', { timeout: 3000 });
    assert.equal(await page.locator('.ado-diff-widget').count(), 1);
    const content = page.locator('.ado-diff-inline-container');
    assert.equal(await content.locator(value.newHtml ? 'del' : 'ins').count(), 0);
    assert.equal(await content.locator('h3').count(), 1, 'Keep the authored heading once');
  }
});

test('preserves authored ins/del inside native markdown and ignores other field headings', async t => {
  const authored = '<h3>Description</h3><p>Use <del>obsolete</del> <ins>current</ins> ';
  const page = await fixture(t, { html: `<div class="update-details">${nativeField({
    oldHtml: authored + 'old text.</p>', newHtml: authored + 'new text.</p>'
  })}${nativeField({ label: 'Repro Steps', oldHtml: authored + 'old criteria.</p>', newHtml: authored + 'new criteria.</p>' })}</div>` });
  await page.waitForSelector('.ado-diff-widget', { timeout: 3000 });
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
  const panes = page.locator('.ado-diff-split-pane-body');
  for (const pane of [panes.nth(0), panes.nth(1)]) {
    assert.equal(await pane.locator('del:not([data-operation-index])').textContent(), 'obsolete');
    assert.equal(await pane.locator('ins:not([data-operation-index])').textContent(), 'current');
  }
  assert.equal(await page.locator('.html-field-diff').nth(1).locator('.ado-diff-hidden-raw').count(), 0);
});

test('recomputes and restores reused native revision blocks', async t => {
  const page = await fixture(t, { html: `<div class="update-details">${nativeField({ oldHtml: '<p>Old text</p>', newHtml: '<p>New text</p>' })}</div>` });
  await page.waitForSelector('.ado-diff-widget', { timeout: 3000 });
  await page.evaluate(() => {
    document.querySelector('.added .markdown-content').innerHTML = '<p>Selected revision</p>';
  });
  await page.waitForFunction(() => document.querySelector('.ado-diff-inline-container')?.textContent.includes('Selected revision'));
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  assert.equal(await page.locator('.ado-diff-widget, .ado-diff-hidden-raw').count(), 0);
  assert.equal(await page.locator('.added .markdown-content').textContent(), 'Selected revision');
});

test('Acceptance Criteria and Description have separately labelled native controls', async t => {
  const page = await fixture(t, { linkedHistoryPanel: false, html: `<div class="update-details">${nativeField({
    oldHtml: '<p>Old description</p>', newHtml: '<p>New description</p>'
  })}${nativeField({ label: 'Acceptance Criteria', oldHtml: '<p>Allow five attempts</p>', newHtml: '<p>Allow three attempts</p>' })}</div>` });
  await page.waitForFunction(() => document.querySelectorAll('.ado-diff-widget').length === 2);
  const widgets = page.locator('.ado-diff-widget');
  assert.deepEqual(await widgets.locator('.ado-diff-title-badge').allTextContents(), ['Description Diff', 'Acceptance Criteria Diff']);
  const criteria = widgets.nth(1);
  assert.equal(await criteria.locator('.ado-diff-inline-container del').textContent(), 'five');
  assert.equal(await criteria.locator('.ado-diff-inline-container ins').textContent(), 'three');
  await criteria.locator('.ado-diff-btn').filter({ hasText: /^Original$/ }).click();
  assert.equal(await page.locator('.html-field-diff').nth(1).locator('.added').isVisible(), true);
  assert.equal(await page.locator('.html-field-diff').nth(0).locator('.added').isVisible(), false);
});

test('standalone demo updates when switching revisions without extension storage', async t => {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(root, 'demo/testbed.html')).href);
  await page.waitForSelector('.ado-diff-widget');
  await page.click('#switchRevBtn');
  await page.waitForFunction(() => document.querySelector('.ado-diff-inline-container')?.textContent.includes('Initial rough draft'));
  assert.equal(await page.locator('.ado-diff-widget').count(), 1);
});
