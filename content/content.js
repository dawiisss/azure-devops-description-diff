/**
 * ==========================================================================
 * Azure DevOps Description History Diff - Universal Content Script v1.0.2
 * ==========================================================================
 * Works across all Azure DevOps versions (Cloud, Server, On-Premise, TFS)
 * Uses multi-strategy DOM detection within the active History tab.
 */

(function () {
  'use strict';

  // Prevent multiple injections in same frame
  if (window.__ADO_DESCRIPTION_DIFF_V102_INITIALIZED__) {
    return;
  }
  window.__ADO_DESCRIPTION_DIFF_V102_INITIALIZED__ = true;

  // Match supported hosts exactly; DOM markers and URL substrings are not an allowlist.
  function isAzureDevOps() {
    const host = window.location.hostname.toLowerCase();
    const protocol = window.location.protocol;
    // Keep the standalone demo available without enabling arbitrary web pages.
    const localDemo = window.location.pathname.endsWith('/demo/testbed.html') &&
      (protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(host));
    if (localDemo) return true;
    if (!['http:', 'https:'].includes(protocol)) return false;
    if (host === 'dev.azure.com' || host.endsWith('.visualstudio.com')) return true;
    return config.customDomains.some(pattern => {
      if (typeof pattern !== 'string') return false;
      const match = /^\*:\/\/([^/]+)\/\*$/.exec(pattern.toLowerCase());
      if (!match) return false;
      const domain = match[1];
      if (domain.startsWith('*.')) {
        return host === domain.slice(2) || host.endsWith('.' + domain.slice(2));
      }
      return host === domain;
    });
  }

  // Configuration state
  let config = {
    enabled: true,
    defaultView: 'inline', // 'inline' | 'split' | 'original'
    collapseUnchanged: false,
    customDomains: []
  };
  let configLoaded = false;
  const processedDiffs = new Map();
  const widgetControls = new WeakMap();

  // Static icon definitions; construct SVG nodes without parsing HTML.
  const ICONS = {
    "diff": {
      "attributes": {
        "class": "ado-diff-title-icon",
        "viewBox": "0 0 16 16",
        "width": "16",
        "height": "16",
        "fill": "currentColor"
      },
      "paths": [
        {
          "fill-rule": "evenodd",
          "d": "M8.75 1.5a.75.75 0 0 0-.75.75v2.25H5.75a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0V6h2.25a.75.75 0 0 0 0-1.5H9.5V2.25A.75.75 0 0 0 8.75 1.5ZM3.75 10.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"
        }
      ]
    },
    "copy": {
      "attributes": {
        "viewBox": "0 0 16 16",
        "width": "12",
        "height": "12",
        "fill": "currentColor"
      },
      "paths": [
        {
          "d": "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
        },
        {
          "d": "M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
        }
      ]
    },
    "focus": {
      "attributes": {
        "viewBox": "0 0 16 16",
        "width": "12",
        "height": "12",
        "fill": "currentColor"
      },
      "paths": [
        {
          "d": "M1 2.75C1 1.784 1.784 1 2.75 1h10.5C14.216 1 15 1.784 15 2.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM4 5.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 5.5Zm0 5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 10.5Z"
        }
      ]
    }
  };

  function createIcon(name) {
    const definition = ICONS[name];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [attribute, value] of Object.entries(definition.attributes)) {
      svg.setAttribute(attribute, value);
    }
    for (const attributes of definition.paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      for (const [attribute, value] of Object.entries(attributes)) {
        path.setAttribute(attribute, value);
      }
      svg.appendChild(path);
    }
    return svg;
  }

  // Load preferences from browser storage
  function loadConfig() {
    const storage = (typeof chrome !== 'undefined' && chrome.storage) ? (chrome.storage.sync || chrome.storage.local) : null;
    if (storage) {
      storage.get(['enabled', 'defaultView', 'collapseUnchanged', 'customDomains'], (items) => {
        if (items) {
          if (typeof items.enabled === 'boolean') config.enabled = items.enabled;
          if (['inline', 'split', 'original'].includes(items.defaultView)) config.defaultView = items.defaultView;
          if (typeof items.collapseUnchanged === 'boolean') config.collapseUnchanged = items.collapseUnchanged;
          if (Array.isArray(items.customDomains)) config.customDomains = items.customDomains;
        }
        configLoaded = true;
        updateActivation();
      });
    } else {
      configLoaded = true;
      updateActivation();
    }
  }

  // Storage listener
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      const storageArea = chrome.storage.sync ? 'sync' : 'local';
      if (areaName && areaName !== storageArea) return;
      if (changes.enabled) config.enabled = changes.enabled.newValue !== false;
      if (changes.defaultView) config.defaultView = ['inline', 'split', 'original'].includes(changes.defaultView.newValue) ? changes.defaultView.newValue : 'inline';
      if (changes.collapseUnchanged) config.collapseUnchanged = changes.collapseUnchanged.newValue === true;
      if (changes.customDomains) config.customDomains = Array.isArray(changes.customDomains.newValue) ? changes.customDomains.newValue : [];
      for (const { widget } of processedDiffs.values()) {
        const controls = widgetControls.get(widget);
        if (changes.defaultView) controls.applyMode(config.defaultView);
        if (changes.collapseUnchanged) controls.applyFocusChanges(config.collapseUnchanged);
      }
      updateActivation();
    });
  }

  /**
   * Fast string hash for change fingerprinting
   */
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  // Only rich-text formatting and passive resources belong in a description diff.
  // DOMPurify also rejects event handlers and unsafe URL protocols. Apply it both
  // before diffing and to the engine's output before inserting any DOM nodes.
  const DESCRIPTION_HTML_OPTIONS = {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'del', 'ins', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2',
      'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th',
      'td', 'caption', 'colgroup', 'col', 'a', 'img', 'hr', 'sub', 'sup',
      'dl', 'dt', 'dd', 'mark', 'small', 'q', 'abbr', 'time', 'wbr',
      'figure', 'figcaption'
    ],
    ALLOWED_ATTR: [
      'class', 'href', 'title', 'src', 'alt', 'width', 'height', 'colspan',
      'rowspan', 'scope', 'align', 'dir', 'lang', 'start'
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false
  };

  function sanitizeFieldHtml(html) {
    return DOMPurify.sanitize(html || '', DESCRIPTION_HTML_OPTIONS).trim();
  }

  function descriptionFragment(html) {
    return DOMPurify.sanitize(html || '', {
      ...DESCRIPTION_HTML_OPTIONS,
      // The engine uses this marker to distinguish its highlights from source ins/del.
      ALLOWED_ATTR: [...DESCRIPTION_HTML_OPTIONS.ALLOWED_ATTR, 'data-operation-index'],
      RETURN_DOM_FRAGMENT: true
    });
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function appendDescription(container, html, emptyLabel) {
    const fragment = descriptionFragment(html);
    if (!fragment.hasChildNodes()) fragment.appendChild(createElement('i', '', emptyLabel));
    container.appendChild(fragment);
  }

  /**
   * Extracts statistics from diff HTML
   */
  function computeDiffStats(diffHtml) {
    const doc = descriptionFragment(diffHtml);
    
    let addedWords = 0;
    let deletedWords = 0;

    doc.querySelectorAll('ins.ado-diff-highlight, ins.diff-class').forEach(el => {
      const text = el.textContent.trim();
      if (text) addedWords += text.split(/\s+/).filter(Boolean).length;
    });

    doc.querySelectorAll('del.ado-diff-highlight, del.diff-class').forEach(el => {
      const text = el.textContent.trim();
      if (text) deletedWords += text.split(/\s+/).filter(Boolean).length;
    });

    return {
      addedWords,
      deletedWords,
      hasChanges: (addedWords > 0 || deletedWords > 0)
    };
  }

  /**
   * Creates the diff widget element
   */
  function createDiffWidget(oldHtml, newHtml, onModeChange) {
    const diffEngine = window.htmldiff || (typeof htmldiff === 'function' ? htmldiff : null);
    if (!diffEngine) {
      console.warn('[ADO History Diff] htmldiff engine not found');
      return null;
    }

    const { diffHtml, leftHtml, rightHtml } = diffEngine.withViews(oldHtml, newHtml, 'ado-diff-highlight');
    const stats = computeDiffStats(diffHtml);

    const widget = document.createElement('div');
    widget.className = 'ado-diff-widget';

    // Header Toolbar
    const header = document.createElement('div');
    header.className = 'ado-diff-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'ado-diff-header-left';
    
    const titleBadge = createElement('div', 'ado-diff-title-badge');
    titleBadge.append(createIcon('diff'), createElement('span', '', 'Description Diff'));
    const statsBadges = createElement('div', 'ado-diff-stats');
    if (stats.hasChanges) {
      if (stats.addedWords > 0) {
        const badge = createElement('span', 'ado-diff-badge-ins', `+${stats.addedWords}`);
        badge.title = `${stats.addedWords} words added`;
        statsBadges.appendChild(badge);
      }
      if (stats.deletedWords > 0) {
        const badge = createElement('span', 'ado-diff-badge-del', `-${stats.deletedWords}`);
        badge.title = `${stats.deletedWords} words removed`;
        statsBadges.appendChild(badge);
      }
    } else {
      statsBadges.appendChild(createElement('span', 'ado-diff-badge-nochange', 'No text changes'));
    }
    headerLeft.append(titleBadge, statsBadges);

    const headerRight = document.createElement('div');
    headerRight.className = 'ado-diff-header-right';

    const btnGroup = document.createElement('div');
    btnGroup.className = 'ado-diff-btn-group';

    const btnInline = document.createElement('button');
    btnInline.className = 'ado-diff-btn' + (config.defaultView === 'inline' ? ' active' : '');
    btnInline.textContent = 'Inline';
    btnInline.title = 'Show unified inline diff';

    const btnSplit = document.createElement('button');
    btnSplit.className = 'ado-diff-btn' + (config.defaultView === 'split' ? ' active' : '');
    btnSplit.textContent = 'Side-by-Side';
    btnSplit.title = 'Show side-by-side comparison';

    const btnOriginal = document.createElement('button');
    btnOriginal.className = 'ado-diff-btn' + (config.defaultView === 'original' ? ' active' : '');
    btnOriginal.textContent = 'Original';
    btnOriginal.title = 'Show native Azure DevOps view';

    btnGroup.appendChild(btnInline);
    btnGroup.appendChild(btnSplit);
    btnGroup.appendChild(btnOriginal);

    const btnFocus = document.createElement('button');
    btnFocus.className = 'ado-diff-action-btn' + (config.collapseUnchanged ? ' active' : '');
    btnFocus.append(createIcon('focus'), createElement('span', '', 'Focus Changes'));
    btnFocus.title = 'Collapse long unchanged paragraphs';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'ado-diff-action-btn';
    const copyLabel = createElement('span', '', 'Copy');
    btnCopy.append(createIcon('copy'), copyLabel);
    btnCopy.title = 'Copy new description to clipboard';

    headerRight.appendChild(btnGroup);
    headerRight.appendChild(btnFocus);
    headerRight.appendChild(btnCopy);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    widget.appendChild(header);

    // Body
    const content = document.createElement('div');
    content.className = 'ado-diff-content';

    const inlineContainer = document.createElement('div');
    inlineContainer.className = 'ado-diff-inline-container';
    appendDescription(inlineContainer, diffHtml, '(Empty description)');

    const splitContainer = document.createElement('div');
    splitContainer.className = 'ado-diff-split-container';
    splitContainer.style.display = 'none';

    for (const [label, html] of [['Previous Version', leftHtml], ['Current Version', rightHtml]]) {
      const pane = createElement('div', 'ado-diff-split-pane');
      const paneHeader = createElement('div', 'ado-diff-split-pane-header', label);
      const paneBody = createElement('div', 'ado-diff-split-pane-body');
      appendDescription(paneBody, html, '(Empty)');
      pane.append(paneHeader, paneBody);
      splitContainer.appendChild(pane);
    }

    content.appendChild(inlineContainer);
    content.appendChild(splitContainer);
    widget.appendChild(content);

    function applyMode(mode) {
      btnInline.classList.toggle('active', mode === 'inline');
      btnSplit.classList.toggle('active', mode === 'split');
      btnOriginal.classList.toggle('active', mode === 'original');

      if (mode === 'inline') {
        content.style.display = 'block';
        inlineContainer.style.display = 'block';
        splitContainer.style.display = 'none';
        btnFocus.style.display = 'inline-flex';
        onModeChange(false);
      } else if (mode === 'split') {
        content.style.display = 'block';
        inlineContainer.style.display = 'none';
        splitContainer.style.display = 'flex';
        btnFocus.style.display = 'none';
        onModeChange(false);
      } else if (mode === 'original') {
        content.style.display = 'none';
        btnFocus.style.display = 'none';
        onModeChange(true);
      }
    }

    btnInline.addEventListener('click', () => applyMode('inline'));
    btnSplit.addEventListener('click', () => applyMode('split'));
    btnOriginal.addEventListener('click', () => applyMode('original'));

    let isFocusActive = config.collapseUnchanged;

    function applyFocusChanges(active) {
      isFocusActive = active;
      btnFocus.classList.toggle('active', active);

      const blocks = inlineContainer.querySelectorAll('p, div, li, tr, pre, blockquote, h1, h2, h3, h4, h5, h6');
      inlineContainer.querySelectorAll('.ado-diff-collapsed-banner').forEach(b => b.remove());
      inlineContainer.querySelectorAll('.ado-diff-unchanged-hidden').forEach(el => el.classList.remove('ado-diff-unchanged-hidden'));

      if (!active) return;

      let unchangedRun = [];
      function flushUnchangedRun() {
        if (unchangedRun.length >= 2) {
          const runToHide = unchangedRun.slice(0);
          const count = runToHide.length;
          runToHide.forEach(el => el.classList.add('ado-diff-unchanged-hidden'));

          const banner = document.createElement('div');
          banner.className = 'ado-diff-collapsed-banner';
          banner.textContent = `⋯ ${count} unchanged sections hidden (click to expand) ⋯`;
          banner.addEventListener('click', () => {
            runToHide.forEach(el => el.classList.remove('ado-diff-unchanged-hidden'));
            banner.remove();
          });
          runToHide[0].parentNode.insertBefore(banner, runToHide[0]);
        }
        unchangedRun = [];
      }

      blocks.forEach(block => {
        if (unchangedRun.some(p => p.contains(block))) return;
        const hasDiff = block.querySelector('ins.ado-diff-highlight, del.ado-diff-highlight');
        if (!hasDiff) {
          unchangedRun.push(block);
        } else {
          flushUnchangedRun();
        }
      });
      flushUnchangedRun();
    }

    btnFocus.addEventListener('click', () => applyFocusChanges(!isFocusActive));
    if (config.collapseUnchanged) applyFocusChanges(true);

    btnCopy.addEventListener('click', () => {
      const plainText = descriptionFragment(rightHtml).textContent || '';
      navigator.clipboard.writeText(plainText).then(() => {
        showToast('Description copied to clipboard');
        copyLabel.textContent = 'Copied!';
        setTimeout(() => {
          copyLabel.textContent = 'Copy';
        }, 1500);
      }).catch(err => console.error('Copy failed:', err));
    });

    widgetControls.set(widget, { applyMode, applyFocusChanges });
    applyMode(config.defaultView);
    return widget;
  }

  function showToast(message) {
    let toast = document.querySelector('.ado-diff-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'ado-diff-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  // Fingerprint only the host page's source, excluding our presentation changes.
  function cloneSource(container) {
    const clone = container.cloneNode(true);
    clone.querySelectorAll('.ado-diff-widget, .ado-diff-cell-td').forEach(el => el.remove());
    clone.querySelectorAll('.ado-diff-hidden-raw').forEach(el => el.classList.remove('ado-diff-hidden-raw'));
    clone.querySelectorAll('.ado-diff-source-text').forEach(el => el.replaceWith(...el.childNodes));
    clone.querySelectorAll('[class=""]').forEach(el => el.removeAttribute('class'));
    return clone;
  }

  function removeDiff(container) {
    const record = processedDiffs.get(container);
    if (!record) return;
    record.targets.forEach(el => el.classList.remove('ado-diff-hidden-raw'));
    record.textWrappers.forEach(el => el.replaceWith(...el.childNodes));
    record.widget.remove();
    if (record.cell) record.cell.remove();
    delete container.dataset.adoDiffProcessed;
    delete container.dataset.adoDiffHash;
    processedDiffs.delete(container);
  }

  function revertAllDiffs() {
    for (const container of processedDiffs.keys()) removeDiff(container);
  }

  function refreshProcessedDiffs() {
    for (const [container, record] of processedDiffs) {
      if (!container.isConnected || !container.contains(record.widget) ||
          cloneSource(container).innerHTML !== record.sourceHtml) {
        removeDiff(container);
      }
    }
  }

  function mountDiff(container, oldHtml, newHtml, targets, { wrapText = false, after = null } = {}) {
    if ((!oldHtml && !newHtml) || oldHtml === newHtml) return;

    const textWrappers = [];
    if (wrapText) {
      // Keep the actual text nodes so restoring the original does not replace host DOM.
      Array.from(container.childNodes).forEach(node => {
        if (node.nodeType !== 3) return;
        const span = document.createElement('span');
        span.className = 'ado-diff-source-text';
        node.replaceWith(span);
        span.appendChild(node);
        textWrappers.push(span);
      });
      targets = Array.from(container.children);
    }

    const widget = createDiffWidget(oldHtml, newHtml, showOriginal => {
      targets.forEach(el => el.classList.toggle('ado-diff-hidden-raw', !showOriginal));
    });
    if (!widget) {
      textWrappers.forEach(el => el.replaceWith(...el.childNodes));
      return;
    }

    let cell = null;
    if (container.tagName === 'TR') {
      cell = document.createElement('td');
      cell.className = 'ado-diff-cell-td';
      cell.colSpan = Math.max(1, targets.reduce((sum, el) => sum + (el.colSpan || 1), 0));
      container.appendChild(cell);
      cell.appendChild(widget);
    } else if (after) {
      after.after(widget);
    } else {
      container.appendChild(widget);
    }

    container.dataset.adoDiffProcessed = 'true';
    container.dataset.adoDiffHash = hashString(JSON.stringify([oldHtml, newHtml]));
    processedDiffs.set(container, {
      widget, cell, targets, textWrappers,
      sourceHtml: cloneSource(container).innerHTML
    });
  }

  /**
   * Helper: Extracts old and new HTML from crossed-out / strikethrough container
   */
  function extractStrikethroughDiff(container) {
    if (!container) return null;

    const clone = cloneSource(container);
    const strikeSelector = 's, strike, del, [style*="line-through"], [class*="strike"], [class*="deleted"], [class*="removed"]';
    // Nested strike elements represent one old value, not repeated copies of it.
    const strikeElements = Array.from(clone.querySelectorAll(strikeSelector))
      .filter(el => !el.parentElement.closest(strikeSelector));

    if (strikeElements.length === 0) return null;

    // Combine struck-through content as oldHtml
    const oldHtml = strikeElements.map(el => el.innerHTML).join(' ');

    strikeElements.forEach(el => el.remove());

    // Some older feeds put the field label in a leading text node.
    const firstText = Array.from(clone.childNodes).find(node => node.textContent.trim());
    if (firstText && firstText.nodeType === 3) {
      firstText.textContent = firstText.textContent.replace(/^\s*(?:System\.)?Description\s*:\s*/i, '');
    }

    const newHtml = clone.innerHTML.trim();

    if (!oldHtml && !newHtml) return null;
    return { oldHtml, newHtml };
  }

  /**
   * Helper: Checks whether an element is inside any forbidden area (e.g. Details tab, editor, discussion input)
   */
  function isInsideForbiddenArea(el) {
    if (!el || !el.closest) return false;
    return !!el.closest([
      '[contenteditable="true"]',
      '[contenteditable=""]',
      '.rooster-editor',
      '.rich-editor',
      '.richeditor-container',
      '.richeditor-editarea',
      '.work-item-form-details',
      '.work-item-details',
      '.workitem-details',
      '.work-item-description',
      '.workitem-description',
      '[data-tab-name="Details" i]',
      '[aria-label="Details" i][role="tabpanel"]',
      '.workitem-details-pane',
      '.work-item-details-pane',
      '.work-item-form-mainContent'
    ].join(', '));
  }

  /**
   * Helper: Determines if an element is visible in the DOM
   */
  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) {
      return false;
    }
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /**
   * Helper: Finds all tab elements whose label represents the "History" tab
   */
  function findHistoryTabs() {
    const tabCandidates = document.querySelectorAll(
      '[role="tab"], .ms-Pivot-link, .vss-Pivot-link, .bolt-tab, .ado-tab, .tab-item, li.tab, button.tab, [data-tab-name]'
    );
    const historyTabs = [];
    for (const tab of tabCandidates) {
      const text = (
        tab.getAttribute('data-tab-name') ||
        tab.getAttribute('name') ||
        tab.getAttribute('aria-label') ||
        tab.textContent ||
        ''
      ).trim().toLowerCase();

      if (/^history\b/i.test(text)) {
        historyTabs.push(tab);
      }
    }
    return historyTabs;
  }

  /**
   * Checks whether the user is currently viewing the History tab
   */
  function isHistoryTabActive() {
    const historyTabs = findHistoryTabs();

    if (historyTabs.length > 0) {
      for (const tab of historyTabs) {
        const isSelected =
          tab.getAttribute('aria-selected') === 'true' ||
          tab.classList.contains('is-selected') ||
          tab.classList.contains('active') ||
          tab.classList.contains('selected') ||
          (tab.parentElement && (
            tab.parentElement.classList.contains('is-selected') ||
            tab.parentElement.classList.contains('active') ||
            tab.parentElement.classList.contains('selected')
          ));
        if (isSelected) {
          return true;
        }
      }
      // If History tab element(s) exist but none are active, another tab (like Details) is selected!
      return false;
    }

    // Fallback: If no explicit tab elements exist, check if a visible history container is present
    const historyContainers = document.querySelectorAll(
      '.work-item-history-control, .workitem-history-control, .workitem-history, .work-item-history, .history-tab-content, .history-details, .work-item-form-history, .ado-history-layout, .ado-history-main'
    );
    for (const c of historyContainers) {
      if (isVisible(c) && !isInsideForbiddenArea(c)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Locates active, visible containers dedicated to History content
   */
  function getActiveHistoryContainers() {
    if (!isHistoryTabActive()) {
      return [];
    }

    const containers = new Set();

    // 1. Check aria-controls of the active History tab
    const historyTabs = findHistoryTabs();
    for (const tab of historyTabs) {
      const isSelected =
        tab.getAttribute('aria-selected') === 'true' ||
        tab.classList.contains('is-selected') ||
        tab.classList.contains('active') ||
        tab.classList.contains('selected') ||
        (tab.parentElement && (
          tab.parentElement.classList.contains('is-selected') ||
          tab.parentElement.classList.contains('active') ||
          tab.parentElement.classList.contains('selected')
        ));

      if (isSelected) {
        const controlsId = tab.getAttribute('aria-controls');
        if (controlsId) {
          const panel = document.getElementById(controlsId);
          if (panel && isVisible(panel)) {
            containers.add(panel);
          }
        }
      }
    }

    // 2. Check tabpanel with aria-label / data-tab-name matching History
    const tabPanels = document.querySelectorAll(
      '[role="tabpanel"][aria-label*="History" i], [role="tabpanel"][data-tab-name="History" i], [role="region"][aria-label*="History" i]'
    );
    for (const panel of tabPanels) {
      if (isVisible(panel)) {
        containers.add(panel);
      }
    }

    // 3. Known ADO history container classes
    const classSelectors = [
      '.work-item-history-control',
      '.workitem-history-control',
      '.work-item-history',
      '.workitem-history',
      '.history-tab-content',
      '.history-details',
      '.work-item-form-history',
      '.work-item-history-view',
      '.witform-history',
      '.ado-history-layout',
      '.ado-history-main'
    ];
    for (const sel of classSelectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (isVisible(el)) {
          containers.add(el);
        }
      });
    }

    // 4. Fallback: Check elements containing history revisions/feeds
    if (containers.size === 0) {
      const fallbackCandidates = document.querySelectorAll(
        '.history-item, .history-feed, .bolt-table, .ms-DetailsList, [class*="history"]'
      );
      for (const el of fallbackCandidates) {
        if (!isInsideForbiddenArea(el) && isVisible(el)) {
          const root = el.closest('[role="tabpanel"]') || el.parentElement;
          if (root && !isInsideForbiddenArea(root) && isVisible(root)) {
            containers.add(root);
          }
        }
      }
    }

    // Filter out any container inside a forbidden area
    return Array.from(containers).filter(c => !isInsideForbiddenArea(c));
  }

  /**
   * STRATEGY 1: Class-Agnostic "Description" Label Finder
   * Finds any element whose visible text is "Description" (or "System.Description")
   * strictly within the active History container and locates its corresponding old & new value containers.
   */
  function scanDescriptionByLabel(historyContainer) {
    const allElements = historyContainer.querySelectorAll('*');
    const labelCandidates = [];

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) continue;
      if (el.closest('.ado-diff-widget, [data-ado-diff-processed]')) continue;
      if (isInsideForbiddenArea(el)) continue;
      if (el.children.length > 2) continue;

      const txt = el.textContent.trim().toLowerCase();
      if (txt === 'description' || txt === 'system.description') {
        labelCandidates.push(el);
      }
    }

    labelCandidates.forEach(labelEl => {
      // Find row container (table row, bolt row, details row, or parent)
      const container = labelEl.closest('tr, [role="row"], .bolt-table-row, .ms-DetailsRow') || labelEl.parentElement;
      if (!container || container.closest('[data-ado-diff-processed]') || isInsideForbiddenArea(container)) return;

      // Collect sibling elements in this row (the value cells)
      const siblings = Array.from(container.children).filter(child => !child.contains(labelEl) && child !== labelEl);
      if (siblings.length === 0) return;

      let oldHtml = '';
      let newHtml = '';
      let targetElementToHide = [];

      // Case A: 2 or more siblings (Old Value column and New Value column)
      if (siblings.length >= 2) {
        oldHtml = sanitizeFieldHtml(siblings[0].innerHTML);
        newHtml = sanitizeFieldHtml(siblings[1].innerHTML);
        targetElementToHide = [siblings[0], siblings[1]];
      }
      // Case B: 1 sibling container that contains both Old (strikethrough) and New
      else if (siblings.length === 1) {
        const valContainer = siblings[0];
        targetElementToHide = [valContainer];

        // Prefer explicit values: strikethrough may be part of the description itself.
        const oldEl = valContainer.querySelector('.old-value, [class*="oldValue"]');
        const newEl = valContainer.querySelector('.new-value, [class*="newValue"]');
        if (oldEl && newEl) {
          oldHtml = sanitizeFieldHtml(oldEl.innerHTML);
          newHtml = sanitizeFieldHtml(newEl.innerHTML);
        } else {
          const strikeData = extractStrikethroughDiff(valContainer);
          if (strikeData) {
            oldHtml = sanitizeFieldHtml(strikeData.oldHtml);
            newHtml = sanitizeFieldHtml(strikeData.newHtml);
          }
        }
      }

      mountDiff(container, oldHtml, newHtml, targetElementToHide);
    });
  }

  /**
   * STRATEGY 2: Strikethrough & Added Text Container Finder
   * Scans strictly inside the active History container for containers that display struck-through text
   * for the Description field.
   */
  function scanStrikethroughContainers(historyContainer) {
    const strikeCandidates = historyContainer.querySelectorAll(
      's, strike, del, [style*="line-through"], [class*="deleted"], [class*="strike"]'
    );

    strikeCandidates.forEach(strikeEl => {
      if (strikeEl.closest('.ado-diff-widget, [data-ado-diff-processed]')) return;
      if (isInsideForbiddenArea(strikeEl)) return;
      // Find common parent that holds both strike and new text
      const parent = strikeEl.parentElement;
      if (!parent || parent.closest('[data-ado-diff-processed]') || isInsideForbiddenArea(parent)) return;
      // Explicit old/new fields are handled by the label or feed scanner.
      if (strikeEl.closest('.old-value, .new-value, [class*="oldValue"], [class*="newValue"]')) return;

      // Check if parent or preceding row/card explicitly mentions Description
      const contextNode = parent.closest('tr, [role="row"], .bolt-table-row, .ms-DetailsRow, .bolt-card, .history-item') || parent;
      const contextText = contextNode.textContent.toLowerCase();
      if (!contextText.includes('description')) return;

      const strikeData = extractStrikethroughDiff(parent);
      if (!strikeData) return;

      const oldHtml = sanitizeFieldHtml(strikeData.oldHtml);
      const newHtml = sanitizeFieldHtml(strikeData.newHtml);
      mountDiff(parent, oldHtml, newHtml, [], { wrapText: true });
    });
  }

  /**
   * STRATEGY 3: "Changed Description from: ... to: ..." Feed Parser
   * Scans strictly inside the active History container for activity feed items changing Description.
   */
  function scanFeedChanges(historyContainer) {
    const candidates = historyContainer.querySelectorAll(
      '.history-item, .feed-item, .bolt-card, [class*="history-item"], [class*="activityItem"]'
    );

    candidates.forEach(item => {
      if (item.closest('.ado-diff-widget, [data-ado-diff-processed]') ||
          item.querySelector('[data-ado-diff-processed]') || isInsideForbiddenArea(item)) return;

      const text = item.textContent || '';
      if (!/(?:changed\s+description|description\s+changed|changed\s+the\s+description)/i.test(text)) {
        return;
      }

      const valBlocks = [
        item.querySelector('.old-value, [class*="oldValue"]'),
        item.querySelector('.new-value, [class*="newValue"]')
      ];
      if (valBlocks.some(el => !el)) return;

      const oldHtml = sanitizeFieldHtml(valBlocks[0].innerHTML);
      const newHtml = sanitizeFieldHtml(valBlocks[1].innerHTML);
      mountDiff(item, oldHtml, newHtml, valBlocks, { after: valBlocks[1] });
    });
  }

  /**
   * Main scan routine - strictly isolated to History tab
   */
  let isScanning = false;

  function processPage() {
    if (!configLoaded || !config.enabled || !isAzureDevOps()) {
      revertAllDiffs();
      return;
    }

    // Step 1: Verify the user is currently on the History tab
    if (!isHistoryTabActive()) {
      // User is on Details, Links, Attachments, or outside a work item
      revertAllDiffs();
      return;
    }

    // Step 2: Retrieve the active History containers
    const containers = getActiveHistoryContainers();
    if (containers.length === 0) {
      return;
    }

    refreshProcessedDiffs();

    // Step 3: Run targeted scanners strictly inside the History container
    containers.forEach(container => {
      scanDescriptionByLabel(container);
      scanStrikethroughContainers(container);
      scanFeedChanges(container);
    });
  }

  function scheduleProcessPage() {
    if (isScanning) return;
    isScanning = true;
    requestAnimationFrame(() => {
      isScanning = false;
      processPage();
    });
  }

  // MutationObserver with tab change attribute filter
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      // Ignore self-generated DOM changes inside our diff widgets
      if (m.target && m.target.closest && m.target.closest('.ado-diff-widget')) {
        continue;
      }
      shouldScan = true;
      break;
    }
    if (shouldScan) {
      scheduleProcessPage();
    }
  });

  const observerOptions = {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-selected', 'style', 'aria-hidden']
  };

  let periodicCheck = null;
  function updateActivation() {
    if (!configLoaded) return;
    if (!config.enabled || !isAzureDevOps()) {
      observer.disconnect();
      if (periodicCheck !== null) clearInterval(periodicCheck);
      periodicCheck = null;
      revertAllDiffs();
      return;
    }
    if (!document.body) return;
    observer.observe(document.body, observerOptions);
    if (periodicCheck === null) periodicCheck = setInterval(scheduleProcessPage, 1000);
    processPage();
  }

  document.addEventListener('DOMContentLoaded', updateActivation);
  loadConfig();
})();
