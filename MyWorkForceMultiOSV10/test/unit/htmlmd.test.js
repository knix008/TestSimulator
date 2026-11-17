import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { htmlToMarkdown, parseHtml } from '../../src/domain/htmlmd.js';
import { renderMarkdown } from '../../src/domain/markdown.js';

const SAMPLE = `# Payment guide

Card payments ship after **approval**, never *before*.
A second line with \`code\`, ~~old text~~ and a [link](https://example.com).

## Steps

1. Cart
2. Pay

- One
- Two

> Mind this

\`\`\`
const a = 1 < 2;
\`\`\`

---

| Name | Value |
| --- | --- |
| A | 1 |

[[toc]]

![Picture](attachment:f1)`;

describe('Pages written as documents', () => {
  test('Markdown → editor HTML → Markdown comes back unchanged', () => {
    const files = [{ id: 'f1', name: 'pic.png', mime: 'image/png', data: 'data:image/png;base64,AAAA' }];
    assert.equal(htmlToMarkdown(renderMarkdown(SAMPLE, files)), SAMPLE);
  });

  test('what an editor produces is reduced to the subset the reader shows', () => {
    const html = '<div>first</div><div><b>bold</b> and <span style="color:red">red</span></div><ul><li>a<ul><li>b</li></ul></li></ul><p><br></p><h4>deep</h4><p>x<br>y</p>';
    assert.equal(htmlToMarkdown(html), 'first\n\n**bold** and red\n\n- a\n- b\n\n### deep\n\nx\ny');
  });

  test('a table made in the editor becomes a Markdown table with a header row', () => {
    const md = htmlToMarkdown('<table><tbody><tr><th>Item</th><th>Note</th></tr><tr><td>a | b</td><td></td></tr></tbody></table>');
    assert.equal(md, '| Item | Note |\n| --- | --- |\n| a / b |   |');
    assert.match(renderMarkdown(md), /<thead><tr><th>Item<\/th>/);
  });

  test('scripts and unknown markup never reach the page; entities are read back as text', () => {
    assert.equal(htmlToMarkdown('<p>a &lt;b&gt; &amp; c</p><script>alert(1)</script><p onclick="x">ok</p>'), 'a <b> & c\n\nok');
    assert.doesNotMatch(renderMarkdown(htmlToMarkdown('<p>&lt;img src=x onerror=alert(1)&gt;</p>')), /<img/);
  });

  test('the parser survives broken HTML', () => {
    assert.doesNotThrow(() => parseHtml('<p><b>open <i>never closed</p></div><'));
    assert.equal(htmlToMarkdown('<p><b>open</p>'), '**open**');
  });
});
