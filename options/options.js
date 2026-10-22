/** Configure display preferences and browser-approved custom servers. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  const sites = globalThis.AdoDiffSites;
  const storage = api.storage.sync || api.storage.local;
  const view = document.getElementById('optDefaultView');
  const focus = document.getElementById('optCollapseUnchanged');
  const input = document.getElementById('newDomainInput');
  const add = document.getElementById('btnAddDomain');
  const list = document.getElementById('domainList');
  const empty = document.getElementById('emptyDomainsMsg');
  const toast = document.getElementById('saveToast');
  let domains = [];

  function notify(message, error = false) {
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  async function activate() {
    const result = await api.runtime.sendMessage({ type: 'ado-diff:sync-sites' });
    if (!result?.ok) throw new Error('Site saved, but activation failed. Reload the extension and try again.');
  }

  async function requestSite(pattern) {
    // This call must remain in the click handler, before any asynchronous work.
    const granted = await api.permissions.request({ origins: [pattern] });
    if (!granted) { notify('Site access was not granted.'); return false; }
    if (!domains.includes(pattern)) domains.push(pattern);
    await storage.set({ customDomains: domains });
    await activate();
    await render();
    notify('Site connected. Refresh any already-open embedded work item frames.');
    return true;
  }

  async function render() {
    const permissions = await Promise.all(domains.map(pattern => api.permissions.contains({ origins: [pattern] })));
    list.querySelectorAll('.domain-item').forEach(element => element.remove());
    empty.style.display = domains.length ? 'none' : 'block';
    domains.forEach((pattern, index) => {
      const item = document.createElement('div');
      item.className = 'domain-item';
      const name = document.createElement('span');
      name.className = 'domain-name';
      name.textContent = pattern.replace(/\/\*$/, '') + (permissions[index] ? '' : ' — access needed');
      item.appendChild(name);
      if (!permissions[index]) {
        const grant = document.createElement('button');
        grant.type = 'button';
        grant.className = 'btn-grant-domain';
        grant.textContent = 'Grant access';
        grant.addEventListener('click', async () => {
          grant.disabled = true;
          try { await requestSite(pattern); }
          catch (error) { notify(error.message, true); }
          finally { grant.disabled = false; }
        });
        item.appendChild(grant);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-remove-domain';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          // Revoke access before dropping the saved entry, so failures are visible.
          const host = /^\w+:\/\/([^/]+)/.exec(pattern)?.[1];
          if (!host || !sites.isCloudHost(host)) await api.permissions.remove({ origins: [pattern] });
          domains = domains.filter(value => value !== pattern);
          await storage.set({ customDomains: domains });
          await activate();
          await render();
          notify('Site removed.');
        } catch (error) { notify(error.message, true); remove.disabled = false; }
      });
      item.appendChild(remove);
      list.appendChild(item);
    });
  }

  async function addDomain() {
    if (add.disabled || !input.value.trim()) return;
    add.disabled = true;
    try {
      const pattern = sites.normalizeDomain(input.value);
      if (sites.isCloudHost(new URL(pattern.replace(/\*$/, '')).hostname)) {
        notify('Azure DevOps cloud sites are already enabled.');
        return;
      }
      if (await requestSite(pattern)) input.value = '';
    } catch (error) { notify(error.message || 'Could not connect this site.', true); }
    finally { add.disabled = false; }
  }

  add.addEventListener('click', addDomain);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') addDomain(); });
  view.addEventListener('change', async () => {
    try { await storage.set({ defaultView: view.value }); notify('Preferences saved'); }
    catch { notify('Could not save preferences.', true); }
  });
  focus.addEventListener('change', async () => {
    try { await storage.set({ collapseUnchanged: focus.checked }); notify('Preferences saved'); }
    catch { notify('Could not save preferences.', true); }
  });
  api.permissions.onAdded.addListener(() => { render().catch(() => {}); });
  api.permissions.onRemoved.addListener(() => { render().catch(() => {}); });
  storage.get(['defaultView', 'collapseUnchanged', 'customDomains']).then(async settings => {
    if (['inline', 'split', 'original'].includes(settings.defaultView)) view.value = settings.defaultView;
    focus.checked = settings.collapseUnchanged === true;
    domains = sites.patterns(settings.customDomains);
    await render();
  }).catch(() => notify('Could not load preferences.', true));
});
