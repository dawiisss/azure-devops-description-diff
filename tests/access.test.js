const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const sites = require('../shared/sites');
const root = path.resolve(__dirname, '..');

function event() {
  const listeners = [];
  return { addListener(listener) { listeners.push(listener); }, fire(...args) { listeners.forEach(fn => fn(...args)); }, listeners };
}

function apiFixture({ domains = [], grants = [] } = {}) {
  const saved = { customDomains: domains };
  const granted = new Set(grants);
  const registered = new Map();
  const calls = [];
  const api = {
    storage: { sync: { get: async () => ({ ...saved }), set: async values => { Object.assign(saved, values); } }, onChanged: event() },
    permissions: {
      contains: async ({ origins }) => origins.every(pattern => granted.has(pattern) || sites.cloudMatches.includes(pattern)),
      request: async options => { calls.push(['request', options]); options.origins.forEach(value => granted.add(value)); return true; },
      getAll: async () => ({ origins: [...granted] }),
      remove: async ({ origins }) => { calls.push(['remove', origins]); origins.forEach(value => granted.delete(value)); return true; },
      onAdded: event(), onRemoved: event()
    },
    scripting: {
      getRegisteredContentScripts: async () => [...registered.values()],
      registerContentScripts: async scripts => { scripts.forEach(script => registered.set(script.id, script)); },
      updateContentScripts: async scripts => { scripts.forEach(script => registered.set(script.id, script)); },
      unregisterContentScripts: async ({ ids }) => { ids.forEach(id => registered.delete(id)); },
      insertCSS: async details => { calls.push(['css', details]); },
      executeScript: async details => { calls.push(['js', details]); }
    },
    tabs: { query: async () => [{ id: 7 }], sendMessage: async (...args) => { calls.push(['message', ...args]); throw new Error('No receiver'); } },
    runtime: { id: 'test-extension', onInstalled: event(), onStartup: event(), onMessage: event(), sendMessage: async () => ({ ok: true }) }
  };
  return { api, saved, granted, registered, calls };
}

function background(settings) {
  const fixture = apiFixture(settings);
  const errors = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background/background.js'), 'utf8'), {
    chrome: fixture.api, AdoDiffSites: sites, URL,
    console: { error: (...args) => errors.push(args.join(' ')) }
  });
  const send = (message, sender = { id: 'test-extension', url: 'https://devops.internal/project' }) => new Promise(resolve => {
    const listener = fixture.api.runtime.onMessage.listeners[0];
    const pending = listener(message, sender, resolve);
    if (!pending) resolve(undefined);
  });
  return { ...fixture, send, errors };
}

test('custom server normalization narrows access to one scheme and hostname', () => {
  assert.equal(sites.normalizeDomain('DevOps.Internal/project?id=123'), 'https://devops.internal/*');
  assert.equal(sites.normalizeDomain('http://tfs.internal:8080/collection'), 'http://tfs.internal/*');
  for (const input of ['ftp://server', 'https://user:password@server', 'https://*.example.com']) {
    assert.throws(() => sites.normalizeDomain(input));
  }
  for (const pattern of ['<all_urls>', '*://*/*', 'https://*/*', 'http://*/*', '*://user@server/*']) {
    assert.equal(sites.normalizePattern(pattern), null);
  }
  assert.equal(sites.normalizePattern('*://*.internal.example/*'), '*://*.internal.example/*');
});

test('default manifest grants cloud sites only and declares custom hosts as optional', () => {
  const manifest = require('../manifest.json');
  assert.deepEqual(manifest.host_permissions, sites.cloudMatches);
  assert.deepEqual(manifest.content_scripts[0].matches, sites.cloudMatches);
  assert.ok(manifest.permissions.includes('scripting'));
  assert.equal(manifest.permissions.includes('tabs'), false);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.ok(manifest.optional_host_permissions.includes('https://*/*'));
});

test('saved or synced custom sites are not registered without an actual browser grant', async () => {
  const fixture = background({ domains: ['https://devops.internal/*', '<all_urls>'] });
  await fixture.send({ type: 'ado-diff:sync-sites' });
  assert.equal(fixture.registered.size, 0);
  assert.equal(fixture.calls.filter(call => call[0] === 'js').length, 0);
  assert.deepEqual(fixture.errors, []);
});

test('a granted custom host registers bundled scripts and activates already-open top frames', async () => {
  const fixture = background({ domains: ['https://devops.internal/*'], grants: ['https://devops.internal/*'] });
  await fixture.send({ type: 'ado-diff:sync-sites' });
  const registrations = [...fixture.registered.values()];
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].matches, ['https://devops.internal/*']);
  assert.deepEqual(registrations[0].js, sites.js);
  assert.equal(registrations[0].allFrames, true);
  assert.ok(fixture.calls.some(call => call[0] === 'css'));
  assert.ok(fixture.calls.some(call => call[0] === 'js'));
});

