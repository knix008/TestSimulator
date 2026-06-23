import type { DatabaseConfigInfo, ProjectSummary } from '../types/project';

import { ToolbarButton } from './ToolbarButton';

import './ProjectToolbar.css';



interface ProjectToolbarProps {

  dbConfig: DatabaseConfigInfo | null;

  projects: ProjectSummary[];

  currentProjectId: number | null;

  loading: boolean;

  isAdmin: boolean;

  canModify: boolean;

  canRead: boolean;

  username: string | null;

  linkMode: boolean;

  saveStatus: 'idle' | 'saving' | 'saved' | 'error';

  hasUnsavedChanges?: boolean;

  onSaveSchedule?: () => void;

  scheduleRevision: {

    updatedUtc: string;

    updatedBy: string | null;

    version: string;

  } | null;

  onSelectProject: (id: number) => void;

  onCreateProject: () => void;

  onRefresh: () => void;

  onLogout: () => void;

  onOpenDatabaseSettings: () => void;

  onOpenUserManagement: () => void;

  onOpenMyAccount: () => void;

  onOpenProjectSettings: () => void;

  onToggleLinkMode: () => void;

  onAddTask?: () => void;

  onAddSubtask?: () => void;

  onDeleteTask?: () => void;

  canDeleteTask?: boolean;

  onIndentTask?: () => void;

  onOutdentTask?: () => void;

  canIndentTask?: boolean;

  canOutdentTask?: boolean;

  showCriticalPath?: boolean;

  onToggleCriticalPath?: () => void;

  onGoToToday?: () => void;

  canGoToToday?: boolean;

}



