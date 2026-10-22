/**
 * ==========================================================================
 * Azure DevOps Description History Diff - Universal Content Script v1.0.3
 * ==========================================================================
 * Works across all Azure DevOps versions (Cloud, Server, On-Premise, TFS)
 * Uses multi-strategy DOM detection within the active History tab.
 */

(function () {
  'use strict';

  // Prevent multiple injections in same frame
  if (window.__ADO_DESCRIPTION_DIFF_V103_INITIALIZED__) {
    return;
  }
  window.__ADO_DESCRIPTION_DIFF_V103_INITIALIZED__ = true;

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

  const SUPPORTED_FIELDS = [
    { label: 'Description', referenceName: 'System.Description', names: ['Description', 'System.Description'] },
    { label: 'Acceptance Criteria', referenceName: 'Microsoft.VSTS.Common.AcceptanceCriteria',
      names: ['Acceptance Criteria', 'AcceptanceCriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria'] }
  ];
  const FIELD_NAMES = new Map(SUPPORTED_FIELDS.flatMap(field =>
    field.names.map(name => [name.toLowerCase(), field])));
  const FIELD_PATTERN = SUPPORTED_FIELDS.flatMap(field => field.names)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|');
  const FIELD_PREFIX = new RegExp('^\\s*(' + FIELD_PATTERN + ')\\s*:\\s*', 'i');
  const FEED_FIELD = new RegExp('^\\s*(?:changed\\s+(?:the\\s+)?(' + FIELD_PATTERN + ')\\b|(' +
    FIELD_PATTERN + ')\\s*(?:changed\\b|:))', 'i');

  function fieldForName(name) {
    return FIELD_NAMES.get((name || '').trim().replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').toLowerCase()) || null;
  }

  function fieldForLabel(el) {
    return fieldForName(el.textContent);
  }

  function fieldForContainer(el) {
    return fieldForName(el.getAttribute('data-field-reference-name') || el.getAttribute('data-field-name'));
  }

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
  function createDiffWidget(oldHtml, newHtml, onModeChange, field) {
    const diffEngine = window.htmldiff || (typeof htmldiff === 'function' ? htmldiff : null);
    if (!diffEngine) {
      console.warn('[ADO History Diff] htmldiff engine not found');
      return null;
    }

    const { diffHtml, leftHtml, rightHtml } = diffEngine.withViews(oldHtml, newHtml, 'ado-diff-highlight');
    const stats = computeDiffStats(diffHtml);

    const widget = document.createElement('div');
    widget.className = 'ado-diff-widget';
    widget.dataset.adoDiffField = field.referenceName;

    // Header Toolbar
    const header = document.createElement('div');
    header.className = 'ado-diff-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'ado-diff-header-left';
    
    const titleBadge = createElement('div', 'ado-diff-title-badge');
    titleBadge.append(createIcon('diff'), createElement('span', '', `${field.label} Diff`));
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
    btnCopy.title = `Copy new ${field.label.toLowerCase()} to clipboard`;

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
    appendDescription(inlineContainer, diffHtml, `(Empty ${field.label.toLowerCase()})`);

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
        showToast(`${field.label} copied to clipboard`);
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
          isInsideForbiddenArea(container) ||
          cloneSource(container).innerHTML !== record.sourceHtml) {
        removeDiff(container);
      }
    }
  }

  function mountDiff(container, oldHtml, newHtml, targets, { wrapText = false, after = null, field } = {}) {
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
    }, field);
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
    const strikeSelector = 's, strike, del, [style*="line-through"], .deleted, .removed, .diff-removed';
    const insertionSelector = 'ins, .added, .inserted, .diff-added';
    // Native inline comparisons contain shared text as well as deletions and
    // insertions. Reconstruct both complete revisions before computing our diff.
    if (clone.querySelector(insertionSelector)) {
      const previous = clone.cloneNode(true);
      previous.querySelectorAll(insertionSelector).forEach(el => el.remove());
      previous.querySelectorAll(strikeSelector).forEach(el => el.replaceWith(...el.childNodes));
      clone.querySelectorAll(strikeSelector).forEach(el => el.remove());
      clone.querySelectorAll(insertionSelector).forEach(el => el.replaceWith(...el.childNodes));
      return { oldHtml: previous.innerHTML.trim(), newHtml: clone.innerHTML.trim() };
    }
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
      firstText.textContent = firstText.textContent.replace(FIELD_PREFIX, '');
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
      // History shares the main form content wrapper with Details. Exclude the
      // actual editors above, not the wrapper that also contains History.
      '[role="listbox"]',
      '[role="option"]',
      '[role="menu"]',
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      '[role="combobox"]',
      '[role="checkbox"]',
      '[role="toolbar"]',
      '[role="tablist"]',
      'button',
      'select',
      'option',
      '.bolt-dropdown',
      '.bolt-dropdown-popup',
      '.bolt-menu',
      '.bolt-filterbar',
      '.ms-Callout',
      '.ms-Dropdown',
      '.history-filter',
      '.history-toolbar'
    ].join(', '));
  }

  /**
   * Helper: Determines if an element is visible in the DOM
   */
  function isVisible(el) {
    if (!el) return false;
    if (el.closest('[hidden], [aria-hidden="true"]')) return false;
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
      '.work-item-history-control, .workitem-history-control, .workitem-history, .work-item-history, .history-tab-content, .history-details, .work-item-form-history, .ado-history-layout, .ado-history-main, .update-details .html-field-diff'
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

    // Current Azure DevOps revision details use these wrappers even when there
    // is no History-named ancestor or aria-controls link on the selected tab.
    // Require the field wrapper inside update-details, not a generic details div.
    document.querySelectorAll('.update-details .html-field-diff').forEach(field => {
      if (isVisible(field) && !isInsideForbiddenArea(field)) {
        containers.add(field.closest('.update-details'));
      }
    });

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

  // Require evidence of revision values. A supported field label also
  // appears in the History field filter and the revision navigation list.
  const OLD_VALUE_SELECTOR = [
    '.old-value', '[class*="oldValue"]', '.old-value-container',
    '.previous-value', '.field-old-value', '.html-diff-old', '.diff-html-old',
    '[data-value-type="old"]', '[aria-label="Old value" i]'
  ].join(', ');
  const NEW_VALUE_SELECTOR = [
    '.new-value', '[class*="newValue"]', '.new-value-container',
    '.current-value', '.field-new-value', '.html-diff-new', '.diff-html-new',
    '[data-value-type="new"]', '[aria-label="New value" i]'
  ].join(', ');
  const VALUE_SELECTOR = OLD_VALUE_SELECTOR + ', ' + NEW_VALUE_SELECTOR;
  const CHANGE_SELECTOR = '.html-field-diff, .history-field-change, .field-change, [data-field-name], [data-field-reference-name]';
  const CHANGE_BOUNDARY_SELECTOR = CHANGE_SELECTOR +
    ', tr, [role="row"], .bolt-table-row, .ms-DetailsRow, .history-item, .feed-item, .bolt-card';
  const STRIKE_SELECTOR = 's, strike, del, [style*="line-through"], .deleted, .removed, .diff-removed';
  const INSERT_SELECTOR = 'ins, .added, .inserted, .diff-added';

  function scanNativeFields(historyContainer) {
    const fields = Array.from(historyContainer.querySelectorAll('.html-field-diff'));
    if (historyContainer.matches('.html-field-diff')) fields.unshift(historyContainer);
    fields.forEach(field => {
      if (isInsideForbiddenArea(field) || !isVisible(field) ||
          field.closest('.html-field-value, .ado-diff-widget') ||
          field.closest('[data-ado-diff-processed]')) return;
      // Use the field's own heading or metadata. Authored markdown headings
      // inside a value must not identify a different field.
      const label = Array.from(field.children).find(el =>
        !el.matches('.html-field-value, .ado-diff-widget') && fieldForLabel(el));
      const definition = label ? fieldForLabel(label) : fieldForContainer(field);
      if (!definition) return;
      const values = Array.from(field.querySelectorAll('.html-field-value'))
        .filter(el => el.closest('.html-field-diff') === field &&
          !el.parentElement.closest('.html-field-value') && !isInsideForbiddenArea(el));
      if (!values.length) return;

      const previous = [];
      const current = [];
      for (const value of values) {
        const clone = cloneSource(value);
        const wrapper = clone.children.length === 1 ? clone.firstElementChild : null;
        const isAdded = value.classList.contains('added');
        const isRemoved = value.classList.contains('removed') || value.classList.contains('deleted');
        if (isAdded && isRemoved) return;
        let revision;
        if (isAdded) revision = current;
        else if (isRemoved) revision = previous;
        else if (wrapper && wrapper.tagName === 'INS') revision = current;
        else if (wrapper && wrapper.tagName === 'DEL') revision = previous;
        else return; // Leave unsupported bodies intact rather than infer their order.

        // Azure DevOps wraps each whole value in ins/del. Remove that one
        // presentation wrapper, preserving ins/del authored inside the content.
        if (wrapper && ['INS', 'DEL'].includes(wrapper.tagName)) {
          wrapper.replaceWith(...wrapper.childNodes);
        }
        revision.push(sanitizeFieldHtml(clone.innerHTML));
      }
      // A missing side represents initial creation or clearing the field.
      mountDiff(field, previous.join(''), current.join(''), values, { field: definition });
    });
  }

  function valueElements(container, selector) {
    return Array.from(container.querySelectorAll(selector)).filter(el =>
      !isInsideForbiddenArea(el) && !el.closest('.ado-diff-widget') &&
      // Nested wrappers naming the same value are one value, not two revisions.
      !el.parentElement.closest(selector)
    );
  }

  function mountFieldChange(container, label, field) {
    if (!container || isInsideForbiddenArea(container) || !isVisible(container) ||
        container.closest('[data-ado-diff-processed]') || container.querySelector('[data-ado-diff-processed]')) return false;

    const labelBranch = label && Array.from(container.children).find(el => el === label || el.contains(label));
    const belongsToChange = el => {
      const field = el.closest(CHANGE_BOUNDARY_SELECTOR);
      return (!field || field === container || field.contains(container)) &&
        (!label || !el.contains(label)) && (!labelBranch || !labelBranch.contains(el));
    };
    const previous = valueElements(container, OLD_VALUE_SELECTOR).filter(belongsToChange);
    const current = valueElements(container, NEW_VALUE_SELECTOR).filter(belongsToChange);
    if (previous.length === 1 && current.length === 1 &&
        !previous[0].contains(current[0]) && !current[0].contains(previous[0])) {
      mountDiff(container, sanitizeFieldHtml(previous[0].innerHTML),
        sanitizeFieldHtml(current[0].innerHTML), [previous[0], current[0]], { after: current[0], field });
      return true;
    }

    // Native value bodies have explicit operation semantics. Unsupported
    // native layouts must not fall through to the legacy strike heuristics.
    if (container.matches('.html-field-diff') && container.querySelector('.html-field-value')) return false;

    // Native table/grid rows have a label cell followed by exactly two value
    // cells. Do not apply this positional inference to arbitrary label siblings.
    if (label && container.matches('tr, [role="row"], .bolt-table-row, .ms-DetailsRow')) {
      const cells = Array.from(container.children);
      if (cells.length === 3 && cells[0] === labelBranch &&
          cells.every(el => !isInsideForbiddenArea(el) && !el.querySelector('input, select, button, [role="checkbox"], [role="option"]'))) {
        mountDiff(container, sanitizeFieldHtml(cells[1].innerHTML), sanitizeFieldHtml(cells[2].innerHTML), cells.slice(1), { field });
        return true;
      }
    }

    // One native value body may contain a struck-out previous value or a
    // unified ins/del comparison. Keep its heading and other field changes.
    const bodies = Array.from(container.children).filter(el => el !== labelBranch &&
      !isInsideForbiddenArea(el) && !el.matches(CHANGE_BOUNDARY_SELECTOR) && !el.querySelector(CHANGE_BOUNDARY_SELECTOR));
    const body = bodies.length === 1 ? bodies[0] : null;
    if (body && !body.querySelector(VALUE_SELECTOR) &&
        (body.querySelector(STRIKE_SELECTOR) || body.querySelector(INSERT_SELECTOR))) {
      const revisions = extractStrikethroughDiff(body);
      if (revisions) {
        mountDiff(container, sanitizeFieldHtml(revisions.oldHtml), sanitizeFieldHtml(revisions.newHtml), [body], { field });
        return true;
      }
    }
    return false;
  }

  function scanFieldsByLabel(historyContainer) {
    const labels = Array.from(historyContainer.querySelectorAll('*')).filter(el =>
      !['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(el.tagName) &&
      !el.closest('.ado-diff-widget, [data-ado-diff-processed]') &&
      !el.closest(VALUE_SELECTOR + ', .html-field-value') && !isInsideForbiddenArea(el) && isVisible(el) &&
      fieldForLabel(el) && !Array.from(el.children).some(fieldForLabel)
    );

    labels.forEach(label => {
      // Walk through heading/value wrappers, but never cross a field or feed
      // boundary to borrow another field's old/new values.
      const boundary = label.closest(CHANGE_BOUNDARY_SELECTOR);
      for (let container = label.parentElement; container && historyContainer.contains(container); container = container.parentElement) {
        if (mountFieldChange(container, label, fieldForLabel(label))) break;
        if (container === boundary || container === historyContainer || isInsideForbiddenArea(container)) break;
      }
    });

    historyContainer.querySelectorAll('[data-field-name], [data-field-reference-name]').forEach(container => {
      const field = fieldForContainer(container);
      if (field) mountFieldChange(container, null, field);
    });
  }

  function scanFeedChanges(historyContainer) {
    const candidates = historyContainer.querySelectorAll(
      '.history-item, .feed-item, .bolt-card, [class*="history-item"], [class*="activityItem"]'
    );
    candidates.forEach(item => {
      if (item.closest('.ado-diff-widget, [data-ado-diff-processed]') ||
          item.querySelector('[data-ado-diff-processed]') || isInsideForbiddenArea(item) || !isVisible(item)) return;
      // Only the feed heading or direct label text identifies the field. A
      // mention of a supported field inside another field's content is insufficient.
      const text = cloneSource(item);
      text.querySelectorAll(VALUE_SELECTOR + ', ' + CHANGE_SELECTOR).forEach(el => el.remove());
      const match = FEED_FIELD.exec(text.textContent);
      if (!match) return;
      const field = fieldForName(match[1] || match[2]);
      if (mountFieldChange(item, null, field)) return;
      const directLabel = Array.from(item.childNodes).some(node => node.nodeType === 3 &&
        FIELD_PREFIX.test(node.textContent));
      if (directLabel && !item.querySelector(VALUE_SELECTOR)) {
        const revisions = extractStrikethroughDiff(item);
        if (revisions) mountDiff(item, sanitizeFieldHtml(revisions.oldHtml), sanitizeFieldHtml(revisions.newHtml), [], { wrapText: true, field });
      }
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
      scanNativeFields(container);
      scanFieldsByLabel(container);
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
