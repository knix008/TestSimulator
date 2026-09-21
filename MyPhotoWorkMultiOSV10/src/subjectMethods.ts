import { modelSpecs, type ModelSpec } from './lib/neural'

/**
 * The ways this editor can tell a subject from its background, and how to
 * choose between them.
 *
 * Remove Background used to take whichever subject model happened to be on the
 * machine and fall back to GrabCut when none was — a decision the user never
 * saw and could not change, even though the three models differ by a factor of
 * forty in size and visibly in how they handle hair. They are offered as a
 * choice now, the classical method among them, and the one that is picked is
 * remembered.
 */

export type SubjectMethod = {
  /** A model id, or 'classical' for the built-in one. */
  id: string
  /** The name shown in the list. */
  name: string
  /** Bytes to fetch; 0 for the method that is already here. */
  bytes: number
  /** The key of the sentence describing it. */
  note: string
  license: string
  /** Higher is better at the job. */
  quality: number
  spec: ModelSpec | null
}

export const CLASSICAL = 'classical'

/** The built-in method, which needs nothing downloaded. */
const classical: SubjectMethod = {
  id: CLASSICAL,
  name: 'GrabCut',
  bytes: 0,
  note: 'subjectMethodClassicalNote',
  license: 'Apache-2.0 (OpenCV)',
  quality: 0,
  spec: null,
}

/** Every method, the built-in one first, then the models from small to best. */
export function subjectMethods(): SubjectMethod[] {
  const models = modelSpecs
    .filter((spec) => spec.task === 'subject')
    .sort((a, b) => a.quality - b.quality)
    .map((spec) => ({
      id: spec.id,
      name: spec.name,
      bytes: spec.bytes,
      note: spec.note,
      license: spec.license,
      quality: spec.quality,
      spec,
    }))
  return [classical, ...models]
}

export function subjectMethod(id: string): SubjectMethod | null {
  return subjectMethods().find((method) => method.id === id) ?? null
}

/**
 * What to run, given what the user asked for and what is on the machine.
 *
 * An empty choice means "whatever is best here", which is what the editor did
 * before the choice existed. A named model that is not downloaded falls back
 * rather than failing — the window offers to fetch it, but a command run from
 * a menu or an action still has to do something.
 */
export function resolveSubjectMethod(chosen: string, downloaded: Iterable<string>): SubjectMethod {
  const have = new Set(downloaded)
  if (chosen && chosen !== CLASSICAL) {
    const wanted = subjectMethod(chosen)
    if (wanted && have.has(wanted.id)) return wanted
  }
  if (chosen === CLASSICAL) return classical
  const best = subjectMethods()
    .filter((method) => method.spec && have.has(method.id))
    .sort((a, b) => b.quality - a.quality)[0]
  return best ?? classical
}

/** The models worth offering on a first run: the small subject cut-out and the sky. */
export const recommendedModels = ['u2netp', 'segformer']
