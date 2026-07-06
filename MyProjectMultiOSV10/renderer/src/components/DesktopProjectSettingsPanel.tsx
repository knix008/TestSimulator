import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_GANTT_VIEW_SETTINGS,
  normalizeGanttViewSettings,
} from '@web/config/ganttViewSettings';
import type { GanttViewSettings, ProjectDetail } from '@web/types/project';
import { useLanguage } from '@web/i18n';
import type { AppLocale } from '@web/i18n/types';
import {
  localizedDependencyTypeOptions,
  localizedLineStyleOptions,
  localizedPathStyleOptions,
} from '@web/i18n/options';
import { getWorkingDayLabels } from '@web/i18n/translate';
import { recalculateScheduleForWorkingWeek } from '@web/utils/scheduleRecalculation';
import { withRecalculatedSchedule } from '@web/utils/scheduleUtils';
import { renderDependencyPreview } from '@web/utils/dependencyLineRenderer';
import { LineEndStyleSelector } from '@web/components/LineEndStyleSelector';
import {
  defaultWorkingWeek,
  hasAtLeastOneWorkingDay,
  parseWorkingWeek,
  serializeWorkingWeek,
  workingWeeksEqual,
  type WorkingWeek,
} from '@web/utils/workingWeek';
import { DateInput } from '@web/components/DateInput';
import { toDateInputValue } from '@web/utils/taskDateInput';
import '@web/components/ProjectSettingsPanel.css';

type SettingsTab = 'project' | 'gantt';

interface DesktopProjectSettingsPanelProps {
  open: boolean;
  project: ProjectDetail | null;
  ganttViewSettings: GanttViewSettings;
  onClose: () => void;
  onSave: (project: ProjectDetail, ganttViewSettings: GanttViewSettings) => void;
}

function fromDateInputValue(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function DesktopProjectSettingsPanel({
  open,
  project,
  ganttViewSettings,
  onClose,
  onSave,
}: DesktopProjectSettingsPanelProps) {
  const { locale, setLocale, t } = useLanguage();
  const workingDayLabels = getWorkingDayLabels(locale);
  const [tab, setTab] = useState<SettingsTab>('project');
  const [ganttForm, setGanttForm] = useState<GanttViewSettings>(DEFAULT_GANTT_VIEW_SETTINGS);
  const [projectName, setProjectName] = useState('');
  const [projectStart, setProjectStart] = useState('');
  const [workingDays, setWorkingDays] = useState<WorkingWeek>(defaultWorkingWeek());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const previewRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open || !project) return;
    setError(null);
    setMessage(null);
    setTab('project');
    setProjectName(project.name);
    setProjectStart(toDateInputValue(project.projectStart));
    setWorkingDays(parseWorkingWeek(project.workingDaysJson));
    setGanttForm(normalizeGanttViewSettings(ganttViewSettings));
  }, [open, project, ganttViewSettings]);

  useEffect(() => {
    if (!open || !previewRef.current) return;
    renderDependencyPreview(previewRef.current, ganttForm);
  }, [open, ganttForm]);

  if (!open || !project) return null;

  const updateGanttField = <K extends keyof GanttViewSettings>(key: K, value: GanttViewSettings[K]) => {
    setGanttForm((current) => ({ ...current, [key]: value }));
  };

  const toggleWorkingDay = (index: number) => {
    setWorkingDays((current) => {
      if (current[index] && current.filter(Boolean).length <= 1) return current;
      const next = [...current] as WorkingWeek;
      next[index] = !next[index];
      return next;
    });
  };

  const handleSave = () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
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
      const normalizedView = normalizeGanttViewSettings(ganttForm);

      let nextProject = { ...project, name: trimmedName };
      const startChanged = nextProjectStart !== new Date(project.projectStart).toISOString();
      const weekChanged = !workingWeeksEqual(workingDays, parseWorkingWeek(project.workingDaysJson));

      if (startChanged || weekChanged) {
        const recalculatedTasks = recalculateScheduleForWorkingWeek(project.tasks, project.dependencies, {
          projectStart: nextProjectStart,
          workingDaysJson: nextWorkingDaysJson,
        });
        nextProject = withRecalculatedSchedule({
          ...nextProject,
          projectStart: nextProjectStart,
          workingDaysJson: nextWorkingDaysJson,
          tasks: recalculatedTasks,
        });
      } else {
        nextProject = { ...nextProject, name: trimmedName };
      }

      onSave(nextProject, normalizedView);
      setMessage(t('settings.gantt.saved'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.saveFailed'));
    } finally {
      setSaving(false);
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
          <button type="button" className={tab === 'project' ? 'active' : ''} onClick={() => setTab('project')}>
            {t('settings.tab.project')}
          </button>
          <button type="button" className={tab === 'gantt' ? 'active' : ''} onClick={() => setTab('gantt')}>
            {t('settings.tab.gantt')}
          </button>
        </div>

        <div className="project-settings-form">
          {tab === 'project' && (
            <section>
              <h3>{t('settings.project.title')}</h3>
              <p className="project-settings-section-note">{t('settings.project.note')}</p>

              <label>
                {t('language.label')}
                <select value={locale} onChange={(e) => setLocale(e.target.value as AppLocale)} disabled={saving}>
                  <option value="ko">{t('language.ko')}</option>
                  <option value="en">{t('language.en')}</option>
                </select>
              </label>

              <label>
                {t('settings.project.name')}
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} disabled={saving} />
              </label>

              <label>
                {t('settings.project.start')}
                <DateInput value={projectStart} onChange={setProjectStart} disabled={saving} />
              </label>

              <div className="project-settings-working-days">
                <span className="project-settings-working-days-label">{t('settings.project.workingDays')}</span>
                <div className="project-settings-working-week">
                  <div className="project-settings-working-week-labels" aria-hidden="true">
                    {workingDayLabels.map((label) => (
                      <span key={label} className="project-settings-working-week-label">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="project-settings-working-week-buttons" role="group">
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
                        disabled={saving}
                        aria-pressed={workingDays[index]}
                      />
                    ))}
                  </div>
                </div>
              </div>
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
                    updateGanttField('defaultDependencyType', e.target.value as GanttViewSettings['defaultDependencyType'])
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

              <div className="desktop-settings-line-end-field">
                <LineEndStyleSelector
                  label={t('settings.gantt.startLineEnd')}
                  value={ganttForm.startLineEnd}
                  atStart
                  disabled={saving}
                  onChange={(style) => updateGanttField('startLineEnd', style)}
                />
              </div>

              <div className="desktop-settings-line-end-field">
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

        {message && <div className="project-settings-message">{message}</div>}
        {error && <div className="project-settings-error">{error}</div>}

        <footer>
          <button type="button" className="panel-footer-button" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="button" className="panel-footer-button primary" onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
