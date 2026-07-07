import { forwardRef, useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  FolderKanban,
  Info,
  LogOut,
  Settings,
  Sparkles,
  User,
  Undo2,
  Users,
  Redo2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useUndoHistory } from '../context/UndoHistoryContext.jsx';
import { IconButton } from './IconButton.jsx';
import { IconText } from './IconText.jsx';
import { getTooltipProps, mergeTooltipClass } from './tooltip.js';
import { syncAppMinWidthFromNav } from '../lib/syncAppMinWidth.js';
import { getDisplayProjectName, getDisplayRoleLabel, getDisplayUserName } from '../lib/displayLabels.js';

function NavItem({ to, icon, labelKey, tooltipKey, matchPrefix }) {
  const location = useLocation();
  const { t } = useLanguage();
  const active = matchPrefix
    ? location.pathname.startsWith(matchPrefix)
    : to === '/'
      ? location.pathname === '/' || location.pathname.startsWith('/requirements')
      : location.pathname.startsWith(to);
  const label = t(labelKey);
  const tooltipProps = getTooltipProps(tooltipKey ? t(tooltipKey) : undefined, label);

  return (
    <Link
      to={to}
      className={mergeTooltipClass(`nav-item${active ? ' nav-item--active' : ''}`, tooltipProps)}
      aria-label={tooltipProps['aria-label'] || label}
      data-tooltip={tooltipProps['data-tooltip']}
      data-i18n-label={labelKey}
    >
      <IconText icon={icon}>{label}</IconText>
    </Link>
  );
}

const Nav = forwardRef(function Nav({ onShowInfo }, ref) {
  const { user, logout, hasRole } = useAuth();
  const { projects, activeProject, selectProject, canEditProject } = useProject();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { undo, redo, canUndo, canRedo } = useUndoHistory();
  const navRef = useRef(null);

  const setNavRef = (node) => {
    navRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    let cancelled = false;
    let syncFrame = 0;

    const syncLayout = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (document.fonts?.ready) await document.fonts.ready;
      if (cancelled) return;

      await syncAppMinWidthFromNav(nav, { updateMinWidth: true });
    };

    const scheduleSync = () => {
      cancelAnimationFrame(syncFrame);
      syncFrame = requestAnimationFrame(() => {
        void syncLayout();
      });
    };

    scheduleSync();

    return () => {
      cancelled = true;
      cancelAnimationFrame(syncFrame);
    };
  }, [user?.id, canEditProject, language, user?.role, projects.length, activeProject?.id]);

  const handleUndo = async () => {
    try {
      await undo();
    } catch (err) {
      window.alert(err.message || t('menu.undoFailed'));
    }
  };

  const handleRedo = async () => {
    try {
      await redo();
    } catch (err) {
      window.alert(err.message || t('menu.redoFailed'));
    }
  };

  const undoTooltip = getTooltipProps(t('menu.tipUndo'), t('menu.undo'));
  const redoTooltip = getTooltipProps(t('menu.tipRedo'), t('menu.redo'));

  const roleLabel = getDisplayRoleLabel(user?.role, t);
  const displayUserName = getDisplayUserName(user, t);
  const appInfoLabel = t('menu.appInfo');
  const appInfoTooltipProps = getTooltipProps(t('menu.tipAppInfo'), appInfoLabel);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav
      className="nav"
      ref={setNavRef}
      data-measure-user={user ? JSON.stringify({ name: user.name, username: user.username, role: user.role }) : ''}
      data-measure-projects={JSON.stringify(projects.map((p) => ({ id: p.id, name: p.name, code: p.code })))}
    >
      <div className="nav-primary">
        <div className="nav-scroll">
        {projects.length > 0 ? (
          <label className="nav-project nav-project--first">
            <FolderKanban size={16} strokeWidth={2} aria-hidden="true" />
            <select
              value={activeProject?.id || ''}
              onChange={(e) => {
                const project = projects.find((p) => p.id === Number(e.target.value));
                selectProject(project);
              }}
              aria-label={t('nav.selectProject')}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{getDisplayProjectName(p, t)}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="nav-project nav-project--empty nav-project--first muted" data-i18n-no-projects>{t('nav.noProjects')}</span>
        )}
        <NavItem to="/projects" icon={FolderKanban} labelKey="nav.projects" tooltipKey="nav.tipProjects" />
        <NavItem to="/" icon={ClipboardList} labelKey="nav.requirements" tooltipKey="nav.tipRequirements" />
        {hasRole('ADMIN') && (
          <NavItem to="/users" icon={Users} labelKey="nav.users" tooltipKey="nav.tipUsers" />
        )}
        {hasRole('EDITOR') && (
          <NavItem to="/ollama" icon={Sparkles} labelKey="nav.ollama" tooltipKey="nav.tipOllama" />
        )}
        <NavItem to="/settings" icon={Settings} labelKey="nav.settings" tooltipKey="nav.tipSettings" />
        </div>
        {canEditProject && (
          <div className="nav-undo-redo">
            <button
              type="button"
              className={mergeTooltipClass('nav-item', undoTooltip)}
              disabled={!canUndo}
              onClick={handleUndo}
              aria-label={undoTooltip['aria-label'] || t('menu.undo')}
              data-tooltip={undoTooltip['data-tooltip']}
              data-i18n-label="menu.undo"
            >
              <IconText icon={Undo2}>{t('menu.undo')}</IconText>
            </button>
            <button
              type="button"
              className={mergeTooltipClass('nav-item', redoTooltip)}
              disabled={!canRedo}
              onClick={handleRedo}
              aria-label={redoTooltip['aria-label'] || t('menu.redo')}
              data-tooltip={redoTooltip['data-tooltip']}
              data-i18n-label="menu.redo"
            >
              <IconText icon={Redo2}>{t('menu.redo')}</IconText>
            </button>
          </div>
        )}
        <button
          type="button"
          className={mergeTooltipClass('nav-item nav-program-info', appInfoTooltipProps)}
          onClick={onShowInfo}
          aria-label={appInfoTooltipProps['aria-label'] || appInfoLabel}
          data-tooltip={appInfoTooltipProps['data-tooltip']}
          data-i18n-label="menu.appInfo"
        >
          <IconText icon={Info}>{appInfoLabel}</IconText>
        </button>
      </div>
      <div className="nav-trailing">
        <span className="user" data-i18n-user-display>
          <IconText icon={User}>{displayUserName} ({roleLabel})</IconText>
        </span>
        <IconButton
          icon={LogOut}
          className="btn-secondary nav-logout"
          type="button"
          onClick={handleLogout}
          tooltip={t('nav.tipLogout')}
          data-i18n-label="nav.logout"
        >
          {t('nav.logout')}
        </IconButton>
      </div>
    </nav>
  );
});

export default Nav;
