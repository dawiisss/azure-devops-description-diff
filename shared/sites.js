(function (scope) {
  'use strict';
  const cloudMatches = ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'];
  const js = ['content/vendor/purify.js', 'content/htmldiff.js', 'content/content.js'];
  const css = ['content/styles.css'];
  const prefix = 'ado-diff-custom-';

  function isCloudHost(host) {
    return host === 'dev.azure.com' || host.endsWith('.visualstudio.com');
  }

  function normalizeDomain(input) {
    const raw = input.trim();
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hostname.includes('*')) {
      throw new Error('Enter an HTTP or HTTPS server address without credentials or wildcards.');
    }
    return url.protocol + '//' + url.hostname.toLowerCase() + '/*';
  }

  function normalizePattern(value) {
    if (typeof value !== 'string') return null;
    const match = /^(https?|\*):\/\/([^/]+)\/\*$/i.exec(value);
    if (!match) return null;
    const wildcard = match[2].startsWith('*.');
    const host = wildcard ? match[2].slice(2) : match[2];
    if (!host || host.includes('*')) return null;
    try {
      const url = new URL('https://' + host);
      if (url.username || url.password || url.port || url.pathname !== '/' || url.hostname.toLowerCase() !== host.toLowerCase()) return null;
      return match[1].toLowerCase() + '://' + (wildcard ? '*.' : '') + url.hostname.toLowerCase() + '/*';
    } catch { return null; }
  }

  function patterns(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(normalizePattern).filter(Boolean))];
  }

  function registration(pattern) {
    return { id: prefix + encodeURIComponent(pattern), matches: [pattern], js, css,
      allFrames: true, runAt: 'document_idle', persistAcrossSessions: true };
  }

  scope.AdoDiffSites = { cloudMatches, js, css, prefix, isCloudHost, normalizeDomain, normalizePattern, patterns, registration };
  if (typeof module !== 'undefined') module.exports = scope.AdoDiffSites;
})(globalThis);
