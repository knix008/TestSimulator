export interface PapyrusProjectPaths {
  uml: string;
  notation: string;
  di: string;
}

export function getPapyrusCompanionPaths(umlFilePath: string): PapyrusProjectPaths {
  if (!umlFilePath.toLowerCase().endsWith('.uml')) {
    throw new Error(`Expected a .uml file path, received: ${umlFilePath}`);
  }

  const basePath = umlFilePath.slice(0, -'.uml'.length);

  return {
    uml: `${basePath}.uml`,
    notation: `${basePath}.notation`,
    di: `${basePath}.di`
  };
}