// Native wrapper structure supplied from the affected Azure DevOps History.
function nativeField({ oldHtml, newHtml, label = 'Description', oldClass = 'removed' }) {
  return `<div class="html-field-diff"><div class="font-size-ml font-weight-semibold margin-bottom-8">${label}</div>
    ${newHtml === undefined ? '' : `<div class="added html-field-value padding-vertical-4 padding-horizontal-8 margin-bottom-8"><ins><div class="markdown-content markdown-editor-preview markdown-preview markdown-preview-checkbox-indent">${newHtml}</div></ins></div>`}
    ${oldHtml === undefined ? '' : `<div class="${oldClass} html-field-value padding-vertical-4 padding-horizontal-8 margin-bottom-8"><del><div class="markdown-content markdown-editor-preview markdown-preview markdown-preview-checkbox-indent">${oldHtml}</div></del></div>`}
  </div>`;
}

module.exports = { nativeField };
