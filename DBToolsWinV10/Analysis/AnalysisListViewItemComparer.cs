using System.Collections;
using System.Windows.Forms;
using DBToolsWinV10.App;
using DBToolsWinV10.Controls;

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
		bool leftCategory = left.Tag is ListViewCategoryRow;
		bool rightCategory = right.Tag is ListViewCategoryRow;
		if (leftCategory || rightCategory)
		{
			if (leftCategory && rightCategory)
				return string.Compare(left.Text, right.Text, StringComparison.OrdinalIgnoreCase);
			return leftCategory ? -1 : 1;
		}

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
			"BCNF" => 4,
			"4NF" => 5,
			"5NF" => 6,
			_ => 99
		};
	}

	private static int CompareSeverity(string left, string right)
	{
		return GetSeverityOrder(left).CompareTo(GetSeverityOrder(right));
	}

	private static int GetSeverityOrder(string value)
	{
		if (value == L.S("SevError",   "오류")) return 0;
		if (value == L.S("SevWarning", "경고")) return 1;
		if (value == L.S("SevInfo",    "정보")) return 2;
		return 99;
	}
}
