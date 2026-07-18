import { describe, expect, it } from 'vitest';
import { getPapyrusCompanionPaths } from './paths.js';
import { detectPapyrusNamespaces, parsePapyrusXml, serializeUnchanged } from './xmlDocument.js';

const classModelXml = '<?xml version="1.0" encoding="UTF-8"?><uml:Model xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:uml="http://www.eclipse.org/uml2/5.0.0/UML" xmi:id="_model" name="Demo"/>';

describe('Papyrus project paths', () => {
  it('derives companion .notation and .di paths from a .uml path', () => {
    expect(getPapyrusCompanionPaths('samples/papyrus/class-basic/class-basic.uml')).toEqual({
      uml: 'samples/papyrus/class-basic/class-basic.uml',
      notation: 'samples/papyrus/class-basic/class-basic.notation',
      di: 'samples/papyrus/class-basic/class-basic.di'
    });
  });

  it('rejects non-.uml entry points', () => {
    expect(() => getPapyrusCompanionPaths('class-basic.notation')).toThrow('Expected a .uml file path');
  });
});

describe('Papyrus XML document handling', () => {
  it('detects XMI and UML namespaces', () => {
    expect(detectPapyrusNamespaces(classModelXml)).toEqual({
      xmi: 'http://www.omg.org/XMI',
      uml: 'http://www.eclipse.org/uml2/5.0.0/UML',
      notation: undefined
    });
  });

  it('keeps the original XML unchanged until a serializer mutation is implemented', () => {
    const document = parsePapyrusXml('class-basic.uml', classModelXml);

    expect(serializeUnchanged(document)).toBe(classModelXml);
  });

  it('rejects malformed XML before it reaches the domain model', () => {
    expect(() => parsePapyrusXml('broken.uml', '<uml:Model>')).toThrow('Invalid XML');
  });
});