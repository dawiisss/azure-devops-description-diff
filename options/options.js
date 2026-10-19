/**
 * Azure DevOps Description Diff - Options Page Script
 */

document.addEventListener('DOMContentLoaded', () => {
  const optDefaultView = document.getElementById('optDefaultView');
  const optCollapseUnchanged = document.getElementById('optCollapseUnchanged');
  const newDomainInput = document.getElementById('newDomainInput');
  const btnAddDomain = document.getElementById('btnAddDomain');
  const domainList = document.getElementById('domainList');
  const emptyDomainsMsg = document.getElementById('emptyDomainsMsg');
  const saveToast = document.getElementById('saveToast');

  const storage = (typeof chrome !== 'undefined' && chrome.storage) ? (chrome.storage.sync || chrome.storage.local) : null;

  let currentCustomDomains = [];

  // Show toast notification
  function showToast(msg = 'Preferences saved') {
    saveToast.textContent = msg;
    saveToast.classList.add('show');
    setTimeout(() => {
      saveToast.classList.remove('show');
    }, 2000);
  }

  // Load preferences
  if (storage) {
    storage.get(['defaultView', 'collapseUnchanged', 'customDomains'], (items) => {
      if (items) {
        if (items.defaultView) {
          optDefaultView.value = items.defaultView;
        }
        if (typeof items.collapseUnchanged === 'boolean') {
          optCollapseUnchanged.checked = items.collapseUnchanged;
        }
        if (Array.isArray(items.customDomains)) {
          currentCustomDomains = items.customDomains;
        }
      }
      renderDomainList();
    });
  }

  // Save default view change
  optDefaultView.addEventListener('change', () => {
    if (storage) {
      storage.set({ defaultView: optDefaultView.value }, () => {
        showToast();
      });
    }
  });

  // Save focus changes toggle
  optCollapseUnchanged.addEventListener('change', () => {
    if (storage) {
      storage.set({ collapseUnchanged: optCollapseUnchanged.checked }, () => {
        showToast();
      });
    }
  });

  // Render domain list
  function renderDomainList() {
    domainList.querySelectorAll('.domain-item').forEach(el => el.remove());

    if (currentCustomDomains.length === 0) {
      emptyDomainsMsg.style.display = 'block';
      return;
    }

    emptyDomainsMsg.style.display = 'none';

    currentCustomDomains.forEach((domain, index) => {
      const item = document.createElement('div');
      item.className = 'domain-item';

      const span = document.createElement('span');
      span.className = 'domain-name';
      span.textContent = domain;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove-domain';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        removeDomain(index);
      });

      item.appendChild(span);
      item.appendChild(removeBtn);
      domainList.appendChild(item);
    });
  }

  // Add custom domain
  function addDomain() {
    let raw = newDomainInput.value.trim();
    if (!raw) return;

    // Normalize domain
    try {
      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = 'https://' + raw;
      }
      const url = new URL(raw);
      const originPattern = `*://${url.hostname}/*`;

      if (!currentCustomDomains.includes(originPattern)) {
        currentCustomDomains.push(originPattern);
        if (storage) {
          storage.set({ customDomains: currentCustomDomains }, () => {
            newDomainInput.value = '';
            renderDomainList();
            showToast('Domain added successfully');
          });
        }
      } else {
        alert('This domain is already in the list.');
      }
    } catch (e) {
      alert('Invalid URL or domain format. Please enter a valid host, e.g. tfs.company.com');
    }
  }

  // Remove custom domain
  function removeDomain(index) {
    currentCustomDomains.splice(index, 1);
    if (storage) {
      storage.set({ customDomains: currentCustomDomains }, () => {
        renderDomainList();
        showToast('Domain removed');
      });
    }
  }

  btnAddDomain.addEventListener('click', addDomain);
  newDomainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addDomain();
    }
  });
});
