// A form for an operator's adjustable properties (the Adjust Last Operation panel and "run with options").
import { h } from './dom.js';
import { nameOf } from './i18n.js';
import { numField, row, select, textField, toggle, vecField } from './widgets.js';

export function propsForm(op, values, onChange) {
  const out = [];
  for (const p of op.props) {
    if (p.hidden) continue;
    const change = (v) => onChange({ [p.name]: v });
    const label = nameOf(p);
    const testid = `op-${p.name}`;
    if (p.type === 'number' || p.type === 'int') out.push(row(label, numField({ value: values[p.name], step: p.step ?? 0.1, min: p.min, max: p.max, int: p.type === 'int', testid, onChange: (v, final) => { if (final) change(v); } })));
    else if (p.type === 'bool') out.push(toggle({ value: values[p.name], label, testid, onChange: change }));
    else if (p.type === 'enum') out.push(row(label, select({ value: values[p.name], options: p.options, testid, onChange: change })));
    else if (p.type === 'vec3') out.push(h('div', { className: 'note-line' }, label), vecField({ value: [...values[p.name]], step: p.step ?? 0.1, testid, onChange: (v, final) => { if (final) change(v); } }));
    else if (p.type === 'string') out.push(row(label, textField({ value: values[p.name], testid, onChange: change })));
  }
  return out;
}
