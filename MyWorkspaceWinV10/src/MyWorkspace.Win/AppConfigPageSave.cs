using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;
using MyWorkspace.Data;

namespace MyWorkspace.Win;

internal static class AppConfigPageSave
{
    public static PageSaveResult TrySavePage(
        User currentUser,
        int pageId,
        string title,
        string content,
        OfflinePageContext? context,
        bool autoSaveToSqliteOnly = false)
    {
        if (autoSaveToSqliteOnly)
            return TryAutoSaveToSqlite(currentUser, pageId, title, content, context);

        if (AppConfig.IsOfflineFallbackActive)
        {
            if (context == null)
                throw new InvalidOperationException(Localization.Get(K.OfflineSaveContextMissing));

            OfflinePageSaveService.SavePage(AppConfig.Services, currentUser, context, title, content);
            PageCommentAssetSync.SyncForPage(pageId, AppConfig.Services);
            return PageSaveResult.OfflineFallback;
        }

        try
        {
            AppConfig.Services.Pages.UpdatePage(currentUser, pageId, title, content);
            PageCommentAssetSync.SyncForPage(pageId);
            return PageSaveResult.Primary;
        }
        catch (Exception ex) when (AppConfig.ShouldTryOfflineSave(ex))
        {
            if (context == null)
                throw;

            var offlineServices = OfflineFallbackDatabase.GetServices();
            OfflinePageSaveService.SavePage(offlineServices, currentUser, context, title, content);
            PageCommentAssetSync.SyncForPage(pageId, offlineServices);
            AppConfig.MarkOfflineSaveUsed();
            return PageSaveResult.OfflineFallback;
        }
    }

    private static PageSaveResult TryAutoSaveToSqlite(
        User currentUser,
        int pageId,
        string title,
        string content,
        OfflinePageContext? context)
    {
        if (context == null)
            throw new InvalidOperationException(Localization.Get(K.OfflineSaveContextMissing));

        var sqliteServices = AppConfig.GetAutoSaveSqliteServices();
        OfflinePageSaveService.SavePage(sqliteServices, currentUser, context, title, content);
        PageCommentAssetSync.SyncForPage(pageId, sqliteServices);

        return ReferenceEquals(sqliteServices, AppConfig.Services)
            ? PageSaveResult.Primary
            : PageSaveResult.LocalSqliteAutoSave;
    }
}
