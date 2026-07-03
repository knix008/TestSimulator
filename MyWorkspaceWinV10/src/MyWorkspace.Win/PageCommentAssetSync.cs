namespace MyWorkspace.Win;

using MyWorkspace.Data;

internal static class PageCommentAssetSync
{
    public static void SyncForPage(int pageId, AppServices? services = null)
    {
        services ??= AppConfig.Services;
        if (!SessionContext.IsLoggedIn || services == null)
            return;

        var page = services.Pages.GetById(SessionContext.CurrentUser, pageId);
        if (page == null)
            return;

        var commentBodies = services.PageComments.GetComments(SessionContext.CurrentUser, pageId)
            .Select(static c => c.Content);

        var referenced = PageAssetStore.CollectReferencedFileNames(pageId, page.Content, commentBodies);
        PageAssetStore.SyncAssetsWithReferencedFiles(pageId, referenced, services);
    }
}
