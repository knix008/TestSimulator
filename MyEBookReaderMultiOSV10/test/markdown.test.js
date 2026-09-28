import { describe, it, expect } from 'vitest';
import { renderMarkdown, markdownHeadings } from '../src/lib/markdown.js';

describe('renderMarkdown', () => {
  it('renders ATX headings', () => {
    expect(renderMarkdown('# One')).toBe('<h1>One</h1>');
    expect(renderMarkdown('### Three')).toBe('<h3>Three</h3>');
  });

  it('renders a setext heading', () => {
    expect(renderMarkdown('Title\n=====')).toBe('<h1>Title</h1>');
  });

  it('renders emphasis, strong and strike-through', () => {
    const html = renderMarkdown('*em* **strong** ~~gone~~');
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<strong>strong</strong>');
    expect(html).toContain('<del>gone</del>');
  });

  it('renders links and images', () => {
    expect(renderMarkdown('[text](https://x.test)')).toContain('<a href="https://x.test">text</a>');
    expect(renderMarkdown('![alt](pic.png)')).toContain('<img src="pic.png" alt="alt">');
  });

  it('leaves markup inside a code span alone', () => {
    const html = renderMarkdown('use `**not strong**` here');
    expect(html).toContain('<code>**not strong**</code>');
    expect(html).not.toContain('<strong>');
  });

  it('renders a fenced code block and escapes its content', () => {
    const html = renderMarkdown('```js\nconst a = 1 < 2;\n```');
    expect(html).toContain('<pre><code class="language-js">');
    expect(html).toContain('1 &lt; 2');
  });

  it('renders unordered and ordered lists', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>');
    expect(renderMarkdown('1. a\n2. b')).toContain('<ol>');
  });

  it('renders a block quote', () => {
    expect(renderMarkdown('> quoted')).toContain('<blockquote>');
  });

  it('renders a table with a header row', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('renders a thematic break', () => {
    expect(renderMarkdown('---')).toBe('<hr>');
  });

  it('escapes raw HTML in the source', () => {
    expect(renderMarkdown('<script>x()</script>')).not.toContain('<script>');
  });

  it('keeps Korean text intact', () => {
    expect(renderMarkdown('## 둘째 절')).toBe('<h2>둘째 절</h2>');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
  });
});

describe('markdownHeadings', () => {
  it('lists the headings with their level and line', () => {
    const rows = markdownHeadings('# One\n\ntext\n\n## Two\n');
    expect(rows).toEqual([
      { level: 1, text: 'One', line: 0 },
      { level: 2, text: 'Two', line: 4 },
    ]);
  });

  it('ignores a # inside a fenced code block', () => {
    const rows = markdownHeadings('```\n# not a heading\n```\n# real');
    expect(rows.map((r) => r.text)).toEqual(['real']);
  });
});
