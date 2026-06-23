import { useEffect, useRef, useState } from 'react';
import { getProjectViewSettings, saveProjectViewSettings, updateProject } from '../api/client';
import {
  DEFAULT_GANTT_VIEW_SETTINGS,
  DEPENDENCY_TYPE_OPTIONS,
  LINE_END_OPTIONS,
  LINE_STYLE_OPTIONS,
  PATH_STYLE_OPTIONS,
  normalizeGanttViewSettings,
} from '../config/ganttViewSettings';
import type { GanttViewSettings, ProjectDetail } from '../types/project';
import { recalculateScheduleForWorkingWeek } from '../utils/scheduleRecalculation';
import { toUpdatePayload, withRecalculatedSchedule } from '../utils/scheduleUtils';
import { renderDependencyPreview } from '../utils/dependencyLineRenderer';
import {
  WORKING_DAY_LABELS,
  defaultWorkingWeek,
  hasAtLeastOneWorkingDay,
  parseWorkingWeek,
  serializeWorkingWeek,
  workingWeeksEqual,
  type WorkingWeek,
} from '../utils/workingWeek';
import './ProjectSettingsPanel.css';

type SettingsTab = 'project' | 'gantt';

interface ProjectSettingsPanelProps {
  open: boolean;
  projectId: number | null;
  project: ProjectDetail | null;
  canModify: boolean;
  onClose: () => void;
  onSavedViewSettings: (settings: GanttViewSettings) => void;
  onSavedProject: (project: ProjectDetail) => void;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function ProjectSettingsPanel({
  open,
  projectId,
  project,
  canModify,
  onClose,
  onSavedViewSettings,
  onSavedProject,
}: ProjectSettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>('project');
  const [ganttForm, setGanttForm] = useState<GanttViewSettings>(DEFAULT_GANTT_VIEW_SETTINGS);
  const [projectName, setProjectName] = useState('');
  const [projectStart, setProjectStart] = useState('');
  const [workingDays, setWorkingDays] = useState<WorkingWeek>(defaultWorkingWeek());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const previewRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open || projectId == null) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setTab('project');

    if (project) {
      setProjectName(project.name);
      setProjectStart(toDateInputValue(project.projectStart));
      setWorkingDays(parseWorkingWeek(project.workingDaysJson));
    }

