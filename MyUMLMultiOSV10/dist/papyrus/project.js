import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getPapyrusCompanionPaths } from './paths.js';
import { parsePapyrusXml } from './xmlDocument.js';
export async function loadPapyrusProject(umlFilePath) {
    const paths = getPapyrusCompanionPaths(umlFilePath);
    return {
        paths,
        uml: await readPapyrusXml(paths.uml),
        notation: await readOptionalPapyrusXml(paths.notation),
        di: await readOptionalPapyrusXml(paths.di)
    };
}
async function readPapyrusXml(filePath) {
    return parsePapyrusXml(filePath, await readFile(filePath, 'utf8'));
}
async function readOptionalPapyrusXml(filePath) {
    if (!existsSync(filePath)) {
        return undefined;
    }
    return readPapyrusXml(filePath);
}
