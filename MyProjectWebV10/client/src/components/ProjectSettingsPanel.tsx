import { useEffect, useRef, useState } from 'react';
import { getProjectViewSettings, saveProjectViewSettings, updateProject, deleteProject } from '../api/client';
import {
  DEFAULT_GANTT_VIEW_SETTINGS,
  normalizeGanttViewSettings,
} from '../config/ganttViewSettings';
import type { GanttViewSettings, ProjectDetail } from '../types/project';
import { useLanguage } from '../i18n';
import type { AppLocale } from '../i18n/types';
import {
  localizedDependencyTypeOptions,
  localizedLineStyleOptions,
  localizedPathStyleOptions,
} from '../i18n/options';
import { getWorkingDayLabels } from '../i18n/translate';
import { recalculateScheduleForWorkingWeek } from '../utils/scheduleRecalculation';
import { toUpdatePayload, withRecalculatedSchedule } from '../utils/scheduleUtils';
import { renderDependencyPreview } from '../utils/dependencyLineRenderer';
import { LineEndStyleSelector } from './LineEndStyleSelector';
import {
  defaultWorkingWeek,
  hasAtLeastOneWorkingDay,
  parseWorkingWeek,
  serializeWorkingWeek,
  workingWeeksEqual,
  type WorkingWeek,
} from '../utils/workingWeek';
import { DateInput } from './DateInput';
import { toDateInputValue } from '../utils/taskDateInput';
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
  onDeletedProject?: () => void;
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
  onDeletedProject,
}: ProjectSettingsPanelProps) {
  const { locale, setLocale, t } = useLanguage();
  const workingDayLabels = getWorkingDayLabels(locale);
  const [tab, setTab] = useState<SettingsTab>('project');
  const [ganttForm, setGanttForm] = useState<GanttViewSettings>(DEFAULT_GANTT_VIEW_SETTINGS);
  const [projectName, setProjectName] = useState('');
  const [projectStart, setProjectStart] = useState('');
  const [workingDays, setWorkingDays] = useState<WorkingWeek>(defaultWorkingWeek());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      .catch((err) => setError(err instanceof Error ? err.message : t('settings.loadFailed')))
      .finally(() => setLoading(false));
  }, [open, projectId, project?.id, project?.name, project?.projectStart, project?.workingDaysJson, t]);

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
      messages.push(t('settings.gantt.saved'));

      if (canModify && project) {
        const trimmedName = projectName.trim();
        if (!trimmedName) {
          setError(t('settings.project.nameRequired'));
          return;
        }
        if (!hasAtLeastOneWorkingDay(workingDays)) {
          setError(t('settings.project.workingDaysRequired'));
          return;
        }

        const nextWorkingDaysJson = serializeWorkingWeek(workingDays);
        const nextProjectStart = fromDateInputValue(projectStart);
        const nameChanged = trimmedName !== project.name;
        const startChanged =
          nextProjectStart !== new Date(project.projectStart).toISOString();
        const weekChanged = !workingWeeksEqual(
          workingDays,
          parseWorkingWeek(project.workingDaysJson),
        );

        if (nameChanged || startChanged || weekChanged) {
          if (startChanged || weekChanged) {
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
            messages.push(t('settings.project.savedWithRecalc'));
          } else {
            const savedProject = withRecalculatedSchedule(
              await updateProject(projectId, {
                expectedVersion: project.version,
                name: trimmedName,
              }),
            );
            onSavedProject(savedProject);
            messages.push(t('settings.project.saved'));
          }
        }
      }

      setMessage(messages.join(' '));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (projectId == null || !project || !canModify) return;
    const confirmed = window.confirm(
      t('project.deleteConfirm', { name: project.name }),
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await deleteProject(projectId);
      onClose();
      onDeletedProject?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.project.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="project-settings-backdrop">
      <div className="project-settings-panel">
        <header>
          <h2>{t('settings.title')}</h2>
          <button type="button" className="panel-close-button" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        <div className="project-settings-tabs">
          <button
            type="button"
            className={tab === 'project' ? 'active' : ''}
            onClick={() => setTab('project')}
          >
            {t('settings.tab.project')}
          </button>
          <button
            type="button"
            className={tab === 'gantt' ? 'active' : ''}
            onClick={() => setTab('gantt')}
          >
            {t('settings.tab.gantt')}
          </button>
        </div>

        {loading ? (
          <div className="project-settings-loading">{t('settings.loading')}</div>
        ) : (
          <div className="project-settings-form">
            {tab === 'project' && (
              <section>
                <h3>{t('settings.project.title')}</h3>
                <p className="project-settings-section-note">{t('settings.project.note')}</p>

                <label>
                  {t('language.label')}
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as AppLocale)}
                    disabled={saving}
                  >
                    <option value="ko">{t('language.ko')}</option>
                    <option value="en">{t('language.en')}</option>
                  </select>
                </label>

                <label>
                  {t('settings.project.name')}
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    disabled={saving || !canModify}
                  />
                </label>

                <label>
                  {t('settings.project.start')}
                  <DateInput
                    value={projectStart}
                    onChange={setProjectStart}
                    disabled={saving || !canModify}
                  />
                </label>

                <div className="project-settings-working-days">
                  <span className="project-settings-working-days-label">
                    {t('settings.project.workingDays')}
                  </span>
                  <div className="project-settings-working-week">
                    <div className="project-settings-working-week-labels" aria-hidden="true">
                      {workingDayLabels.map((label) => (
                        <span key={label} className="project-settings-working-week-label">
                          {label}
                        </span>
                      ))}
                    </div>
                    <div
                      className="project-settings-working-week-buttons"
                      role="group"
                      aria-label={t('settings.project.workingDaysGroup')}
                    >
                      {workingDayLabels.map((label, index) => (
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
                          aria-label={t('settings.project.workingDayAria', {
                            day: label,
                            status: workingDays[index]
                              ? t('settings.project.workingDay')
                              : t('settings.project.nonWorkingDay'),
                          })}
                          aria-pressed={workingDays[index]}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {!canModify && (
                  <p className="project-settings-readonly-note">{t('settings.project.readonlyNote')}</p>
                )}

                {canModify && project && (
                  <div className="project-settings-danger-zone">
                    <h4>{t('settings.project.deleteTitle')}</h4>
                    <p>{t('settings.project.deleteNote')}</p>
                    <button
                      type="button"
                      className="project-settings-delete-button"
                      onClick={() => void handleDelete()}
                      disabled={saving || deleting}
                    >
                      {deleting ? t('common.deleting') : t('settings.project.delete')}
                    </button>
                  </div>
                )}
              </section>
            )}

            {tab === 'gantt' && (
              <section>
                <h3>{t('settings.gantt.title')}</h3>
                <p className="project-settings-section-note">{t('settings.gantt.note')}</p>

                <div className="project-settings-preview">
                  <svg ref={previewRef} className="project-settings-preview-svg" aria-hidden="true" />
                </div>

                <label>
                  {t('settings.gantt.defaultDepType')}
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
                    {localizedDependencyTypeOptions(t).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {t('settings.gantt.lineStyle')}
                  <select
                    value={ganttForm.lineStyle}
                    onChange={(e) => updateGanttField('lineStyle', e.target.value as GanttViewSettings['lineStyle'])}
                    disabled={saving}
                  >
                    {localizedLineStyleOptions(t).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {t('settings.gantt.pathStyle')}
                  <select
                    value={ganttForm.pathStyle}
                    onChange={(e) => updateGanttField('pathStyle', e.target.value as GanttViewSettings['pathStyle'])}
                    disabled={saving}
                  >
                    {localizedPathStyleOptions(t).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="settings-line-end-field">
                  <LineEndStyleSelector
                    label={t('settings.gantt.startLineEnd')}
                    value={ganttForm.startLineEnd}
                    atStart
                    disabled={saving}
                    onChange={(style) => updateGanttField('startLineEnd', style)}
                  />
                </div>

                <div className="settings-line-end-field">
                  <LineEndStyleSelector
                    label={t('settings.gantt.endLineEnd')}
                    value={ganttForm.endLineEnd}
                    atStart={false}
                    disabled={saving}
                    onChange={(style) => updateGanttField('endLineEnd', style)}
                  />
                </div>

                <label>
                  {t('settings.gantt.lineColor')}
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
                  {t('settings.gantt.showCriticalPath')}
                </label>

                <label>
                  {t('settings.gantt.criticalColor')}
                  <input
                    type="color"
                    value={ganttForm.criticalLineColor}
                    onChange={(e) => updateGanttField('criticalLineColor', e.target.value)}
                    disabled={saving}
                  />
                </label>

                <label>
                  {t('settings.gantt.curveRadius', { value: ganttForm.arrowCurve })}
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
          <button type="button" className="panel-footer-button" onClick={onClose} disabled={saving || deleting}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="panel-footer-button primary"
            onClick={() => void handleSave()}
            disabled={saving || deleting || loading}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
