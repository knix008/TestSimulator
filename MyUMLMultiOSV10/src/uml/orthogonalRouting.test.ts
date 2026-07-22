import { describe, expect, it } from 'vitest';
import { routeOrthogonalAvoidingObstacles, straightCrossesObstacles } from './orthogonalRouting.js';

describe('orthogonal obstacle routing', () => {
  it('detects when a straight link crosses a middle classifier', () => {
    const source = { x: 40, y: 100 };
    const target = { x: 400, y: 100 };
    const middle = { x: 180, y: 60, width: 120, height: 80 };

    expect(straightCrossesObstacles(source, target, [middle])).toBe(true);
    expect(straightCrossesObstacles(source, target, [{ x: 180, y: 200, width: 120, height: 80 }])).toBe(false);
  });

  it('routes around a blocking node instead of crossing it', () => {
    const source = { x: 40, y: 100 };
    const target = { x: 400, y: 100 };
    const middle = { x: 180, y: 60, width: 120, height: 80 };
    const points = routeOrthogonalAvoidingObstacles({
      source,
      target,
      sourceAnchor: 'right',
      targetAnchor: 'left',
      obstacles: [middle]
    });

    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
    expect(straightCrossesObstacles(source, target, [middle])).toBe(true);

    // No interior segment should cut through the obstacle core.
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const inside = mid.x > middle.x + 4
        && mid.x < middle.x + middle.width - 4
        && mid.y > middle.y + 4
        && mid.y < middle.y + middle.height - 4;
      expect(inside, `segment ${index} crosses obstacle at ${mid.x},${mid.y}`).toBe(false);
    }
  });
});
