using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class WorkspaceArchiveService : IWorkspaceArchiveService
{
    private const string ArchiveAssetPrefix = "archive-asset:";

    private readonly AppDbContext _db;
    private readonly IWorkspaceService _workspaces;
    private readonly IPageService _pages;

    public WorkspaceArchiveService(AppDbContext db, IWorkspaceService workspaces, IPageService pages)
    {
        _db = db;
        _workspaces = workspaces;
        _pages = pages;
    }

    public WorkspaceArchiveDocument ExportWorkspace(User currentUser, int workspaceId)
    {
        if (!_workspaces.CanAccessWorkspace(currentUser, workspaceId))
            throw new InvalidOperationException("Workspace에 접근할 수 없습니다.");

        var workspace = _db.Workspaces.AsNoTracking().FirstOrDefault(w => w.Id == workspaceId)
            ?? throw new InvalidOperationException("Workspace를 찾을 수 없습니다.");

        return new WorkspaceArchiveDocument
        {
            FormatVersion = 1,
            ExportedAt = DateTime.UtcNow,
            ExportedBy = currentUser.Username,
            Root = BuildArchiveNode(workspaceId)
        };
    }

    public WorkspaceImportResult ImportWorkspace(
        User currentUser,
        WorkspaceArchiveDocument document,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, byte[]>>? assetsByPageKey = null,
        Action<int, string, byte[]>? writeAsset = null)
    {
        if (document.Root == null || string.IsNullOrWhiteSpace(document.Root.Name))
            throw new InvalidOperationException("불러올 Workspace 데이터가 올바르지 않습니다.");

        assetsByPageKey ??= new Dictionary<string, IReadOnlyDictionary<string, byte[]>>();

        var workspaceCount = 0;
        var pageCount = 0;
        var rootWorkspace = ImportNode(
            currentUser,
            document.Root,
            parentId: null,
            assetsByPageKey,
            writeAsset,
            ref workspaceCount,
            ref pageCount);

        return new WorkspaceImportResult
        {
            RootWorkspaceId = rootWorkspace.Id,
            WorkspaceCount = workspaceCount,
            PageCount = pageCount
        };
    }

    private WorkspaceArchiveNode BuildArchiveNode(int workspaceId)
    {
        var workspace = _db.Workspaces.AsNoTracking().First(w => w.Id == workspaceId);
        var node = new WorkspaceArchiveNode { Name = workspace.Name };

        foreach (var page in _db.Pages.AsNoTracking().Where(p => p.WorkspaceId == workspaceId).OrderBy(p => p.Title))
        {
            node.Pages.Add(new WorkspaceArchivePage
            {
                Key = Guid.NewGuid().ToString("N"),
                Title = page.Title,
                Content = page.Content
            });
        }

        foreach (var child in _db.Workspaces.AsNoTracking().Where(w => w.ParentId == workspaceId).OrderBy(w => w.Name))
            node.Children.Add(BuildArchiveNode(child.Id));

        return node;
    }

    private Workspace ImportNode(
        User currentUser,
        WorkspaceArchiveNode node,
        int? parentId,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, byte[]>> assetsByPageKey,
        Action<int, string, byte[]>? writeAsset,
        ref int workspaceCount,
        ref int pageCount)
    {
        var workspace = _workspaces.CreateWorkspace(currentUser, node.Name, parentId);
        workspaceCount++;

        foreach (var archivePage in node.Pages)
        {
            var title = string.IsNullOrWhiteSpace(archivePage.Title)
                ? "제목없음"
                : archivePage.Title.Trim();

            var content = string.IsNullOrWhiteSpace(archivePage.Content) ? "." : archivePage.Content;
            var page = _pages.CreatePage(currentUser, workspace.Id, title, content);
            pageCount++;

            if (string.IsNullOrWhiteSpace(archivePage.Key))
                continue;

            if (!assetsByPageKey.TryGetValue(archivePage.Key, out var assets) || assets.Count == 0)
                continue;

            foreach (var (fileName, bytes) in assets)
                writeAsset?.Invoke(page.Id, fileName, bytes);

            var rewritten = RewriteArchiveAssets(content, archivePage.Key, page.Id, assets);
            if (!string.Equals(rewritten, content, StringComparison.Ordinal))
                _pages.UpdatePage(currentUser, page.Id, title, rewritten);
        }

        foreach (var child in node.Children)
            ImportNode(currentUser, child, workspace.Id, assetsByPageKey, writeAsset, ref workspaceCount, ref pageCount);

        return workspace;
    }

    internal static string RewriteArchiveAssets(
        string content,
        string pageKey,
        int newPageId,
        IReadOnlyDictionary<string, byte[]> assets)
    {
        if (string.IsNullOrEmpty(content) || assets.Count == 0)
            return content;

        var result = content;
        foreach (var (fileName, _) in assets)
        {
            var archiveUri = $"{ArchiveAssetPrefix}{pageKey}/{fileName}";
            var pageUri = $"page-asset:{newPageId}/{fileName}";
            result = result.Replace(archiveUri, pageUri, StringComparison.OrdinalIgnoreCase);
        }

        return result;
    }
}
