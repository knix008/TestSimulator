import type { MpAssignment, MpDependency, MpNote, MpProject, MpTask } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { computeTaskEndDate } from '../utils/workingWeek.js';

export class ScheduleVersionConflictError extends Error {
  readonly currentVersion: string;
  readonly updatedUtc: string;
  readonly updatedBy: string | null;

  constructor(project: Pick<MpProject, 'version' | 'updatedUtc' | 'updatedBy'>) {
    super('다른 프로그램에서 일정이 변경되었습니다. 새로고침 후 다시 시도하세요.');
    this.name = 'ScheduleVersionConflictError';
    this.currentVersion = project.version.toString();
    this.updatedUtc = project.updatedUtc.toISOString();
    this.updatedBy = project.updatedBy;
  }
}

export interface ProjectSummaryDto {
  id: number;
  name: string;
  updatedUtc: string;
  version: string;
  updatedBy: string | null;
}

export interface TaskDto {
  taskId: number;
  parentId: number;
  name: string;
  startDate: string;
  durationDays: number;
  progress: number;
  taskType: string;
  indentLevel: number;
  isExpanded: boolean;
  assignedTo: string;
  notes: string;
  autoSchedule: boolean;
  deliverable: string;
  isCritical: boolean;
  endDate: string;
  barColorArgb: number | null;
  progressColorArgb: number | null;
}

export interface AssignmentDto {
  taskId: number;
  resourceName: string;
  allocationPercent: number;
}

export interface NoteDto {
  noteId: number;
  title: string;
  body: string;
  bodyRtf: string;
  taskId: number;
  offsetDays: number;
  anchorDate: string;
  contentY: number;
  contentX: number;
}

export interface DependencyDto {
  predecessorId: number;
  successorId: number;
  type: string;
  lagDays: number;
  startLineEnd: string | null;
  endLineEnd: string | null;
}

export interface ProjectDetailDto {
  id: number;
  name: string;
  projectStart: string;
  workingDaysJson: string;
  updatedUtc: string;
  version: string;
  updatedBy: string | null;
  tasks: TaskDto[];
  dependencies: DependencyDto[];
  assignments: AssignmentDto[];
  ganttNotes: NoteDto[];
}

export function toProjectSummary(project: MpProject): ProjectSummaryDto {
  return {
    id: project.id,
    name: project.name,
    updatedUtc: project.updatedUtc.toISOString(),
    version: project.version.toString(),
    updatedBy: project.updatedBy,
  };
}

export function toTaskDto(task: MpTask, workingDaysJson: string): TaskDto {
  const endDate = computeTaskEndDate(task.startDate, task.durationDays, task.taskType, workingDaysJson);
  return {
    taskId: task.taskId,
    parentId: task.parentId,
    name: task.name,
    startDate: task.startDate.toISOString(),
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
    endDate: endDate.toISOString(),
    barColorArgb: task.barColorArgb,
    progressColorArgb: task.progressColorArgb,
  };
}

export function toAssignmentDto(assignment: MpAssignment): AssignmentDto {
  return {
    taskId: assignment.taskId,
    resourceName: assignment.resourceName,
    allocationPercent: assignment.allocationPercent,
  };
}

export function toNoteDto(note: MpNote): NoteDto {
  return {
    noteId: note.noteId,
    title: note.title,
    body: note.body,
    bodyRtf: note.bodyRtf,
    taskId: note.taskId,
    offsetDays: note.offsetDays,
    anchorDate: note.anchorDate.toISOString(),
    contentY: note.contentY,
    contentX: note.contentX,
  };
}

export function toDependencyDto(dep: MpDependency): DependencyDto {
  return {
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
    type: dep.type,
    lagDays: dep.lagDays,
    startLineEnd: dep.startLineEnd,
    endLineEnd: dep.endLineEnd,
  };
}


