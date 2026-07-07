import { forwardRef, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  FolderKanban,
  Info,
  ListChecks,
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
import { NavTooltipHost } from './NavTooltipHost.jsx';
import { useNavLayout } from '../hooks/useNavLayout.js';
import { ROUTES } from '../lib/routes.js';
import { getDisplayProjectName, getDisplayRoleLabel, getDisplayUserName } from '../lib/displayLabels.js';

function NavItem({ to, icon, labelKey, tooltipKey, matchPrefix }) {
  const location = useLocation();
  const { t } = useLanguage();
  const active = matchPrefix
    ? location.pathname.startsWith(matchPrefix)
    : to === ROUTES.requirements
      ? location.pathname === ROUTES.requirements || location.pathname.startsWith('/requirements')
      : location.pathname.startsWith(to);
  const label = t(labelKey);
  const tooltip = tooltipKey ? t(tooltipKey) : label;

  return (
    <NavTooltipHost tooltip={tooltip} label={label}>
      <Link
        to={to}
        className={`nav-item${active ? ' nav-item--active' : ''}`}
        aria-label={label}
        data-i18n-label={labelKey}
      >
        <IconText icon={icon}>{label}</IconText>
      </Link>
    </NavTooltipHost>
  );
}

function NavUndoRedo({ canEditProject, canUndo, canRedo, onUndo, onRedo, t }) {
  const undoLabel = t('menu.undo');
  const redoLabel = t('menu.redo');

  return (
    <div
      className={`nav-undo-redo${canEditProject ? '' : ' nav-undo-redo--hidden'}`}
      aria-hidden={!canEditProject}
    >
      <NavTooltipHost tooltip={t('menu.tipUndo')} label={undoLabel}>
        <button
          type="button"
          className="nav-item"
          disabled={!canEditProject || !canUndo}
          tabIndex={canEditProject ? 0 : -1}
          onClick={onUndo}
          aria-label={undoLabel}
          data-i18n-label="menu.undo"
        >
          <IconText icon={Undo2}>{undoLabel}</IconText>
        </button>
      </NavTooltipHost>
      <NavTooltipHost tooltip={t('menu.tipRedo')} label={redoLabel}>
        <button
          type="button"
          className="nav-item"
          disabled={!canEditProject || !canRedo}
          tabIndex={canEditProject ? 0 : -1}
          onClick={onRedo}
          aria-label={redoLabel}
          data-i18n-label="menu.redo"
        >
          <IconText icon={Redo2}>{redoLabel}</IconText>
        </button>
      </NavTooltipHost>
    </div>
  );
}

const Nav = forwardRef(function Nav({ onShowInfo }, ref) {
  const { user, logout, hasRole } = useAuth();
  const { projects, activeProject, selectProject, canEditProject } = useProject();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { undo, redo, canUndo, canRedo } = useUndoHistory();
  const navRef = useRef(null);
  const trailingRef = useRef(null);

  const setNavRef = (node) => {
    navRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  useNavLayout(navRef, trailingRef, {
    layoutDeps: [user?.id, canEditProject, language, user?.role, projects.length],
    trailingDeps: [activeProject?.id],
  });

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

  const roleLabel = getDisplayRoleLabel(user?.role, t);
  const displayUserName = getDisplayUserName(user, t);
  const appInfoLabel = t('menu.appInfo');
  const logoutLabel = t('nav.logout');

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.login);
  };

  return (
    <nav
      className="nav"
      ref={setNavRef}
      data-measure-user={user ? JSON.stringify({ name: user.name, username: user.username, role: user.role }) : ''}
      data-measure-projects={JSON.stringify(projects.map((p) => ({ id: p.id, name: p.name, code: p.code })))}
    >
      <div className="nav-scroll">
        {projects.length > 0 ? (
          <NavTooltipHost tooltip={t('nav.tipSelectProject')} label={t('nav.selectProject')}>
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
          </NavTooltipHost>
        ) : (
          <NavTooltipHost tooltip={t('nav.tipNoProjects')} label={t('nav.noProjects')}>
            <span className="nav-project nav-project--empty nav-project--first muted" data-i18n-no-projects>
              {t('nav.noProjects')}
            </span>
          </NavTooltipHost>
        )}
        <NavItem to="/projects" icon={FolderKanban} labelKey="nav.projects" tooltipKey="nav.tipProjects" />
        <NavItem to={ROUTES.requirements} icon={ClipboardList} labelKey="nav.requirements" tooltipKey="nav.tipRequirements" />
        <NavItem to="/test-cases" icon={ListChecks} labelKey="nav.testCases" tooltipKey="nav.tipTestCases" matchPrefix="/test-cases" />
        {hasRole('ADMIN') && (
          <NavItem to="/users" icon={Users} labelKey="nav.users" tooltipKey="nav.tipUsers" />
        )}
        {hasRole('EDITOR') && (
          <NavItem to="/ollama" icon={Sparkles} labelKey="nav.ollama" tooltipKey="nav.tipOllama" />
        )}
        <NavUndoRedo
          canEditProject={canEditProject}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          t={t}
        />
        <NavItem to="/settings" icon={Settings} labelKey="nav.settings" tooltipKey="nav.tipSettings" />
      </div>

      <div className="nav-trailing" ref={trailingRef}>
        <NavTooltipHost tooltip={t('menu.tipAppInfo')} label={appInfoLabel}>
          <button
            type="button"
            className="nav-item nav-program-info"
            onClick={onShowInfo}
            aria-label={appInfoLabel}
            data-i18n-label="menu.appInfo"
          >
            <IconText icon={Info}>{appInfoLabel}</IconText>
          </button>
        </NavTooltipHost>
        <span className="user" data-i18n-user-display>
          <IconText icon={User}>{displayUserName} ({roleLabel})</IconText>
        </span>
        <NavTooltipHost tooltip={t('nav.tipLogout')} label={logoutLabel}>
          <IconButton
            icon={LogOut}
            className="btn-secondary nav-logout"
            type="button"
            onClick={handleLogout}
            data-i18n-label="nav.logout"
          >
            {logoutLabel}
          </IconButton>
        </NavTooltipHost>
      </div>
    </nav>
  );
});

export default Nav;
