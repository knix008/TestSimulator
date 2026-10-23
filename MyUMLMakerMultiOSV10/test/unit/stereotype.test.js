// The stereotype field is offered only where it shows: every element type the toolboxes draw is drawn with a
// stereotype, and STEREOTYPE_NOT_SHOWN (domain/meta.js) has to list exactly the types outside UML, SysML and ER
// whose shape does not show it (a mind map topic, a wireframe button, a BPMN task …).
import assert from 'node:assert/strict';
import test from 'node:test';
import { canvas, texts } from '../conformance/canvas.js';
import { DIAGRAM_TYPES, hasStereotype, STEREOTYPE_NOT_SHOWN, typeDef } from '../../src/domain/meta.js';
import { toolboxFor } from '../../src/domain/toolbox.js';

const MARK = 'zzstereo';
const modelFamily = (type) => /^(UML|SysML|ERD)/.test(type);

/** Whether the drawing of a node or line of `tool` shows its stereotype (null: it could not be drawn alone). */
function shows(diagramType, tool, tools) {
  if (tool.kind === 'edge') {
    const nodes = tools.filter((t) => t.kind === 'node');
    for (const a of nodes) {
      for (const b of nodes) {
        let c; let line;
        try {
          c = canvas(diagramType);
          line = c.edge(tool, c.node(a, 60, 60), c.node(b, 420, 60));
        } catch { continue; }
        line.element.stereotype = MARK;
        return texts(c.render().of(line)).join('|').includes(MARK);
      }
    }
    return null;
  }
  try {
    const c = canvas(diagramType);
    const shape = c.node(tool, 60, 60);
    if (!shape.element) return null;
    shape.element.stereotype = MARK;
    return texts(c.render().of(shape)).join('|').includes(MARK);
  } catch {
    return null;
  }
}

test('the stereotype field is offered exactly where the shape shows it (outside UML, SysML and ER)', () => {
  const seen = new Map();
  for (const diagramType of Object.keys(DIAGRAM_TYPES)) {
    const tools = toolboxFor(diagramType).flatMap(([, , , list]) => list);
    for (const tool of tools) {
      const type = tool.type;
      if (!type || seen.get(type) === true || !typeDef(type)?.fields?.some((f) => f.key === 'stereotype')) continue;
      const result = shows(diagramType, tool, tools);
      if (result !== null) seen.set(type, result || seen.get(type) === true);
    }
  }
  assert.ok(seen.size > 150, `the toolboxes draw many types with a stereotype field (${seen.size})`);
  const shownButHidden = [...seen].filter(([type, shown]) => shown && STEREOTYPE_NOT_SHOWN.has(type)).map(([type]) => type);
  const notShownButOffered = [...seen].filter(([type, shown]) => !shown && !modelFamily(type) && !STEREOTYPE_NOT_SHOWN.has(type)).map(([type]) => type);
  assert.deepEqual(shownButHidden, [], 'these shapes show a stereotype: take them out of STEREOTYPE_NOT_SHOWN');
  assert.deepEqual(notShownButOffered, [], 'these shapes never show a stereotype: add them to STEREOTYPE_NOT_SHOWN');
  for (const type of STEREOTYPE_NOT_SHOWN) assert.ok(typeDef(type), `${type} is a type`);
});

test('a mind map topic has no stereotype field; a class and a mind map relationship do', () => {
  assert.equal(hasStereotype('MMNode'), false);
  assert.equal(hasStereotype('MMBoundary'), false);
  assert.equal(hasStereotype('UMLClass'), true);
  assert.equal(hasStereotype('MMRelationship'), true, 'its line shows «stereotype»');
  assert.equal(hasStereotype('UMLTransition'), true, 'UML keeps it for StarUML, XMI and code');
});
