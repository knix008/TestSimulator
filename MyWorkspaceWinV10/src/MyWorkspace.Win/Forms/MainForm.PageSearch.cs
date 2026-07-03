using MyWorkspace.Core.Models;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private void ConfigureTitleBarPageSearch()
    {
        titleBar.PageSearchSelected -= OnTitleBarPageSearchSelected;
        titleBar.PageSearchSelected += OnTitleBarPageSearchSelected;

        if (!SessionContext.IsLoggedIn || !AppConfig.IsDatabaseConnected)
        {
            titleBar.SetPageSearchProvider(null);
            titleBar.SetPageSearchEnabled(false);
            return;
        }

        titleBar.SetPageSearchProvider(SearchPagesForTitleBar);
        titleBar.SetPageSearchEnabled(AppConfig.UiSettings.ShowTitleBarPageSearch);
        titleBar.ApplyTheme();
        UpdateTitleBarEditorRegion();
    }

    private async void OnTitleBarPageSearchSelected(object? sender, PageSearchSelection selection)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        await NavigateToPageFromSearchAsync(selection);
        titleBar.ClearPageSearch();
    }

    private async Task NavigateToPageFromSearchAsync(PageSearchSelection selection)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, selection.PageId) == null)
        {
            ThemedMessageBox.Show(
                Localization.Get(K.PageLoadFailed),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        SelectPageInTree(selection.PageId);
        await LoadPageAsync(selection.PageId);
        await ScrollEditorToSearchMatchAsync(selection);
    }

    private async Task ScrollEditorToSearchMatchAsync(PageSearchSelection selection)
    {
        if (_editor == null || string.IsNullOrWhiteSpace(selection.Query))
            return;

        await _editor.ScrollToSearchTextAsync(selection.Query, selection.MatchInContent);
    }

    private IReadOnlyList<PageSearchResult> SearchPagesForTitleBar(string query) =>
        AppConfig.Services.Pages.SearchPages(SessionContext.CurrentUser, query);
}
