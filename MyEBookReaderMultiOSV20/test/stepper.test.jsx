import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { stepValue, NumberStepper, RangeStepper } from '../src/components/Stepper.jsx';
import { setLanguage } from '../src/i18n.js';

describe('stepValue', () => {
  it('steps on the grid and stops at the ends', () => {
    expect(stepValue(5, 1, { min: 1, max: 10 })).toBe(6);
    expect(stepValue(10, 1, { min: 1, max: 10 })).toBe(10);
    expect(stepValue(1, -1, { min: 1, max: 10 })).toBe(1);
    expect(stepValue(170, 1, { min: 96, max: 320, step: 8 })).toBe(176);
  });

  it('keeps decimal steps exact', () => {
    expect(stepValue(0.6, 1, { min: 0, max: 1, step: 0.05 })).toBe(0.65);
    expect(stepValue(1.2, -1, { min: 0.2, max: 3, step: 0.1 })).toBe(1.1);
  });

  it('walks a list of fixed choices', () => {
    const values = [0, 15, 30, 60];
    expect(stepValue(15, 1, { values })).toBe(30);
    expect(stepValue(60, 1, { values })).toBe(60);
    expect(stepValue(0, -1, { values })).toBe(0);
    expect(stepValue(20, 1, { values })).toBe(30);
  });
});

describe('steppers', () => {
  it('shows − value unit + with the value centred between the buttons', async () => {
    await setLanguage('en');
    const onChange = vi.fn();
    const { container } = render(<NumberStepper label="Copies" value={1} min={1} max={99} format={(n) => `${n} pcs`} onChange={onChange} />);
    const kids = [...container.querySelector('.stepper').children];
    expect(kids.map((k) => k.dataset.step || k.className)).toEqual(['dec', 'stepper-value', 'inc']);
    expect(kids[1].textContent).toBe('1 pcs');
    expect(screen.getByRole('button', { name: 'Copies — Decrease' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Copies — Increase' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('puts the slider between − and + with its value above it', async () => {
    await setLanguage('en');
    const onChange = vi.fn();
    const { container } = render(<RangeStepper label="Size" value={50} min={0} max={100} step={10} format={(v) => `${v}%`} onChange={onChange} />);
    const kids = [...container.querySelector('.range-stepper').children];
    expect(kids[0].dataset.step).toBe('dec');
    expect(kids[1].querySelector('output').textContent).toBe('50%');
    expect(kids[1].querySelector('input[type=range]')).toBeTruthy();
    expect(kids[2].dataset.step).toBe('inc');
    fireEvent.click(kids[0]);
    fireEvent.click(kids[2]);
    fireEvent.change(screen.getByRole('slider', { name: 'Size' }), { target: { value: '80' } });
    expect(onChange.mock.calls).toEqual([[40], [60], [80]]);
  });
});

describe('About window', () => {
  it('lists every supported file format with its extensions', async () => {
    await setLanguage('ko');
    const { default: AboutDialog } = await import('../src/components/AboutDialog.jsx');
    const { container } = render(<AboutDialog open onClose={() => {}} />);
    const rows = [...container.querySelectorAll('[data-about-formats] tr')].map((r) => r.textContent);
    expect(rows[0]).toContain('.pdf');
    for (const ext of ['.epub', '.mobi', '.azw3', '.djvu', '.fb2', '.cbz', '.md', '.html', '.txt', '.png']) {
      expect(rows.some((r) => r.includes(ext))).toBe(true);
    }
    expect(rows.some((r) => r.includes('.cbr'))).toBe(false);
    expect(container.textContent).toContain('.ebkvw');
    expect(container.textContent).toContain('지원하는 파일 형식');
  });
});
