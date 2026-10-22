/* Register custom servers only after the browser grants access to that server. */
if (!globalThis.AdoDiffSites && typeof importScripts === 'function') importScripts('../shared/sites.js');

(function () {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  const sites = globalThis.AdoDiffSites;
  const storage = api.storage.sync || api.storage.local;
  let queue = Promise.resolve();

  async function refreshRunningTabs() {
    const tabs = await api.tabs.query({});
    await Promise.allSettled(tabs.map(tab => api.tabs.sendMessage(tab.id, { type: 'ado-diff:recheck-access' })));
  }

  async function injectOpenTabs(patterns) {
    if (!patterns.length) return;
    const tabs = await api.tabs.query({ url: patterns });
    await Promise.allSettled(tabs.map(async tab => {
      try {
        await api.tabs.sendMessage(tab.id, { type: 'ado-diff:recheck-access' });
        return; // The existing content script receives storage updates in place.
      } catch { /* An already-open custom server may not yet have a content script. */ }
      const target = { tabId: tab.id };
      await api.scripting.insertCSS({ target, files: sites.css });
      await api.scripting.executeScript({ target, files: sites.js });
    }));
  }

  async function synchronize(inject) {
    const settings = await storage.get('customDomains');
    const patterns = [];
    for (const pattern of sites.patterns(settings.customDomains)) {
      if (await api.permissions.contains({ origins: [pattern] })) patterns.push(pattern);
    }
    const desired = patterns.map(sites.registration);
    const registered = (await api.scripting.getRegisteredContentScripts())
      .filter(script => script.id.startsWith(sites.prefix));
    const desiredIds = new Set(desired.map(script => script.id));
    const stale = registered.filter(script => !desiredIds.has(script.id));
    if (stale.length) await api.scripting.unregisterContentScripts({ ids: stale.map(script => script.id) });
    // Updating existing registrations also refreshes paths after an extension update.
    const currentIds = new Set(registered.map(script => script.id));
    const updates = desired.filter(script => currentIds.has(script.id));
    const additions = desired.filter(script => !currentIds.has(script.id));
    if (updates.length) await api.scripting.updateContentScripts(updates);
    if (additions.length) await api.scripting.registerContentScripts(additions);
    if (inject) await injectOpenTabs(patterns);
    await refreshRunningTabs();
    return { ok: true, registeredSites: patterns.length };
  }

  function schedule(inject = false) {
    queue = queue.catch(() => {}).then(() => synchronize(inject));
    queue.catch(error => console.error('[ADO Diff] Site access update failed:', error.message));
    return queue;
  }

  api.runtime.onInstalled.addListener(() => {
    // An upgrade from the old all-sites build must not preserve broad grants.
    queue = queue.catch(() => {}).then(async () => {
      const granted = await api.permissions.getAll();
      const broad = (granted.origins || []).filter(origin => ['<all_urls>', 'http://*/*', 'https://*/*', '*://*/*'].includes(origin));
      if (broad.length) await api.permissions.remove({ origins: broad });
    });
    schedule(true);
  });
  api.runtime.onStartup.addListener(() => { schedule(); });
  api.permissions.onAdded.addListener(() => { schedule(true); });
  api.permissions.onRemoved.addListener(() => { schedule(); });
  api.storage.onChanged.addListener((changes, area) => {
    if (changes.customDomains && area === (api.storage.sync ? 'sync' : 'local')) schedule(true);
  });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id) return false;
    if (message?.type === 'ado-diff:sync-sites') {
      schedule(true).then(respond, () => respond({ ok: false }));
      return true;
    }
    if (message?.type === 'ado-diff:host-access') {
      let origin;
      try {
        const url = new URL(sender.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
        origin = url.protocol + '//' + url.hostname + '/*';
      } catch { respond({ allowed: false }); return false; }
      api.permissions.contains({ origins: [origin] }).then(
        allowed => respond({ allowed }), () => respond({ allowed: false }));
      return true;
    }
    return false;
  });
  schedule();
})();
