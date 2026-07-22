import { describe, expect, it } from 'vitest';
import { computeBridgeCrossings, polylinePathWithBridges } from './edgeBridges.js';

describe('edge bridges', () => {
  it('detects a crossing and assigns the bridge to the later edge', () => {
    const bridges = computeBridgeCrossings([
      {
        id: 'a',
        points: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
        endpointNodeIds: ['n1', 'n2']
      },
      {
        id: 'b',
        points: [{ x: 50, y: 0 }, { x: 50, y: 100 }],
        endpointNodeIds: ['n3', 'n4']
      }
    ]);

    expect(bridges.has('a')).toBe(false);
    expect(bridges.get('b')).toEqual([{ x: 50, y: 50 }]);
  });

  it('skips crossings when edges share an endpoint node', () => {
    const bridges = computeBridgeCrossings([
      {
        id: 'a',
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        endpointNodeIds: ['shared', 'n2']
      },
      {
        id: 'b',
        points: [{ x: 0, y: 100 }, { x: 100, y: 0 }],
        endpointNodeIds: ['shared', 'n4']
      }
    ]);

    expect(bridges.size).toBe(0);
  });

  it('skips crossings near polyline endpoints', () => {
    const bridges = computeBridgeCrossings([
      {
        id: 'a',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        endpointNodeIds: ['n1', 'n2']
      },
      {
        id: 'b',
        points: [{ x: 5, y: -20 }, { x: 5, y: 20 }],
        endpointNodeIds: ['n3', 'n4']
      }
    ]);

    expect(bridges.size).toBe(0);
  });

  it('builds an SVG arc bridge at the crossing', () => {
    const path = polylinePathWithBridges(
      [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      [{ x: 50, y: 50 }],
      7
    );

    expect(path).toContain('A 7 7 0 0 1');
    expect(path.startsWith('M 0 50')).toBe(true);
    expect(path.endsWith('L 100 50')).toBe(true);
  });
});