    getProjectViewSettings(projectId)
      .then((settings) => setGanttForm(normalizeGanttViewSettings(settings)))
      .catch((err) => setError(err instanceof Error ? err.message : '설정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [open, projectId, project?.id, project?.name, project?.projectStart, project?.workingDaysJson]);

  useEffect(() => {
    if (!open || !previewRef.current) return;
    renderDependencyPreview(previewRef.current, ganttForm);
  }, [open, ganttForm]);

  if (!open) return null;

  const updateGanttField = <K extends keyof GanttViewSettings>(
    key: K,
    value: GanttViewSettings[K],
  ) => {
    setGanttForm((current) => ({ ...current, [key]: value }));
  };

  const toggleWorkingDay = (index: number) => {
    setWorkingDays((current) => {
      if (current[index] && current.filter(Boolean).length <= 1) {
        return current;
      }
      const next = [...current] as WorkingWeek;
      next[index] = !next[index];
      return next;
    });
  };

  const handleSave = async () => {
    if (projectId == null) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const messages: string[] = [];

      const viewSaved = await saveProjectViewSettings(projectId, ganttForm);
      const normalizedView = normalizeGanttViewSettings(viewSaved);
      setGanttForm(normalizedView);
      onSavedViewSettings(normalizedView);
      messages.push('Gantt 연결선 설정이 저장되었습니다.');

      if (canModify && project) {
        const trimmedName = projectName.trim();
        if (!trimmedName) {
          setError('프로젝트 이름을 입력하세요.');
          return;
        }
        if (!hasAtLeastOneWorkingDay(workingDays)) {
          setError('최소 하나 이상의 근무일을 선택하세요.');
          return;
        }

        const nextWorkingDaysJson = serializeWorkingWeek(workingDays);
        const nextProjectStart = fromDateInputValue(projectStart);
        const scheduleChanged =
          trimmedName !== project.name ||
          nextProjectStart !== new Date(project.projectStart).toISOString() ||
          !workingWeeksEqual(workingDays, parseWorkingWeek(project.workingDaysJson));

        if (scheduleChanged) {
          const recalculatedTasks = recalculateScheduleForWorkingWeek(
            project.tasks,
            project.dependencies,
            {
              projectStart: nextProjectStart,
              workingDaysJson: nextWorkingDaysJson,
            },
          );

          const savedProject = withRecalculatedSchedule(
            await updateProject(projectId, {
              expectedVersion: project.version,
              name: trimmedName,
              projectStart: nextProjectStart,
              workingDaysJson: nextWorkingDaysJson,
              tasks: toUpdatePayload({
                ...project,
                name: trimmedName,
                projectStart: nextProjectStart,
                workingDaysJson: nextWorkingDaysJson,
                tasks: recalculatedTasks,
              }).tasks,
              dependencies: project.dependencies,
            }),
          );

          onSavedProject(savedProject);
          messages.push('프로젝트 일정 설정이 저장되었고 일정이 다시 계산되었습니다.');
        }
      }

      setMessage(messages.join(' '));
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-settings-backdrop">
      <div className="project-settings-panel">
        <header>
          <h2>과제 설정</h2>
          <button type="button" className="panel-close-button" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="project-settings-tabs">
          <button
            type="button"
            className={tab === 'project' ? 'active' : ''}
            onClick={() => setTab('project')}
          >
            프로젝트 일정
          </button>
          <button
            type="button"
            className={tab === 'gantt' ? 'active' : ''}
            onClick={() => setTab('gantt')}
          >
            Gantt 표시
          </button>
        </div>

        {loading ? (
          <div className="project-settings-loading">설정 불러오는 중…</div>
        ) : (
          <div className="project-settings-form">
            {tab === 'project' && (
              <section>
                <h3>프로젝트 일정</h3>
                <p className="project-settings-section-note">
                  근무일 설정은 프로젝트 전체에 적용됩니다. 변경 시 작업 날짜와 간트 차트가
                  다시 계산됩니다.
                </p>

                <label>
                  프로젝트 이름
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    disabled={saving || !canModify}
                  />
                </label>

                <label>
                  프로젝트 시작일
                  <input
                    type="date"
                    value={projectStart}
                    onChange={(e) => setProjectStart(e.target.value)}
                    disabled={saving || !canModify}
                  />
                </label>

                <div className="project-settings-working-days">
                  <span className="project-settings-working-days-label">주간 근무일</span>
                  <div className="project-settings-working-week">
                    <div className="project-settings-working-week-labels" aria-hidden="true">
                      {WORKING_DAY_LABELS.map((label) => (
                        <span key={label} className="project-settings-working-week-label">
                          {label}
                        </span>
                      ))}
                    </div>
                    <div
                      className="project-settings-working-week-buttons"
                      role="group"
                      aria-label="주간 근무일 선택"
                    >
                      {WORKING_DAY_LABELS.map((label, index) => (
                        <button
                          key={label}
                          type="button"
                          className={
                            workingDays[index]
                              ? 'project-settings-working-day-btn is-working'
                              : 'project-settings-working-day-btn'
                          }
                          onClick={() => toggleWorkingDay(index)}
                          disabled={saving || !canModify}
                          aria-label={`${label}요일 ${workingDays[index] ? '근무일' : '비근무일'}`}
                          aria-pressed={workingDays[index]}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {!canModify && (
                  <p className="project-settings-readonly-note">
                    프로젝트 일정 설정은 수정 권한이 있는 사용자만 저장할 수 있습니다.
                  </p>
                )}
              </section>
            )}

            {tab === 'gantt' && (
              <section>
                <h3>Gantt 연결선</h3>
                <p className="project-settings-section-note">
                  연결선 스타일은 <strong>로그인한 사용자마다</strong> 별도로 저장됩니다.
                </p>

                <div className="project-settings-preview">
                  <svg ref={previewRef} className="project-settings-preview-svg" aria-hidden="true" />
                </div>

                <label>
                  기본 의존성 종류
                  <select
                    value={ganttForm.defaultDependencyType}
                    onChange={(e) =>
                      updateGanttField(
                        'defaultDependencyType',
                        e.target.value as GanttViewSettings['defaultDependencyType'],
                      )
                    }
                    disabled={saving}
                  >
                    {DEPENDENCY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  선 종류
                  <select
                    value={ganttForm.lineStyle}
                    onChange={(e) => updateGanttField('lineStyle', e.target.value as GanttViewSettings['lineStyle'])}
                    disabled={saving}
                  >
                    {LINE_STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  경로 형태
                  <select
                    value={ganttForm.pathStyle}
                    onChange={(e) => updateGanttField('pathStyle', e.target.value as GanttViewSettings['pathStyle'])}
                    disabled={saving}
                  >
                    {PATH_STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  선 시작 도형
                  <select
                    value={ganttForm.startLineEnd}
                    onChange={(e) => updateGanttField('startLineEnd', e.target.value as GanttViewSettings['startLineEnd'])}
                    disabled={saving}
                  >
                    {LINE_END_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  선 끝 도형
                  <select
                    value={ganttForm.endLineEnd}
                    onChange={(e) => updateGanttField('endLineEnd', e.target.value as GanttViewSettings['endLineEnd'])}
                    disabled={saving}
                  >
                    {LINE_END_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  연결선 색상
                  <input
                    type="color"
                    value={ganttForm.lineColor}
                    onChange={(e) => updateGanttField('lineColor', e.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className="project-settings-checkbox">
                  <input
                    type="checkbox"
                    checked={ganttForm.showCriticalPath}
                    onChange={(e) => updateGanttField('showCriticalPath', e.target.checked)}
                    disabled={saving}
                  />
                  주요 경로(Critical Path) 표시
                </label>

                <label>
                  주요 경로(Critical) 색상
                  <input
                    type="color"
                    value={ganttForm.criticalLineColor}
                    onChange={(e) => updateGanttField('criticalLineColor', e.target.value)}
                    disabled={saving}
                  />
                </label>

                <label>
                  곡선 반경 ({ganttForm.arrowCurve})
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={ganttForm.arrowCurve}
                    onChange={(e) => updateGanttField('arrowCurve', Number(e.target.value))}
                    disabled={saving || ganttForm.pathStyle !== 'curved'}
                  />
                </label>
              </section>
            )}
          </div>
        )}

        {message && <div className="project-settings-message">{message}</div>}
        {error && <div className="project-settings-error">{error}</div>}

        <footer>
          <button type="button" className="panel-footer-button" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="button"
            className="panel-footer-button primary"
            onClick={() => void handleSave()}
            disabled={saving || loading}
          >
            저장
          </button>
        </footer>
      </div>
    </div>
  );
}
