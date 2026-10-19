/**
 * ADO History Diff - Diff Engine Unit Tests
 * Run with: node --test tests/diff.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const htmldiff = require('../content/htmldiff.js');

describe('HTML Inline Diff Engine', () => {

  test('detects word-level insertions and deletions', () => {
    const before = '<p>The system was down for 5 minutes.</p>';
    const after = '<p>The system was down for 15 minutes due to network timeout.</p>';
    const result = htmldiff(before, after, 'ado-diff-highlight');

    assert.ok(result.includes('<del data-operation-index="1" class="ado-diff-highlight">5</del>'));
    assert.ok(result.includes('<ins data-operation-index="1" class="ado-diff-highlight">15</ins>'));
    assert.ok(result.includes('<ins data-operation-index="3" class="ado-diff-highlight"> due to network timeout</ins>'));
  });

  test('handles unordered and ordered lists', () => {
    const before = '<ul><li>Task 1: Setup database</li><li>Task 2: Build API</li></ul>';
    const after = '<ul><li>Task 1: Setup Postgres database</li><li>Task 2: Build GraphQL API</li><li>Task 3: Run integration tests</li></ul>';
    const result = htmldiff(before, after, 'ado-diff-highlight');

    assert.ok(result.includes('Postgres'));
    assert.ok(result.includes('GraphQL'));
    assert.ok(result.includes('Task 3: Run integration tests'));
    assert.ok(result.includes('<ins data-operation-index="1" class="ado-diff-highlight"> Postgres</ins>'));
  });

  test('preserves rich text formatting (bold, italic, links)', () => {
    const before = '<p>Click <a href="https://example.com">here</a> for <b>v1</b> guide.</p>';
    const after = '<p>Click <a href="https://example.com/v2">here</a> for <b>v2</b> guide.</p>';
    const result = htmldiff(before, after, 'ado-diff-highlight');

    assert.ok(result.includes('<ins'));
    assert.ok(result.includes('<del'));
    assert.ok(result.includes('v2'));
  });

  test('handles initial description creation (empty before)', () => {
    const before = '';
    const after = '<p>This is the initial description of the issue.</p>';
    const result = htmldiff(before, after, 'ado-diff-highlight');

    assert.ok(result.includes('<ins'));
    assert.ok(!result.includes('<del'));
    assert.ok(result.includes('initial description'));
  });

  test('handles description clearing (empty after)', () => {
    const before = '<p>Obsolete requirements description.</p>';
    const after = '';
    const result = htmldiff(before, after, 'ado-diff-highlight');

    assert.ok(!result.includes('<ins'));
    assert.ok(result.includes('<del'));
    assert.ok(result.includes('Obsolete requirements'));
  });

  test('handles identical content (zero changes)', () => {
    const text = '<p>Unchanged description content.</p>';
    const result = htmldiff(text, text, 'ado-diff-highlight');

    assert.strictEqual(result, text);
    assert.ok(!result.includes('<ins'));
    assert.ok(!result.includes('<del'));
  });

  test('handles HTML entities without corrupting them', () => {
    const before = '<p>Capacity &lt; 50 units &amp; cost &gt; $100</p>';
    const after = '<p>Capacity &lt; 80 units &amp; cost &gt; $120</p>';
    const result = htmldiff(before, after, 'ado-diff-highlight');

    assert.ok(result.includes('&lt;'));
    assert.ok(result.includes('&amp;'));
    assert.ok(result.includes('&gt;'));
    assert.ok(result.includes('80'));
  });

  test('splits unified diff into synchronized side-by-side views', () => {
    const before = '<p>Deploy to Staging on Friday.</p>';
    const after = '<p>Deploy to Production on Monday.</p>';
    const { leftHtml: leftView, rightHtml: rightView } = htmldiff.withViews(before, after, 'ado-diff-highlight');

    // Left should only have deletions (<del>) and no insertions (<ins>)
    assert.ok(leftView.includes('<del'));
    assert.ok(!leftView.includes('<ins'));
    assert.ok(leftView.includes('Staging'));
    assert.ok(leftView.includes('Friday'));

    // Right should only have insertions (<ins>) and no deletions (<del>)
    assert.ok(rightView.includes('<ins'));
    assert.ok(!rightView.includes('<del'));
    assert.ok(rightView.includes('Production'));
    assert.ok(rightView.includes('Monday'));
  });

  test('split views preserve source structure even when unified markup lacks structural markers', () => {
    const before = '<ul><li>A</li><li>B</li></ul><table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>';
    const after = '<ul><li>A</li></ul><table><tbody><tr><td>A</td></tr></tbody></table>';
    const result = htmldiff.withViews(before, after, 'ado-diff-highlight');
    assert.strictEqual(result.rightHtml, after);
    assert.strictEqual((result.leftHtml.match(/<li\b/g) || []).length, 2);
    assert.strictEqual((result.leftHtml.match(/<tr\b/g) || []).length, 2);
  });

  test('split views preserve native insertion and deletion tags', () => {
    const before = '<p><del>obsolete</del> <ins>current</ins> old</p>';
    const after = '<p><del>obsolete</del> <ins>current</ins> new</p>';
    const result = htmldiff.withViews(before, after, 'ado-diff-highlight');
    for (const html of [result.leftHtml, result.rightHtml]) {
      assert.ok(html.includes('<del>obsolete</del>'));
      assert.ok(html.includes('<ins>current</ins>'));
    }
  });

  test('split views handle creation, clearing, and unchanged content', () => {
    const html = '<p>Example</p>';
    assert.strictEqual(htmldiff.withViews('', html).leftHtml, '');
    assert.strictEqual(htmldiff.withViews(html, '').rightHtml, '');
    assert.deepStrictEqual(htmldiff.withViews(html, html), { diffHtml: html, leftHtml: html, rightHtml: html });
    assert.deepStrictEqual(htmldiff.withViews('', ''), { diffHtml: '', leftHtml: '', rightHtml: '' });
  });

  test('performance on realistic multi-paragraph document (~1000 words)', () => {
    let before = '<div>';
    let after = '<div>';
    for (let i = 0; i < 50; i++) {
      before += `<p>Requirement ${i}: Feature specification detailing API behavior for module ${i}.</p>`;
      if (i === 12 || i === 34) {
        after += `<p>Requirement ${i}: Updated feature specification detailing v2 OAuth API behavior for module ${i} with strict timeouts.</p>`;
      } else {
        after += `<p>Requirement ${i}: Feature specification detailing API behavior for module ${i}.</p>`;
      }
    }
    before += '</div>';
    after += '</div>';

    const start = Date.now();
    const result = htmldiff(before, after, 'ado-diff-highlight');
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 300, `Diff took ${elapsed}ms, expected < 300ms`);
    assert.ok(result.includes('<ins'));
    assert.ok(result.includes('<del'));
    assert.ok(result.includes('Updated feature'));
    assert.ok(result.includes('specification'));
  });
});
