// From photo to caricature: warp (exaggeration) → style → effects.
// Runs in the worker (engine/worker.js) and in the tests; nothing here touches the DOM.
import { caricatureWarp, normalizeWarp } from './warp.js';
import { maskFromFeatures, normalizeOptions, styleById } from './styles.js';
import { applyEffects } from './effects.js';
import { rng } from './raster.js';

/** Size unit of a picture: 1 for 600 pixels on the longer side (filters scale with it). */
export const sizeUnit = (width, height) => Math.max(0.35, Math.max(width, height) / 600);

/**
 * The style's drawing of one item (no effects yet): { base, mask, features }.
 * `item` = { styleId, seed, warp, options }; `mask` = the person (0…1) or null.
 */
export function renderBase(source, features, item, mask = null) {
  const style = styleById(item.styleId);
  const person = mask ?? maskFromFeatures(source.width, source.height, features);
  const warped = caricatureWarp(source, features, normalizeWarp(item.warp), person);
  const u = sizeUnit(source.width, source.height);
  const base = style.render({
    raster: warped.raster,
    mask: warped.mask,
    features: warped.features,
    random: rng(item.seed),
    seed: item.seed,
    o: normalizeOptions(item.styleId, item.options),
    u,
  });
  return { base, mask: warped.mask, features: warped.features };
}

/** The finished caricature: the base drawing with the item's pixel effects. */
export function finish(rendered, item) {
  const u = sizeUnit(rendered.base.width, rendered.base.height);
  return applyEffects(rendered.base, item.effects, { mask: rendered.mask, seed: item.seed, u, features: rendered.features });
}

export function renderCaricature(source, features, item, mask = null) {
  const rendered = renderBase(source, features, item, mask);
  return { ...rendered, image: finish(rendered, item) };
}
