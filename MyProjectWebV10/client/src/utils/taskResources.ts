import type { AssignmentItem } from '../types/project';

export function getTaskResourceNamesText(
  taskId: number,
  assignments: AssignmentItem[],
  assignedTo: string,
): string {
  const rows = assignments.filter((entry) => entry.taskId === taskId);
  if (rows.length > 0) {
    return rows.map((entry) => entry.resourceName).join('\n');
  }
  return assignedTo;
}

export function getTaskResourceAllocText(
  taskId: number,
  assignments: AssignmentItem[],
  assignedTo: string,
): string {
  const rows = assignments.filter((entry) => entry.taskId === taskId);
  if (rows.length > 0) {
    return rows.map((entry) => formatAllocationEdit(entry.allocationPercent)).join('\n');
  }
  const lineCount = assignedTo
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  return lineCount > 0 ? Array(lineCount).fill('100%').join('\n') : '';
}

export function formatAllocationEdit(percent: number): string {
  return `${Math.round(percent)}%`;
}

export function normalizeAllocationText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const value = Number(trimmed.replace(/%/g, '').trim());
      if (!Number.isFinite(value) || value < 0) {
        return trimmed.endsWith('%') ? trimmed : `${trimmed}%`;
      }
      return `${Math.round(value)}%`;
    })
    .join('\n');
}

export function applyTaskResourcesFromColumns(
  taskId: number,
  assignments: AssignmentItem[],
  namesText: string,
  allocsText: string,
): { assignments: AssignmentItem[]; assignedTo: string } {
  const nameLines = namesText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const allocLines = allocsText.split(/\r?\n/).map((line) => line.trim());

  const withoutTask = assignments.filter((entry) => entry.taskId !== taskId);

  if (nameLines.length === 0) {
    return { assignments: withoutTask, assignedTo: '' };
  }

  const parsed: AssignmentItem[] = [];
  for (let i = 0; i < nameLines.length; i++) {
    const resourceName = nameLines[i].slice(0, 256);
    let allocationPercent = 100;
    if (i < allocLines.length && allocLines[i]) {
      const value = Number(allocLines[i].replace(/%/g, '').trim());
      if (Number.isFinite(value) && value >= 0) {
        allocationPercent = value;
      }
    }
    if (allocationPercent <= 0) continue;
    parsed.push({ taskId, resourceName, allocationPercent });
  }

  if (parsed.length > 0) {
    return {
      assignments: [...withoutTask, ...parsed],
      assignedTo: parsed.map((entry) => entry.resourceName).join('\n'),
    };
  }

  return {
    assignments: withoutTask,
    assignedTo: nameLines.join('\n'),
  };
}
