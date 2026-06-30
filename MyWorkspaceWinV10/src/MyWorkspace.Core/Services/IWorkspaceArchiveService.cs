using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IWorkspaceArchiveService
{
    WorkspaceArchiveDocument ExportWorkspace(User currentUser, int workspaceId);

    WorkspaceImportResult ImportWorkspace(
        User currentUser,
        WorkspaceArchiveDocument document,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, byte[]>>? assetsByPageKey = null,
        Action<int, string, byte[]>? writeAsset = null);
}