test('revocation removes registration and asks running scripts to recheck access', async () => {
  const pattern = 'https://devops.internal/*';
  const fixture = background({ domains: [pattern], grants: [pattern] });
  await fixture.send({ type: 'ado-diff:sync-sites' });
  fixture.granted.delete(pattern);
  fixture.api.permissions.onRemoved.fire({ origins: [pattern] });
  await fixture.send({ type: 'ado-diff:sync-sites' });
  assert.equal(fixture.registered.size, 0);
  assert.ok(fixture.calls.some(call => call[0] === 'message' && call[2].type === 'ado-diff:recheck-access'));
  assert.equal((await fixture.send({ type: 'ado-diff:host-access' })).allowed, false);
});

test('updates remove legacy all-sites grants while retaining the configured sites for opt-in', async () => {
  const fixture = background({ domains: ['https://devops.internal/*'], grants: ['<all_urls>', 'https://*/*'] });
  fixture.api.runtime.onInstalled.fire({ reason: 'update' });
  await fixture.send({ type: 'ado-diff:sync-sites' });
  assert.equal(fixture.granted.size, 0);
  assert.deepEqual(fixture.saved.customDomains, ['https://devops.internal/*']);
  assert.equal(fixture.registered.size, 0);
});

test('host checks validate the sender and its actual scheme and hostname', async () => {
  const fixture = background({ domains: [], grants: ['https://devops.internal/*'] });
  assert.equal((await fixture.send({ type: 'ado-diff:host-access' })).allowed, true);
  assert.equal((await fixture.send({ type: 'ado-diff:host-access' }, { id: 'test-extension', url: 'http://devops.internal/' })).allowed, false);
  assert.equal(await fixture.send({ type: 'ado-diff:sync-sites' }, { id: 'other-extension' }), undefined);
  assert.equal((await fixture.send({ type: 'ado-diff:host-access' }, { id: 'test-extension', url: 'file:///etc/passwd' })).allowed, false);
});

async function optionsFixture(t, settings = {}) {
  const fixture = apiFixture(settings);
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'options/options.html'), 'utf8'), {
    url: 'https://extension.invalid/options/options.html', runScripts: 'outside-only'
  });
  dom.window.chrome = fixture.api;
  dom.window.eval(fs.readFileSync(path.join(root, 'shared/sites.js'), 'utf8'));
  dom.window.eval(fs.readFileSync(path.join(root, 'options/options.js'), 'utf8'));
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  t.after(() => dom.window.close());
  return { ...fixture, window: dom.window, document: dom.window.document };
}

async function until(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Expected permission UI update did not occur');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('connecting a site requests permission synchronously from the user click, then saves only that origin', async t => {
  const fixture = await optionsFixture(t);
  let inClick = false;
  fixture.api.permissions.request = async ({ origins }) => {
    assert.equal(inClick, true, 'Permission prompts require the original user gesture');
    assert.deepEqual([...origins], ['https://devops.internal/*']);
    origins.forEach(origin => fixture.granted.add(origin));
    return true;
  };
  fixture.document.querySelector('#newDomainInput').value = 'devops.internal/project';
  inClick = true;
  fixture.document.querySelector('#btnAddDomain').click();
  inClick = false;
  await until(() => fixture.document.querySelector('.domain-item'));
  assert.deepEqual([...fixture.saved.customDomains], ['https://devops.internal/*']);
});

test('declined site access neither saves a site nor enables injection', async t => {
  const fixture = await optionsFixture(t);
  fixture.api.permissions.request = async () => false;
  fixture.document.querySelector('#newDomainInput').value = 'devops.internal';
  fixture.document.querySelector('#btnAddDomain').click();
  await until(() => fixture.document.querySelector('#saveToast').textContent.includes('not granted'));
  assert.deepEqual(fixture.saved.customDomains, []);
  assert.equal(fixture.document.querySelector('.domain-item'), null);
});

test('saved sites without a local browser grant show Grant access and can be removed', async t => {
  const fixture = await optionsFixture(t, { domains: ['https://devops.internal/*'] });
  assert.equal(fixture.document.querySelector('.btn-grant-domain').textContent, 'Grant access');
  fixture.document.querySelector('.btn-remove-domain').click();
  await until(() => !fixture.document.querySelector('.domain-item'));
  assert.deepEqual([...fixture.saved.customDomains], []);
  assert.ok(fixture.calls.some(call => call[0] === 'remove'));
});
