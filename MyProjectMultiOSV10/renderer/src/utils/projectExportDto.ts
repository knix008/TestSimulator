import type { ProjectDetail } from '@web/types/project';
import type { ExportProject } from '../types/exportProject';

export function projectToExportDto(project: ProjectDetail): ExportProject {
  return {
    name: project.name,
    projectStart: project.projectStart,
    workingDaysJson: project.workingDaysJson,
    tasks: project.tasks.map((task) => ({
      taskId: task.taskId,
      parentId: task.parentId,
      name: task.name,
      startDate: task.startDate,
      endDate: task.endDate,
      durationDays: task.durationDays,
      progress: task.progress,
      taskType: task.taskType,
      indentLevel: task.indentLevel,
      isExpanded: task.isExpanded,
      assignedTo: task.assignedTo,
      notes: task.notes,
      autoSchedule: task.autoSchedule,
      deliverable: task.deliverable,
      isCritical: task.isCritical,
      barColorArgb: task.barColorArgb,
      progressColorArgb: task.progressColorArgb,
    })),
    dependencies: project.dependencies.map((dep) => ({
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      type: dep.type,
      lagDays: dep.lagDays,
    })),
    assignments: (project.assignments ?? []).map((a) => ({
      taskId: a.taskId,
      resourceName: a.resourceName,
      allocationPercent: a.allocationPercent,
    })),
    ganttNotes: (project.ganttNotes ?? []).map((note) => ({
      noteId: note.noteId,
      title: note.title,
      body: note.body,
      bodyRtf: note.bodyRtf,
      taskId: note.taskId,
      anchorDate: note.anchorDate,
    })),
  };
}
