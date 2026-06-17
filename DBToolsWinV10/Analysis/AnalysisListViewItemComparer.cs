using System.Collections;
using System.Windows.Forms;

namespace DBToolsWinV10.Analysis;

internal sealed class AnalysisListViewItemComparer : IComparer
{
	private readonly int _columnIndex;
	private readonly SortOrder _sortOrder;

	public AnalysisListViewItemComparer(int columnIndex, SortOrder sortOrder)
	{
		_columnIndex = columnIndex;
		_sortOrder = sortOrder;
	}

	public int Compare(object x, object y)
	{
		ListViewItem left = (ListViewItem)x;
		ListViewItem right = (ListViewItem)y;
		string leftText = GetCellText(left);
		string rightText = GetCellText(right);
		int result = _columnIndex switch
		{
			0 => CompareLevel(leftText, rightText),
			1 => CompareSeverity(leftText, rightText),
			_ => string.Compare(leftText, rightText, StringComparison.OrdinalIgnoreCase)
		};
		if (result == 0)
		{
			result = string.Compare(left.Text, right.Text, StringComparison.OrdinalIgnoreCase);
		}

		return _sortOrder == SortOrder.Descending ? -result : result;
	}

	private string GetCellText(ListViewItem item)
	{
		if (_columnIndex == 0)
		{
			return item.Text;
		}

		if (_columnIndex < item.SubItems.Count)
		{
			return item.SubItems[_columnIndex].Text;
		}

		return string.Empty;
	}

	private static int CompareLevel(string left, string right)
	{
		return GetLevelOrder(left).CompareTo(GetLevelOrder(right));
	}

	private static int GetLevelOrder(string value)
	{
		return value switch
		{
			"1NF" => 1,
			"2NF" => 2,
			"3NF" => 3,
			_ => 99
		};
	}

	private static int CompareSeverity(string left, string right)
	{
		return GetSeverityOrder(left).CompareTo(GetSeverityOrder(right));
	}

	private static int GetSeverityOrder(string value)
	{
		return value switch
		{
			"오류" => 0,
			"경고" => 1,
			"정보" => 2,
			_ => 99
		};
	}
}
