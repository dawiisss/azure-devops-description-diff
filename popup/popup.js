/**
 * Azure DevOps Description Diff - Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
  const enableToggle = document.getElementById('enableToggle');
  const focusToggle = document.getElementById('focusToggle');
  const segmentBtns = document.querySelectorAll('.segment-btn');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const optionsLink = document.getElementById('optionsLink');

  const storage = (typeof chrome !== 'undefined' && chrome.storage) ? (chrome.storage.sync || chrome.storage.local) : null;

  // Load saved preferences
  if (storage) {
    storage.get(['enabled', 'defaultView', 'collapseUnchanged'], (items) => {
      if (items) {
        if (typeof items.enabled === 'boolean') {
          enableToggle.checked = items.enabled;
        }
        if (typeof items.collapseUnchanged === 'boolean') {
          focusToggle.checked = items.collapseUnchanged;
        }
        if (items.defaultView) {
          updateSegmentActive(items.defaultView);
        }
      }
    });
  }

  // Ask our content script, rather than infer activation from a URL substring.
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (activeTab?.id !== undefined) {
        chrome.tabs.sendMessage(activeTab.id, { type: 'ado-diff:status' }, result => {
          const error = chrome.runtime.lastError;
          const active = !error && result?.supported && result.enabled;
          statusIndicator.classList.toggle('active', !!active);
          statusText.textContent = active ? 'Active on this site' :
            result?.supported ? 'Inline diffs disabled' : 'Open Azure DevOps or connect a site';
        });
      } else {
        statusText.textContent = 'Ready';
      }
    });
  } else {
    statusText.textContent = 'Ready';
  }

  function updateSegmentActive(viewMode) {
    segmentBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewMode);
    });
  }

  // Save enable toggle
  enableToggle.addEventListener('change', () => {
    if (storage) {
      storage.set({ enabled: enableToggle.checked });
    }
  });

  // Save focus changes toggle
  focusToggle.addEventListener('change', () => {
    if (storage) {
      storage.set({ collapseUnchanged: focusToggle.checked });
    }
  });

  // Save default view segment
  segmentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewMode = btn.dataset.view;
      updateSegmentActive(viewMode);
      if (storage) {
        storage.set({ defaultView: viewMode });
      }
    });
  });

  // Open options page
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../options/options.html');
    }
  });
});
