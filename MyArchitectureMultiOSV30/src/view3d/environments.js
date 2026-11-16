// Image-based lighting (ported from MySketchBook's library/environments.js):
// Poly Haven CC0 HDRIs in library/hdri, prefiltered with PMREM for the light
// and reflections (scene.environment), and the equirectangular picture itself
// to show behind the model or to light a photo render. "" = the app's own
// procedural sky (viewer.js skyEnvironment), no download.

/** `file` = 1k (always there); `file2k` = a sharper background for the main ones. */
export const ENVIRONMENTS = [
  { id: "kloofendal_48d_partly_cloudy_puresky", name: "Daylight sky", kind: "exterior", main: true, intensity: 1 },
  { id: "overcast_soil_puresky", name: "Overcast sky", kind: "exterior", intensity: 1 },
  { id: "venice_sunset", name: "Sunset", kind: "exterior", intensity: 1 },
  { id: "satara_night", name: "Night", kind: "exterior", intensity: 1.4 },
  { id: "lythwood_room", name: "Bright living room (overcast day)", kind: "interior", main: true, intensity: 1 },
  { id: "hotel_room", name: "Hotel room", kind: "interior", intensity: 1 },
  { id: "relax_inn_seaview_suite", name: "Sea-view suite", kind: "interior", intensity: 1 },
  { id: "studio_small_08", name: "Photo studio", kind: "studio", main: true, intensity: 0.9 },
].map((e) => ({ ...e, file: `hdri/${e.id}.hdr`, file2k: e.main ? `hdri/${e.id}_2k.hdr` : null, thumb: `hdri/thumbs/${e.id}.webp` }));

export const environmentById = (id) => ENVIRONMENTS.find((e) => e.id === id) || null;

/** The URL of a downloaded library file (src/io/assetstore.js). */
export { assetUrl as libraryUrl } from "../io/assetstore.js";
import { assetUrl } from "../io/assetstore.js";

// Per renderer (GPU resources): id|file → Promise<{ texture, background, env }>.
const cache = new WeakMap();

/**
 * Loads an HDRI and prefilters it: { texture (PMREM, scene.environment), background (equirect), env }.
 * quality "2k" uses the sharper file where there is one (for the background; the light is the same).
 */
export function loadEnvironment(THREE, id, renderer, { quality = "1k" } = {}) {
  const env = environmentById(id);
  if (!env) return Promise.reject(new Error(`Unknown environment ${id}`));
  const file = quality === "2k" && env.file2k ? env.file2k : env.file;
  let map = cache.get(renderer);
  if (!map) cache.set(renderer, (map = new Map()));
  const key = `${id}|${file}`;
  if (map.has(key)) return map.get(key);
  const promise = import("../vendor/three/addons/HDRLoader.js").then(({ HDRLoader }) => assetUrl(file).then((url) => new HDRLoader().loadAsync(url))).then((equirect) => {
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromEquirectangular(equirect).texture;
    pmrem.dispose();
    return { texture, background: equirect, env };
  });
  promise.catch(() => map.delete(key));
  map.set(key, promise);
  return promise;
}