export function ProjectToolbar({

  dbConfig,

  projects,

  currentProjectId,

  loading,

  isAdmin,

  canModify,

  canRead,

  username,

  linkMode,

  saveStatus,

  hasUnsavedChanges = false,

  onSaveSchedule,

  scheduleRevision,

  onSelectProject,

  onCreateProject,

  onRefresh,

  onLogout,

  onOpenDatabaseSettings,

  onOpenUserManagement,

  onOpenMyAccount,

  onOpenProjectSettings,

  onToggleLinkMode,

  onAddTask,

  onAddSubtask,

  onDeleteTask,

  canDeleteTask = false,

  onIndentTask,

  onOutdentTask,

  canIndentTask = false,

  canOutdentTask = false,

  showCriticalPath = false,

  onToggleCriticalPath,

  onGoToToday,

  canGoToToday = false,

}: ProjectToolbarProps) {

  const saveLabel =

    saveStatus === 'saving'

      ? '저장 중…'

      : saveStatus === 'saved'

        ? '저장됨'

        : saveStatus === 'error'

          ? '저장 실패'

          : null;



  return (

    <header className="project-toolbar">

      <div className="toolbar-brand">

        <strong>MyProject Web</strong>

        <span className="toolbar-subtitle">과제 일정 관리</span>

      </div>



      <div className="toolbar-actions">

        <label className="toolbar-field">

          프로젝트

          <select

            value={currentProjectId ?? ''}

            onChange={(e) => onSelectProject(Number(e.target.value))}

            disabled={loading || projects.length === 0 || dbConfig?.requiresAdminSetup}

          >

            {projects.length === 0 ? (

              <option value="">프로젝트 없음</option>

            ) : (

              projects.map((project) => (

                <option key={project.id} value={project.id}>

                  {project.name}

                </option>

              ))

            )}

          </select>

        </label>



        <ToolbarButton

          icon="newProject"

          onClick={onCreateProject}

          disabled={loading || dbConfig?.requiresAdminSetup || !canModify}

          title="Win 프로그램에서 만드는 것을 권장합니다"

        >

          새 프로젝트

        </ToolbarButton>

        <ToolbarButton

          icon="refresh"

          onClick={onRefresh}

          disabled={loading}

          title="Win 프로그램 변경 사항 반영"

        >

          새로고침

        </ToolbarButton>



        {canRead && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton icon="settings" onClick={onOpenProjectSettings} disabled={loading}>

            과제 설정

          </ToolbarButton>

        )}



        {canRead && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton

            icon="today"

            onClick={onGoToToday}

            disabled={loading || !canGoToToday}

            title="간트 차트를 오늘 날짜로 스크롤합니다 (Ctrl+T). 빨간 점선·상단 원과 헤더의 검은 배경 숫자가 오늘 날짜입니다."

          >

            오늘로 이동

          </ToolbarButton>

        )}



        {canRead && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton

            icon="criticalPath"

            className={showCriticalPath ? 'toolbar-active' : ''}

            onClick={onToggleCriticalPath}

            disabled={loading}

            title="주요 경로(Critical Path) 표시"

          >

            주요 경로

          </ToolbarButton>

        )}



        {canModify && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton

            icon="save"

            onClick={onSaveSchedule}

            disabled={loading || saveStatus === 'saving' || !hasUnsavedChanges}

            title="일정을 DB에 저장"

          >

            {saveStatus === 'saving' ? '저장 중…' : hasUnsavedChanges ? '저장' : '저장됨'}

          </ToolbarButton>

        )}



        {canModify && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <>

            <ToolbarButton icon="addTask" onClick={onAddTask} disabled={loading} title="Insert">

              작업 추가

            </ToolbarButton>

            <ToolbarButton icon="addSubtask" onClick={onAddSubtask} disabled={loading} title="하위 작업 추가">

              하위 작업

            </ToolbarButton>

            <ToolbarButton

              icon="deleteTask"

              onClick={onDeleteTask}

              disabled={loading || !canDeleteTask}

              title="Delete"

            >

              작업 삭제

            </ToolbarButton>

            <ToolbarButton

              icon="indent"

              onClick={onIndentTask}

              disabled={loading || !canIndentTask}

              title="하위 작업으로 이동 (Alt+→)"

            >

              들여쓰기

            </ToolbarButton>

            <ToolbarButton

              icon="outdent"

              onClick={onOutdentTask}

              disabled={loading || !canOutdentTask}

              title="상위 작업으로 이동 (Alt+←)"

            >

              내어쓰기

            </ToolbarButton>

            <ToolbarButton

              icon="link"

              className={linkMode ? 'toolbar-active' : ''}

              onClick={onToggleLinkMode}

              disabled={loading}

            >

              {linkMode ? '의존성 연결 중' : '의존성 연결'}

            </ToolbarButton>

          </>

        )}



        {saveLabel && (

          <span className={`toolbar-save-status toolbar-save-${saveStatus}`}>

            {saveLabel}

            {hasUnsavedChanges && saveStatus !== 'saving' ? ' · 미저장 변경' : ''}

          </span>

        )}



        {isAdmin && (

          <>

            <ToolbarButton icon="database" onClick={onOpenDatabaseSettings}>

              DB 설정

            </ToolbarButton>

            <ToolbarButton

              icon="users"

              onClick={onOpenUserManagement}

              disabled={dbConfig?.requiresAdminSetup}

            >

              사용자 관리

            </ToolbarButton>

          </>

        )}



        <ToolbarButton icon="account" onClick={onOpenMyAccount}>

          내 계정

        </ToolbarButton>



        <ToolbarButton icon="logout" onClick={onLogout}>

          로그아웃 ({username})

        </ToolbarButton>

      </div>



      {dbConfig && (

        <div className={`toolbar-db ${dbConfig.connected ? '' : 'toolbar-db-error'}`}>

          <div>

            DB: {dbConfig.providerDisplayName} / {dbConfig.database}

            {!dbConfig.connected && ' (연결 안 됨)'}

          </div>

          {scheduleRevision && dbConfig.connected && (

            <div className="toolbar-revision">

              버전 {scheduleRevision.version} ·{' '}

              {new Date(scheduleRevision.updatedUtc).toLocaleString('ko-KR')}

              {scheduleRevision.updatedBy ? ` · ${scheduleRevision.updatedBy}` : ''}

            </div>

          )}

        </div>

      )}

    </header>

  );

}


