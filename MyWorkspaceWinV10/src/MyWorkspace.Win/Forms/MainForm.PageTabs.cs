namespace MyWorkspace.Win.Forms;



public partial class MainForm

{

    private PageTabBar? _pageTabBar;

    private readonly List<int> _openPageTabs = [];

    private readonly Dictionary<int, string> _pageTabTitles = new();

    private bool _suppressPageTabEvents;



    private void InitializePageTabs()

    {

        _pageTabBar = new PageTabBar

        {

            Name = "pageTabBar",

            Visible = false

        };

        _pageTabBar.TabSelected += async (_, pageId) => await OnPageTabSelectedAsync(pageId);

        _pageTabBar.TabCloseRequested += async (_, pageId) => await ClosePageTabAsync(pageId);



        pnlEditorHost.Controls.Add(_pageTabBar);

        _pageTabBar.SendToBack();

        _pageTabBar.ApplyTheme();

        webViewEditor.BringToFront();

        pnlEditorEmptySurface.BringToFront();

    }



    private Task OpenPageTabAsync(int pageId) => LoadPageAsync(pageId);



    internal void EnsurePageTabOpen(int pageId)

    {

        if (!_openPageTabs.Contains(pageId))

            _openPageTabs.Add(pageId);

        PersistOpenPageTabs();

    }



    internal void RememberTabTitle(int pageId, string title)

    {

        if (string.IsNullOrWhiteSpace(title))

            return;



        _pageTabTitles[pageId] = title.Trim();

    }



    internal void RemovePageTab(int pageId)

    {

        _openPageTabs.Remove(pageId);

        _pageTabTitles.Remove(pageId);

        PersistOpenPageTabs();

    }



    private void PersistOpenPageTabs()

    {

        if (!SessionContext.IsLoggedIn)

            return;



        AppConfig.RecordOpenPageTabs(SessionContext.CurrentUser.Id, _openPageTabs);

    }



    internal void RestoreOpenPageTabs(IReadOnlyList<int> pageIds)

    {

        _openPageTabs.Clear();

        foreach (var pageId in pageIds)

        {

            if (pageId > 0 && !_openPageTabs.Contains(pageId))

                _openPageTabs.Add(pageId);

        }

    }



    private async Task OnPageTabSelectedAsync(int pageId)

    {

        if (_suppressPageTabEvents || _currentPageId == pageId)

            return;



        _pageTabBar?.SetSelectedTab(pageId);

        await LoadPageAsync(pageId);

    }



    private async Task ClosePageTabAsync(int pageId)

    {

        if (!_openPageTabs.Contains(pageId))

            return;



        if (!await PersistPageTabToDatabaseAsync(pageId))
            return;

        RemovePageTab(pageId);



        if (_currentPageId != pageId)

        {

            RefreshPageTabBar();

            return;

        }



        if (_openPageTabs.Count > 0)

        {

            var index = Math.Max(0, _openPageTabs.Count - 1);

            await LoadPageAsync(_openPageTabs[index]);

            return;

        }



        await ClearEditorAsync();

    }



    private void RefreshPageTabBar()

    {

        if (_pageTabBar == null)

            return;



        PruneMissingPageTabs();



        var items = _openPageTabs

            .Select(pageId => new PageTabBarItem(

                pageId,

                GetOpenTabTitle(pageId),

                _currentPageId == pageId && _isDirty
                || PageContentCache.IsPendingPrimaryFlush(pageId)))

            .ToList();



        _suppressPageTabEvents = true;

        try

        {

            var shouldShow = items.Count > 0;

            var visibilityChanged = _pageTabBar.Visible != shouldShow;

            _pageTabBar.SetTabs(items, _currentPageId);

            _pageTabBar.Visible = shouldShow;

            if (visibilityChanged)

                pnlEditorHost.PerformLayout();

            _pageTabBar.RelayoutTabs();

            if (shouldShow)

                BeginInvoke(() => _pageTabBar?.RelayoutTabs());

        }

        finally

        {

            _suppressPageTabEvents = false;

        }

    }



    private void PruneMissingPageTabs()

    {

        if (!SessionContext.IsLoggedIn || _openPageTabs.Count == 0)

            return;



        for (var i = _openPageTabs.Count - 1; i >= 0; i--)

        {

            var pageId = _openPageTabs[i];

            if (AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId) != null)

                continue;



            _openPageTabs.RemoveAt(i);

            _pageTabTitles.Remove(pageId);

        }

    }



    private string GetOpenTabTitle(int pageId)

    {

        if (_currentPageId == pageId && !string.IsNullOrWhiteSpace(_currentPageTitle))

            return _currentPageTitle;



        if (_pageTabTitles.TryGetValue(pageId, out var cached))

            return cached;



        var page = SessionContext.IsLoggedIn

            ? AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId)

            : null;

        if (page != null)

            _pageTabTitles[pageId] = page.Title;



        return page?.Title ?? Localization.Get(K.UntitledPageTitle);

    }



    private async Task HandlePageRemovedFromTabsAsync(int pageId)

    {

        RemovePageTab(pageId);



        if (_currentPageId != pageId)

        {

            RefreshPageTabBar();

            return;

        }



        if (_openPageTabs.Count > 0)

        {

            var index = Math.Max(0, _openPageTabs.Count - 1);

            await LoadPageAsync(_openPageTabs[index]);

            return;

        }



        await ClearEditorImmediateAsync();

        RefreshPageTabBar();

    }



    private void ClearPageTabs(bool persistChanges = false)

    {

        _openPageTabs.Clear();

        _pageTabTitles.Clear();

        if (persistChanges)

            PersistOpenPageTabs();

        RefreshPageTabBar();

    }



    private void ApplyPageTabsTheme()

    {

        _pageTabBar?.ApplyTheme();

    }

}


