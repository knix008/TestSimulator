export interface AssignmentItem {
  taskId: number;
  resourceName: string;
  allocationPercent: number;
}

export interface NoteItem {
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

export interface ProjectSummary {
  id: number;
  name: string;
  updatedUtc: string;
  version: string;
  updatedBy?: string | null;
}

export interface TaskItem {
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
  barColorArgb?: number | null;
  progressColorArgb?: number | null;
}

export interface DependencyItem {
  predecessorId: number;
  successorId: number;
  type: string;
  lagDays: number;
  startLineEnd?: string | null;
  endLineEnd?: string | null;
}

export interface GanttViewSettings {
  defaultDependencyType: 'FS' | 'FF' | 'SS' | 'SF';
  lineColor: string;
  criticalLineColor: string;
  lineStyle: 'solid' | 'dash' | 'dot';
  startLineEnd: 'None' | 'Arrow' | 'OpenArrow' | 'Dot' | 'Square';
  endLineEnd: 'None' | 'Arrow' | 'OpenArrow' | 'Dot' | 'Square';
  arrowCurve: number;
  pathStyle: 'curved' | 'orthogonal';
  showCriticalPath: boolean;
}

export interface ProjectDetail {
  id: number;
  name: string;
  projectStart: string;
  workingDaysJson: string;
  updatedUtc: string;
  version: string;
  updatedBy?: string | null;
  tasks: TaskItem[];
  dependencies: DependencyItem[];
  assignments: AssignmentItem[];
  ganttNotes: NoteItem[];
}

export interface DatabaseConfigInfo {
  provider: string;
  providerDisplayName: string;
  database: string;
  connected: boolean;
  connectionError: string | null;
  requiresAdminSetup: boolean;
  supportedProviders: Array<{ id: string; name: string }>;
}

export interface AuthSession {
  authenticated: boolean;
  userId?: number;
  username?: string;
  role?: string;
  canRead?: boolean;
  canModify?: boolean;
  isAdmin?: boolean;
  bootstrap?: boolean;
}

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
  canRead: boolean;
  canModify: boolean;
  isActive: boolean;
  createdUtc: string;
  updatedUtc: string;
}

export interface CreateUserInput {
  username: string;
  displayName?: string;
  email?: string;
  password: string;
  role: 'admin' | 'user';
  canRead?: boolean;
  canModify?: boolean;
  isActive?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  displayName?: string;
  email?: string;
  password?: string;
  role?: 'admin' | 'user';
  canRead?: boolean;
  canModify?: boolean;
  isActive?: boolean;
}

export interface UpdateOwnProfileInput {
  currentPassword: string;
  username?: string;
  password?: string;
  displayName?: string;
  email?: string;
}

export interface UserProfile extends AppUser {
  bootstrap?: boolean;
  storedInDatabase?: boolean;
}

export interface AdminDatabaseSettings {
  provider: string;
  providerDisplayName: string;
  host: string;
  port: number;
  database: string;
  user: string;
  file?: string;
  hasPassword: boolean;
  connected: boolean;
  connectionError: string | null;
  supportedProviders: Array<{ id: string; name: string; defaultPort: number }>;
}

export interface DatabaseApplyResult {
  databaseCreated: boolean;
  schemaApplied: boolean;
  message: string;
}

export type DbProviderId = 'mariadb' | 'mysql' | 'sqlite' | 'postgresql' | 'sqlserver';

export interface DatabaseSettingsInput {
  provider: DbProviderId;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  file?: string;
}
