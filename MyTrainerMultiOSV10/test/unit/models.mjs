// Every model of every sample: a sample with a choice of models (the Train tab's "Model") has one entry per
// choice, so the tests check each of them, not only the one a sample opens with.
import { SAMPLE_IDS, sampleProject } from '../../src/domain/samples.js';

/** [{ id, variant (null: the sample's only model), label: 'id' or 'id/variant' }] */
export const SAMPLE_MODELS = SAMPLE_IDS.flatMap((id) => {
  const variants = sampleProject(id, 'en').variants?.list;
  return variants ? variants.map((v) => ({ id, variant: v.id, label: `${id}/${v.id}` })) : [{ id, variant: null, label: id }];
});

/** The sample's project with that model chosen (as the Train tab's model switch leaves it). */
export function modelProject({ id, variant }, language = 'en') {
  const project = sampleProject(id, language);
  if (variant) {
    const chosen = project.variants.list.find((v) => v.id === variant);
    if (!chosen) throw new Error(`${id} has no model ${variant}`);
    project.variants.current = variant;
    project.model = structuredClone(chosen.model);
  }
  return project;
}