export function createTemplateTasks(projectStart: Date): Array<Omit<MpTask, 'projectId'>> {
  const day = (offset: number) => {
    const d = new Date(projectStart);
    d.setDate(d.getDate() + offset);
    return d;
  };

  return [
    {
      taskId: 1,
      parentId: -1,
      name: 'Project planning',
      startDate: day(0),
      durationDays: 5,
      progress: 0,
      taskType: 'Normal',
      indentLevel: 0,
      isExpanded: true,
      assignedTo: '',
      notes: '',
      barColorArgb: null,
      progressColorArgb: null,
      bandColorArgb: null,
      autoSchedule: true,
      deliverable: '',
      isCritical: false,
      summaryBarStyle: null,
    },
    {
      taskId: 2,
      parentId: -1,
      name: 'Design phase',
      startDate: day(5),
      durationDays: 10,
      progress: 0,
      taskType: 'Normal',
      indentLevel: 0,
      isExpanded: true,
      assignedTo: '',
      notes: '',
      barColorArgb: null,
      progressColorArgb: null,
      bandColorArgb: null,
      autoSchedule: true,
      deliverable: '',
      isCritical: false,
      summaryBarStyle: null,
    },
    {
      taskId: 3,
      parentId: -1,
      name: 'Implementation',
      startDate: day(15),
      durationDays: 15,
      progress: 0,
      taskType: 'Normal',
      indentLevel: 0,
      isExpanded: true,
      assignedTo: '',
      notes: '',
      barColorArgb: null,
      progressColorArgb: null,
      bandColorArgb: null,
      autoSchedule: true,
      deliverable: '',
      isCritical: false,
      summaryBarStyle: null,
    },
    {
      taskId: 4,
      parentId: -1,
      name: 'Project complete',
      startDate: day(30),
      durationDays: 0,
      progress: 0,
      taskType: 'Milestone',
      indentLevel: 0,
      isExpanded: true,
      assignedTo: '',
      notes: '',
      barColorArgb: null,
      progressColorArgb: null,
      bandColorArgb: null,
      autoSchedule: true,
      deliverable: '',
      isCritical: false,
      summaryBarStyle: null,
    },
  ];
}

export function createTemplateDependencies(): Array<Omit<MpDependency, 'projectId'>> {
  return [
    { predecessorId: 1, successorId: 2, type: 'FS', lagDays: 0, startLineEnd: null, endLineEnd: 'Arrow' },
    { predecessorId: 2, successorId: 3, type: 'FS', lagDays: 0, startLineEnd: null, endLineEnd: 'Arrow' },
    { predecessorId: 3, successorId: 4, type: 'FS', lagDays: 0, startLineEnd: null, endLineEnd: 'Arrow' },
  ];
}

export interface UpdateScheduleInput {
  expectedVersion?: string;
  updatedBy?: string;
  name?: string;
  projectStart?: string;
  workingDaysJson?: string;
  tasks?: Array<{
    taskId: number;
    parentId: number;
    name: string;
    startDate: string;
    durationDays: number;
    progress: number;
    taskType: string;
    indentLevel: number;
    isExpanded: boolean;
    assignedTo: string;
    notes: string;
    autoSchedule: boolean;
    deliverable: string;
    isCritical: boolean;
  }>;
  dependencies?: Array<{
    predecessorId: number;
    successorId: number;
    type: string;
    lagDays: number;
    startLineEnd?: string | null;
    endLineEnd?: string | null;
  }>;
  assignments?: Array<{
    taskId: number;
    resourceName: string;
    allocationPercent: number;
  }>;
  ganttNotes?: Array<{
    noteId: number;
    title: string;
    body: string;
    bodyRtf: string;
    taskId: number;
    offsetDays: number;
    anchorDate: string;
    contentY: number;
    contentX: number;
  }>;
}

export async function listProjects(): Promise<ProjectSummaryDto[]> {
  const projects = await prisma.mpProject.findMany({
    orderBy: { updatedUtc: 'desc' },
  });
  return projects.map(toProjectSummary);
}

export async function getProjectById(id: number): Promise<ProjectDetailDto | null> {
  const project = await prisma.mpProject.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { taskId: 'asc' } },
      dependencies: true,
      assignments: true,
      notes: true,
    },
  });

  if (!project) return null;

  return {
    id: project.id,
    name: project.name,
    projectStart: project.projectStart.toISOString(),
    workingDaysJson: project.workingDaysJson,
    updatedUtc: project.updatedUtc.toISOString(),
    version: project.version.toString(),
    updatedBy: project.updatedBy,
    tasks: project.tasks.map((task) => toTaskDto(task, project.workingDaysJson)),
    dependencies: project.dependencies.map(toDependencyDto),
    assignments: project.assignments.map(toAssignmentDto),
    ganttNotes: project.notes.map(toNoteDto),
  };
}

export async function createProject(name?: string): Promise<ProjectDetailDto> {
  const projectStart = new Date();
  projectStart.setHours(0, 0, 0, 0);
  const workingDays = JSON.stringify([false, true, true, true, true, true, false]);

  const created = await prisma.mpProject.create({
    data: {
      name: name?.trim() || 'New Project',
      projectStart,
      workingDaysJson: workingDays,
      tasks: {
        create: createTemplateTasks(projectStart),
      },
      dependencies: {
        create: createTemplateDependencies(),
      },
    },
    include: {
      tasks: { orderBy: { taskId: 'asc' } },
      dependencies: true,
      assignments: true,
      notes: true,
    },
  });

  return {
    id: created.id,
    name: created.name,
    projectStart: created.projectStart.toISOString(),
    workingDaysJson: created.workingDaysJson,
    updatedUtc: created.updatedUtc.toISOString(),
    version: created.version.toString(),
    updatedBy: created.updatedBy,
    tasks: created.tasks.map((task) => toTaskDto(task, created.workingDaysJson)),
    dependencies: created.dependencies.map(toDependencyDto),
    assignments: created.assignments.map(toAssignmentDto),
    ganttNotes: created.notes.map(toNoteDto),
  };
}

