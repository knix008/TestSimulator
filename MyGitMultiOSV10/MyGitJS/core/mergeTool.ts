export const BUILTIN_MERGE_TOOL = "mygit:builtin";

export function isBuiltinMergeTool(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === BUILTIN_MERGE_TOOL;
}

export function usesBuiltinMerge(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return !trimmed || isBuiltinMergeTool(trimmed);
}
