import { XMLParser, XMLValidator } from 'fast-xml-parser';
const parser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    processEntities: false,
    trimValues: false
});
export function parsePapyrusXml(source, xml) {
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
export function serializeUnchanged(document) {
    return document.xml;
}
export function detectPapyrusNamespaces(xml) {
    return {
        xmi: findNamespace(xml, 'xmi'),
        uml: findNamespace(xml, 'uml'),
        notation: findNamespace(xml, 'notation')
    };
}
function findNamespace(xml, prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = xml.match(new RegExp(`xmlns:${escapedPrefix}=["']([^"']+)["']`));
    return match?.[1];
}