function preserveWinTaskFields(
  projectId: number,
  existing: MpTask | undefined,
  task: NonNullable<UpdateScheduleInput['tasks']>[number],
) {
  return {
    projectId,
    taskId: task.taskId,
    parentId: task.parentId,
    name: task.name,
    startDate: new Date(task.startDate),
    durationDays:
      task.taskType === 'Milestone' ? 0 : Math.max(1, task.durationDays),
    progress: task.progress,
    taskType: task.taskType,
    indentLevel: task.indentLevel,
    isExpanded: task.isExpanded,
    assignedTo: task.assignedTo,
    notes: task.notes,
    autoSchedule: task.autoSchedule,
    deliverable: task.deliverable,
    isCritical: task.isCritical,
    barColorArgb: existing?.barColorArgb ?? null,
    progressColorArgb: existing?.progressColorArgb ?? null,
    bandColorArgb: existing?.bandColorArgb ?? null,
    summaryBarStyle: existing?.summaryBarStyle ?? null,
  };
}

export async function updateProjectSchedule(
  id: number,
  input: UpdateScheduleInput,
): Promise<ProjectDetailDto | null> {
  const existing = await prisma.mpProject.findUnique({ where: { id } });
  if (!existing) return null;

  if (
    input.expectedVersion &&
    existing.version.toString() !== input.expectedVersion
  ) {
    throw new ScheduleVersionConflictError(existing);
  }

  await prisma.$transaction(async (tx) => {
    const existingTasks = input.tasks
      ? await tx.mpTask.findMany({ where: { projectId: id } })
      : [];
    const existingTaskById = new Map(existingTasks.map((task) => [task.taskId, task]));

    await tx.mpProject.update({
      where: { id },
      data: {
        name: input.name,
        projectStart: input.projectStart ? new Date(input.projectStart) : undefined,
        workingDaysJson: input.workingDaysJson,
        updatedUtc: new Date(),
        updatedBy: input.updatedBy,
        version: { increment: 1 },
      },
    });

    if (input.tasks) {
      await tx.mpTask.deleteMany({ where: { projectId: id } });
      if (input.tasks.length > 0) {
        await tx.mpTask.createMany({
          data: input.tasks.map((task) =>
            preserveWinTaskFields(id, existingTaskById.get(task.taskId), task),
          ),
        });
      }
    }

    if (input.dependencies) {
      await tx.mpDependency.deleteMany({ where: { projectId: id } });
      if (input.dependencies.length > 0) {
        await tx.mpDependency.createMany({
          data: input.dependencies.map((dep) => ({
            projectId: id,
            predecessorId: dep.predecessorId,
            successorId: dep.successorId,
            type: dep.type,
            lagDays: dep.lagDays,
            startLineEnd: dep.startLineEnd ?? null,
            endLineEnd: dep.endLineEnd ?? null,
          })),
        });
      }
    }

    if (input.assignments) {
      await tx.mpAssignment.deleteMany({ where: { projectId: id } });
      if (input.assignments.length > 0) {
        await tx.mpAssignment.createMany({
          data: input.assignments.map((assignment) => ({
            projectId: id,
            taskId: assignment.taskId,
            resourceName: assignment.resourceName.slice(0, 256),
            allocationPercent: Math.max(0, assignment.allocationPercent),
          })),
        });
      }
    }

    if (input.ganttNotes) {
      await tx.mpNote.deleteMany({ where: { projectId: id } });
      if (input.ganttNotes.length > 0) {
        await tx.mpNote.createMany({
          data: input.ganttNotes.map((note) => ({
            projectId: id,
            noteId: note.noteId,
            title: note.title.slice(0, 256),
            body: note.body,
            bodyRtf: note.bodyRtf,
            taskId: note.taskId,
            offsetDays: note.offsetDays,
            anchorDate: new Date(note.anchorDate),
            contentY: note.contentY,
            contentX: note.contentX,
          })),
        });
      }
    }
  });

  return getProjectById(id);
}

export async function deleteProject(id: number): Promise<boolean> {
  const existing = await prisma.mpProject.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;

  await prisma.mpProject.delete({ where: { id } });
  return true;
}
