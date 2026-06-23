import type { MpDependency, MpProject, MpTask } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

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

export function toTaskDto(task: MpTask): TaskDto {
  const endDate = computeEndDate(task.startDate, task.durationDays, task.taskType);
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

function computeEndDate(startDate: Date, durationDays: number, taskType: string): Date {
  if (taskType === 'Milestone') {
    return startDate;
  }
  const end = new Date(startDate);
  end.setDate(end.getDate() + Math.max(1, durationDays) - 1);
  return end;
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
      durationDays: 1,
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
    tasks: project.tasks.map(toTaskDto),
    dependencies: project.dependencies.map(toDependencyDto),
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
    tasks: created.tasks.map(toTaskDto),
    dependencies: created.dependencies.map(toDependencyDto),
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
  });

  return getProjectById(id);
}
