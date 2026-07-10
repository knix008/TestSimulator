using System.Drawing;
using System.Reflection;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

public sealed class BufferedPropertyGrid : PropertyGrid
{
	private bool _sortGuard;

	public BufferedPropertyGrid()
	{
		typeof(Control).InvokeMember(
			"DoubleBuffered",
			BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.SetProperty,
			null,
			this,
			[true]);
		PropertySortChanged += OnPropertySortChanged;
		ApplyTheme();
	}

	public void ApplyTheme()
	{
		Invalidate(true);
	}

	public bool IsAlphabeticalWithinCategories =>
		PropertySort == PropertySort.CategorizedAlphabetical;

	public void SetSortByCategory()
	{
		ApplyPropertySort(PropertySort.Categorized);
	}

	public void SetSortAlphabetical()
	{
		ApplyPropertySort(PropertySort.CategorizedAlphabetical);
	}

	private void OnPropertySortChanged(object sender, EventArgs e)
	{
		if (_sortGuard)
		{
			return;
		}

		if (PropertySort == PropertySort.Alphabetical)
		{
			ApplyPropertySort(PropertySort.CategorizedAlphabetical);
		}
		else
		{
			RefreshSortedView();
		}
	}

	private void ApplyPropertySort(PropertySort sort)
	{
		if (PropertySort == sort)
		{
			RefreshSortedView();
			return;
		}

		_sortGuard = true;
		try
		{
			PropertySort = sort;
			RefreshSortedView();
		}
		finally
		{
			_sortGuard = false;
		}
	}

	private void RefreshSortedView()
	{
		object selected = SelectedObject;
		if (selected == null)
		{
			return;
		}

		SelectedObject = null;
		SelectedObject = selected;
		Invalidate(true);
	}
}
