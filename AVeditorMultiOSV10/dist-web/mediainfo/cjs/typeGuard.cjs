"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isTrackType = isTrackType;
/**
 * Checks if a given object is of a specified track type.
 *
 * @template T - The type of track to check for.
 * @param thing - The object to check.
 * @param type - The track type to check against.
 * @returns A boolean indicating whether the object is of the specified track type.
 */
function isTrackType(thing, type) {
  return thing !== null && typeof thing === 'object' && thing['@type'] === type;
}
//# sourceMappingURL=typeGuard.cjs.map
