using MyWorkspace.Core.Entities;

namespace MyWorkspace.Core.Services;

public interface IPageAssetService
{
    void SaveAsset(User currentUser, int pageId, string fileName, byte[] content);

    byte[]? TryGetAssetBytes(User currentUser, int pageId, string fileName);

    bool AssetExists(User currentUser, int pageId, string fileName);

    IReadOnlyList<string> GetAssetFileNames(User currentUser, int pageId);

    void PruneUnreferencedAssets(User currentUser, int pageId, IReadOnlyCollection<string> referencedFileNames);
}
