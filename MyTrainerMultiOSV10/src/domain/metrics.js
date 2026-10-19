// Evaluation of test predictions: confusion matrix, accuracy and per-class
// precision / recall / F1 for classification; MAE, RMSE and R² for regression
// and reconstruction.

/** Predicted classes from network outputs (one sigmoid output, or one per class). */
export function predictedClasses(predictions, outputs) {
  const n = predictions.length / outputs;
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (outputs === 1) out[i] = predictions[i] >= 0.5 ? 1 : 0;
    else {
      let best = 0;
      for (let k = 1; k < outputs; k++) if (predictions[i * outputs + k] > predictions[i * outputs + best]) best = k;
      out[i] = best;
    }
  }
  return out;
}

export function classificationReport(predictions, targets, outputs, classes) {
  const predicted = predictedClasses(predictions, outputs);
  const k = Math.max(classes, 2);
  const matrix = Array.from({ length: k }, () => new Array(k).fill(0));
  let correct = 0;
  const wrong = [];
  for (let i = 0; i < predicted.length; i++) {
    const actual = Math.round(targets[i]);
    matrix[actual][predicted[i]]++;
    if (actual === predicted[i]) correct++;
    else wrong.push(i);
  }
  const perClass = matrix.map((row, c) => {
    const tp = row[c];
    const fn = row.reduce((a, b) => a + b, 0) - tp;
    const fp = matrix.reduce((sum, r, a) => sum + (a === c ? 0 : r[c]), 0);
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision, recall, f1, support: tp + fn };
  });
  const macroF1 = perClass.reduce((s, c) => s + c.f1, 0) / perClass.length;
  return { kind: 'classification', matrix, accuracy: predicted.length ? correct / predicted.length : 0, perClass, macroF1, predicted, wrong };
}

export function regressionReport(predictions, targets) {
  const n = targets.length;
  let abs = 0; let sq = 0; let mean = 0;
  for (let i = 0; i < n; i++) mean += targets[i];
  mean /= Math.max(1, n);
  let total = 0;
  const errors = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const e = predictions[i] - targets[i];
    errors[i] = e;
    abs += Math.abs(e);
    sq += e * e;
    total += (targets[i] - mean) ** 2;
  }
  return { kind: 'regression', mae: abs / Math.max(1, n), rmse: Math.sqrt(sq / Math.max(1, n)), r2: total ? 1 - sq / total : 0, errors };
}

/** Builds the right report for a task from an 'evaluation' message. */
export function evaluationReport(evaluation, task) {
  if (!evaluation || !task) return null;
  const predictions = Float32Array.from(evaluation.predictions);
  const targets = Float32Array.from(evaluation.targets);
  if (task.kind === 'classification') return { ...classificationReport(predictions, targets, evaluation.outputs, task.classes), summary: evaluation.summary };
  return { ...regressionReport(predictions, targets.length === predictions.length ? targets : predictions), summary: evaluation.summary, outputs: evaluation.outputs };
}
