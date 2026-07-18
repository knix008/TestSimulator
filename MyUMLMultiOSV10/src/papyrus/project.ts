import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getPapyrusCompanionPaths, type PapyrusProjectPaths } from './paths.js';
import { parsePapyrusXml, type PapyrusXmlDocument } from './xmlDocument.js';

export interface PapyrusProject {
  paths: PapyrusProjectPaths;
  uml: PapyrusXmlDocument;
  notation?: PapyrusXmlDocument;
  di?: PapyrusXmlDocument;
}

export async function loadPapyrusProject(umlFilePath: string): Promise<PapyrusProject> {
  const paths = getPapyrusCompanionPaths(umlFilePath);

  return {
    paths,
    uml: await readPapyrusXml(paths.uml),
    notation: await readOptionalPapyrusXml(paths.notation),
    di: await readOptionalPapyrusXml(paths.di)
  };
}

async function readPapyrusXml(filePath: string): Promise<PapyrusXmlDocument> {
  return parsePapyrusXml(filePath, await readFile(filePath, 'utf8'));
}

async function readOptionalPapyrusXml(filePath: string): Promise<PapyrusXmlDocument | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }

  return readPapyrusXml(filePath);
}