// Extension point for the PlantUML diagram kinds that are not UML: Gantt,
// WBS, ArchiMate, nwdiag, JSON/YAML, chronology/timeline, EBNF/regex, Salt …
// plantuml.js calls these FIRST; returning null means "not mine" and the
// regular reader/writer carries on. Pure (no DOM).
//
//   importPlantUmlMore(text, options) → { owner, diagram, kind, warnings } | null
//     options: { language, name, block } where block (when the text has an
//     @start… marker) is { kind: 'uml'|'gantt'|'wbs'|'mindmap'|'json'|…, lines: [string], title }
//   exportPlantUmlMore(project, diagram) → string | null

/** PlantUML text → model, or null when this module does not handle it. */
export function importPlantUmlMore(text, options = {}) {
  void text; void options;
  return null;
}

/** A diagram → PlantUML text, or null when this module does not handle it. */
export function exportPlantUmlMore(project, diagram) {
  void project; void diagram;
  return null;
}
