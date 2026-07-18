import { XMLParser, XMLValidator } from 'fast-xml-parser';

export interface PapyrusXmlDocument {
  source: string;
  xml: string;
  ast: unknown;
  namespaces: PapyrusNamespaces;
}

export interface PapyrusNamespaces {
  xmi?: string;
  uml?: string;
  notation?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  processEntities: false,
  trimValues: false
});

export function parsePapyrusXml(source: string, xml: string): PapyrusXmlDocument {
  const validation = XMLValidator.validate(xml);

  if (validation !== true) {
    throw new Error(`Invalid XML in ${source}: ${validation.err.msg}`);
  }

  return {
    source,
    xml,
    ast: parser.parse(xml),
    namespaces: detectPapyrusNamespaces(xml)
  };
}

export function serializeUnchanged(document: PapyrusXmlDocument): string {
  return document.xml;
}

export function detectPapyrusNamespaces(xml: string): PapyrusNamespaces {
  return {
    xmi: findNamespace(xml, 'xmi'),
    uml: findNamespace(xml, 'uml'),
    notation: findNamespace(xml, 'notation')
  };
}

function findNamespace(xml: string, prefix: string): string | undefined {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`xmlns:${escapedPrefix}=["']([^"']+)["']`));
  return match?.[1];
}