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
        OfflinePageContext? context)
    {
        if (AppConfig.IsOfflineFallbackActive)
        {
            if (context == null)
                throw new InvalidOperationException(Localization.Get(K.OfflineSaveContextMissing));

            OfflinePageSaveService.SavePage(AppConfig.Services, currentUser, context, title, content);
            PageAssetStore.SyncAssetsWithContent(pageId, content, AppConfig.Services);
            return PageSaveResult.OfflineFallback;
        }

        try
        {
            AppConfig.Services.Pages.UpdatePage(currentUser, pageId, title, content);
            PageAssetStore.SyncAssetsWithContent(pageId, content);
            return PageSaveResult.Primary;
        }
        catch (Exception ex) when (AppConfig.ShouldTryOfflineSave(ex))
        {
            if (context == null)
                throw;

            var offlineServices = OfflineFallbackDatabase.GetServices();
            OfflinePageSaveService.SavePage(offlineServices, currentUser, context, title, content);
            PageAssetStore.SyncAssetsWithContent(pageId, content, offlineServices);
            AppConfig.MarkOfflineSaveUsed();
            return PageSaveResult.OfflineFallback;
        }
    }
}
