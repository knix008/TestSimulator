import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom always has it */ }
});
