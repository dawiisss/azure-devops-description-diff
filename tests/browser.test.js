const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

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

async function fixture(t, { html = row(), settings = {}, url = 'https://dev.azure.com/org/project/_workitems/edit/1', storage = true, beforeContent } = {}) {
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
      <button id="history-tab" role="tab" aria-selected="true" aria-controls="history">History</button>
      <div id="history" role="tabpanel">${html}</div>
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
