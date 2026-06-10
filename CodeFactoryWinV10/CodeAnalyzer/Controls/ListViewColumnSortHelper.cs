using System.Collections;
using System.Globalization;

namespace CodeAnalyzer.Controls;

internal static class ListViewColumnSortHelper
{
    public static void Enable(ListView listView)
    {
        var sorter = new ColumnItemSorter();
        listView.ColumnClick += (_, e) => sorter.ApplySort(listView, e.Column);
    }

    private sealed class ColumnItemSorter : IComparer
    {
        private int _column = -1;
        private bool _ascending = true;

        public void ApplySort(ListView listView, int column)
        {
            if (_column == column)
            {
                _ascending = !_ascending;
            }
            else
            {
                _column = column;
                _ascending = true;
            }

            listView.ListViewItemSorter = this;
            listView.Sort();
        }

        public int Compare(object? x, object? y)
        {
            if (_column < 0 || x is not ListViewItem itemX || y is not ListViewItem itemY)
            {
                return 0;
            }

            var textX = _column < itemX.SubItems.Count ? itemX.SubItems[_column].Text : string.Empty;
            var textY = _column < itemY.SubItems.Count ? itemY.SubItems[_column].Text : string.Empty;

            var result = CompareValues(textX, textY);
            return _ascending ? result : -result;
        }

        private static int CompareValues(string left, string right)
        {
            if (double.TryParse(left, NumberStyles.Float, CultureInfo.CurrentCulture, out var leftNumber)
                && double.TryParse(right, NumberStyles.Float, CultureInfo.CurrentCulture, out var rightNumber))
            {
                return leftNumber.CompareTo(rightNumber);
            }

            return string.Compare(left, right, StringComparison.CurrentCultureIgnoreCase);
        }
    }
}
