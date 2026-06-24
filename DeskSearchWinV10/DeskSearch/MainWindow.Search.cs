using System.Windows;
using DeskSearch.Models;

namespace DeskSearch;

public partial class MainWindow
{
    private int _searchGeneration;

    private void PerformSearch()
    {
        if (!_indexService.IsSearchEnabled)
            return;

        var query = SearchBox.Text;
        var generation = Interlocked.Increment(ref _searchGeneration);

        Task.Run(() =>
        {
            var results = _indexService.Search(query);
            if (generation != Volatile.Read(ref _searchGeneration))
                return;

            Dispatcher.BeginInvoke(() => ApplySearchResults(results, generation, query));
        });
    }

    private void ApplySearchResults(IReadOnlyList<FileEntry> results, int generation, string query)
    {
        if (generation != _searchGeneration || query != SearchBox.Text)
            return;

        ResultsList.ItemsSource = results;
        ResultsList.Visibility = results.Count > 0 ? Visibility.Visible : Visibility.Collapsed;

        if (results.Count > 0)
            ResultsList.SelectedIndex = 0;
    }

    private void RefreshSearchIfNeeded()
    {
        if (!string.IsNullOrWhiteSpace(SearchBox.Text))
            PerformSearch();
    }
}
