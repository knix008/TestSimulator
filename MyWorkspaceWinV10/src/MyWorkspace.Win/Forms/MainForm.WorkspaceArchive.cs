using MyWorkspace.Core.Models;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuNewProject;
    private ToolStripMenuItem? menuSaveWorkspace;
    private ToolStripMenuItem? menuLoadWorkspace;
    private ToolStripMenuItem? menuRecentProjects;
    private ToolStripSeparator? menuSepWorkspaceArchive;
    private ContextMenuStrip? _ctxRecentProject;
    private string? _recentProjectRemoveTarget;
    private string? _boundProjectFilePath;
    private int? _boundProjectRootWorkspaceId;

    private void EnsureWorkspaceArchiveMenuItems()
    {
        if (menuSaveWorkspace != null)
            return;

        menuSepWorkspaceArchive = new ToolStripSeparator { Name = "menuSepWorkspaceArchive" };
        menuNewProject = new ToolStripMenuItem
        {
            Name = "menuNewProject",
            Image = IconAssets.Load(16, "page_plus")
        };
        menuSaveWorkspace = new ToolStripMenuItem
        {
            Name = "menuSaveWorkspace",
            Image = IconAssets.Load(16, "export")
        };
        menuLoadWorkspace = new ToolStripMenuItem
        {
            Name = "menuLoadWorkspace",
            Image = IconAssets.Load(16, "folder_plus_workspace")
        };

        menuNewProject.Click += menuNewProject_Click;
        menuSaveWorkspace.Click += menuSaveWorkspace_Click;
        menuLoadWorkspace.Click += menuLoadWorkspace_Click;

        menuRecentProjects = new ToolStripMenuItem
        {
            Name = "menuRecentProjects",
            Image = IconAssets.Load(16, "history")
        };
        menuRecentProjects.DropDownOpening += (_, _) => RefreshRecentProjectsMenu();

        _ctxRecentProject = new ContextMenuStrip(components);
        var menuRecentProjectRemove = new ToolStripMenuItem { Name = "menuRecentProjectRemove" };
        menuRecentProjectRemove.Click += (_, _) =>
        {
            if (!string.IsNullOrWhiteSpace(_recentProjectRemoveTarget))
            {
                RecentProjectFiles.Remove(_recentProjectRemoveTarget);
                RefreshRecentProjectsMenu();
            }
        };
        _ctxRecentProject.Items.Add(menuRecentProjectRemove);
        AppTheme.StyleContextMenu(_ctxRecentProject);

        var insertIndex = menuFile.DropDownItems.IndexOf(menuRefreshTree) + 1;
        menuFile.DropDownItems.Insert(insertIndex, menuSepWorkspaceArchive);
        menuFile.DropDownItems.Insert(insertIndex + 1, menuNewProject);
        menuFile.DropDownItems.Insert(insertIndex + 2, menuSaveWorkspace);
        menuFile.DropDownItems.Insert(insertIndex + 3, menuLoadWorkspace);
        menuFile.DropDownItems.Insert(insertIndex + 4, menuRecentProjects);

        ApplyRecentProjectsMenuLocalization();
        RefreshRecentProjectsMenu();
    }

    private void ApplyRecentProjectsMenuLocalization()
    {
        if (menuRecentProjects == null)
            return;

        menuRecentProjects.Text = Localization.Get(K.MenuRecentProjects);
        if (_ctxRecentProject?.Items.Count > 0)
            _ctxRecentProject.Items[0].Text = Localization.Get(K.RecentProjectRemove);
    }

    private void RefreshRecentProjectsMenu()
    {
        if (menuRecentProjects == null)
            return;

        menuRecentProjects.DropDownItems.Clear();
        var paths = RecentProjectFiles.GetPaths();

        if (paths.Count == 0)
        {
            menuRecentProjects.DropDownItems.Add(new ToolStripMenuItem(Localization.Get(K.RecentProjectsEmpty))
            {
                Enabled = false
            });
            return;
        }

        foreach (var path in paths)
        {
            var item = CreateRecentProjectMenuItem(path, paths);
            menuRecentProjects.DropDownItems.Add(item);
        }

        menuRecentProjects.DropDownItems.Add(new ToolStripSeparator());
        var clearAllItem = new ToolStripMenuItem(Localization.Get(K.RecentProjectsClearAll));
        clearAllItem.Click += (_, _) =>
        {
            RecentProjectFiles.Clear();
            RefreshRecentProjectsMenu();
        };
        menuRecentProjects.DropDownItems.Add(clearAllItem);
    }

    private ToolStripMenuItem CreateRecentProjectMenuItem(string path, IReadOnlyList<string> allPaths)
    {
        var item = new ToolStripMenuItem(RecentProjectFiles.GetDisplayName(path, allPaths))
        {
            Tag = path,
            ToolTipText = path,
            ForeColor = File.Exists(path) ? AppTheme.TextPrimary : AppTheme.TextMuted
        };

        item.Click += (_, _) => OpenRecentProject(path);
        item.MouseDown += (_, e) =>
        {
            if (e.Button != MouseButtons.Right)
                return;

            _recentProjectRemoveTarget = path;
            if (_ctxRecentProject != null)
            {
                ApplyRecentProjectsMenuLocalization();
                _ctxRecentProject.Show(Cursor.Position);
            }
        };

        return item;
    }

    private void OpenRecentProject(string path)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (!File.Exists(path))
        {
            if (MessageBox.Show(
                    string.Format(Localization.Get(K.RecentProjectMissing), path),
                    L.AppName,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) == DialogResult.Yes)
            {
                RecentProjectFiles.Remove(path);
                RefreshRecentProjectsMenu();
            }

            return;
        }

        ImportWorkspaceFromFile(path);
    }

    private async void menuNewProject_Click(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        using var nameDialog = new InputDialogForm(
            Localization.Get(K.MenuNewProject),
            Localization.Get(K.NewProjectNamePrompt),
            Localization.Get(K.DefaultNewProjectName));
        if (nameDialog.ShowDialog(this) != DialogResult.OK)
            return;

        var projectName = nameDialog.InputText;
        var safeFileName = string.Join("_", projectName.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries)).Trim();
        if (string.IsNullOrWhiteSpace(safeFileName))
            safeFileName = Localization.Get(K.DefaultNewProjectName);

        using var saveDialog = new SaveFileDialog
        {
            Filter = WorkspaceArchiveFileIO.BuildSaveFileFilter(),
            DefaultExt = "wsp",
            FileName = $"{safeFileName}.wsp",
            Title = Localization.Get(K.MenuNewProject)
        };
        DialogPathHelper.ApplyProjectDirectory(saveDialog);

        if (saveDialog.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            await SaveCurrentPageAsync(refreshTree: false, force: true, autoSaveToSqliteOnly: false);

            var workspace = AppConfig.Services.Workspaces.CreateWorkspace(
                SessionContext.CurrentUser,
                projectName,
                parentId: null);

            SaveProjectToFile(saveDialog.FileName, workspace.Id);
            BindActiveProject(saveDialog.FileName, workspace.Id);
            DialogPathHelper.RememberProjectPath(saveDialog.FileName);
            RecentProjectFiles.Record(saveDialog.FileName);
            RefreshRecentProjectsMenu();

            LoadWorkspaceTree(selectPageId: null, selectWorkspaceId: workspace.Id);
            await ClearEditorAsync();

            MessageBox.Show(
                string.Format(Localization.Get(K.NewProjectSucceeded), saveDialog.FileName),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.NewProjectFailed), ex);
        }
    }

    private void menuSaveWorkspace_Click(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        var workspaceId = GetSelectedWorkspaceId();
        if (!workspaceId.HasValue)
        {
            MessageBox.Show(
                Localization.Get(K.SelectWorkspaceToSave),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (!AppConfig.Services.Workspaces.CanAccessWorkspace(SessionContext.CurrentUser, workspaceId.Value))
        {
            MessageBox.Show(
                Localization.Get(K.WorkspaceAccessRequired),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var workspaceName = treeWorkspace.SelectedNode?.Text?.Trim() ?? "Workspace";
        using var dialog = new SaveFileDialog
        {
            Filter = WorkspaceArchiveFileIO.BuildSaveFileFilter(),
            DefaultExt = "wsp",
            FileName = $"{workspaceName}.wsp",
            Title = Localization.Get(K.MenuSaveWorkspace)
        };
        DialogPathHelper.ApplyProjectDirectory(dialog);

        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberProjectPath(dialog.FileName);

        try
        {
            SaveCurrentPage(refreshTree: false);
            SaveProjectToFile(dialog.FileName, workspaceId.Value);
            BindActiveProject(dialog.FileName, workspaceId.Value);
            RecentProjectFiles.Record(dialog.FileName);
            RefreshRecentProjectsMenu();
            MessageBox.Show(
                Localization.Get(K.WorkspaceSaveSucceeded),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.WorkspaceSaveFailed), ex);
        }
    }

    private void menuLoadWorkspace_Click(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        using var dialog = new OpenFileDialog
        {
            Filter = WorkspaceArchiveFileIO.BuildSaveFileFilter(),
            Title = Localization.Get(K.MenuLoadWorkspace)
        };
        DialogPathHelper.ApplyProjectDirectory(dialog);

        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberProjectPath(dialog.FileName);
        ImportWorkspaceFromFile(dialog.FileName);
    }

    private void TryImportPendingWspIfAny()
    {
        if (string.IsNullOrWhiteSpace(_pendingWspImportPath))
            return;

        var path = _pendingWspImportPath;
        _pendingWspImportPath = null;
        ImportWorkspaceFromFile(path);
    }

    private void ImportWorkspaceFromFile(string filePath)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        DialogPathHelper.RememberProjectPath(filePath);

        try
        {
            SaveCurrentPage(refreshTree: false);
            var (document, assets) = WorkspaceArchiveFileIO.Load(filePath);
            var result = AppConfig.Services.WorkspaceArchives.ImportWorkspace(
                SessionContext.CurrentUser,
                document,
                assets,
                PageAssetStore.WriteAssetBytes);

            LoadWorkspaceTree(selectPageId: null, selectWorkspaceId: result.RootWorkspaceId);

            BindActiveProject(filePath, result.RootWorkspaceId);
            RecentProjectFiles.Record(filePath);
            RefreshRecentProjectsMenu();

            MessageBox.Show(
                string.Format(
                    Localization.Get(K.WorkspaceLoadSucceeded),
                    result.WorkspaceCount,
                    result.PageCount),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.WorkspaceLoadFailed), ex);
        }
    }

    internal void ClearActiveProjectBinding()
    {
        _boundProjectFilePath = null;
        _boundProjectRootWorkspaceId = null;
    }

    internal void TrySaveBoundProjectFile()
    {
        if (!CanSaveBoundProjectFile(out var exportRootWorkspaceId, out var filePath))
            return;

        try
        {
            SaveProjectToFile(filePath, exportRootWorkspaceId);
            DialogPathHelper.RememberProjectPath(filePath);
            RecentProjectFiles.Record(filePath);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.WorkspaceSaveFailed), ex);
        }
    }

    private void BindActiveProject(string filePath, int exportRootWorkspaceId)
    {
        _boundProjectFilePath = filePath;
        _boundProjectRootWorkspaceId = exportRootWorkspaceId;
    }

    private static void SaveProjectToFile(string filePath, int exportRootWorkspaceId)
    {
        var document = AppConfig.Services.WorkspaceArchives.ExportWorkspace(
            SessionContext.CurrentUser,
            exportRootWorkspaceId);
        WorkspaceArchiveFileIO.Save(filePath, document, exportRootWorkspaceId);
    }

    private bool CanSaveBoundProjectFile(out int exportRootWorkspaceId, out string filePath)
    {
        exportRootWorkspaceId = 0;
        filePath = string.Empty;

        if (!SessionContext.IsLoggedIn)
            return false;

        if (string.IsNullOrWhiteSpace(_boundProjectFilePath) || !_boundProjectRootWorkspaceId.HasValue)
            return false;

        if (!AppConfig.Services.Workspaces.CanAccessWorkspace(
                SessionContext.CurrentUser,
                _boundProjectRootWorkspaceId.Value))
            return false;

        exportRootWorkspaceId = _boundProjectRootWorkspaceId.Value;
        filePath = _boundProjectFilePath;
        return true;
    }
}
