using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class PageAssetService : IPageAssetService
{
    private readonly AppDbContext _db;
    private readonly IWorkspaceService _workspaceService;

    public PageAssetService(AppDbContext db, IWorkspaceService workspaceService)
    {
        _db = db;
        _workspaceService = workspaceService;
    }

    public void SaveAsset(User currentUser, int pageId, string fileName, byte[] content)
    {
        ValidateFileName(fileName);
        EnsureCanAccessPage(currentUser, pageId);

        var now = DateTime.UtcNow;
        var asset = _db.PageAssets.FirstOrDefault(a => a.PageId == pageId && a.FileName == fileName);
        if (asset == null)
        {
            _db.PageAssets.Add(new PageAsset
            {
                PageId = pageId,
                FileName = fileName,
                Content = content,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            asset.Content = content;
            asset.UpdatedAt = now;
        }

        _db.SaveChanges();
    }

    public byte[]? TryGetAssetBytes(User currentUser, int pageId, string fileName)
    {
        ValidateFileName(fileName);
        if (!CanAccessPage(currentUser, pageId))
            return null;

        return _db.PageAssets.AsNoTracking()
            .Where(a => a.PageId == pageId && a.FileName == fileName)
            .Select(a => a.Content)
            .FirstOrDefault();
    }

    public bool AssetExists(User currentUser, int pageId, string fileName)
    {
        ValidateFileName(fileName);
        if (!CanAccessPage(currentUser, pageId))
            return false;

        return _db.PageAssets.AsNoTracking()
            .Any(a => a.PageId == pageId && a.FileName == fileName);
    }

    public void PruneUnreferencedAssets(User currentUser, int pageId, IReadOnlyCollection<string> referencedFileNames)
    {
        EnsureCanAccessPage(currentUser, pageId);

        var keep = new HashSet<string>(referencedFileNames, StringComparer.OrdinalIgnoreCase);
        var assets = _db.PageAssets.Where(a => a.PageId == pageId).ToList();
        var removed = assets.Where(a => !keep.Contains(a.FileName)).ToList();
        if (removed.Count == 0)
            return;

        _db.PageAssets.RemoveRange(removed);
        _db.SaveChanges();
    }

    private bool CanAccessPage(User currentUser, int pageId)
    {
        var workspaceId = _db.Pages.AsNoTracking()
            .Where(p => p.Id == pageId)
            .Select(p => (int?)p.WorkspaceId)
            .FirstOrDefault();

        return workspaceId.HasValue &&
               _workspaceService.CanAccessWorkspace(currentUser, workspaceId.Value);
    }

    private void EnsureCanAccessPage(User currentUser, int pageId)
    {
        if (!CanAccessPage(currentUser, pageId))
            throw new InvalidOperationException("Page asset에 접근할 수 없습니다.");
    }

    private static void ValidateFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Contains("..", StringComparison.Ordinal))
            throw new InvalidOperationException("Invalid asset file name.");
    }
}
