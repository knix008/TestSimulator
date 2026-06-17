using System.Drawing;
using System.Windows.Forms;

namespace DBToolsWinV10.Analysis;

public static class NormalizationLabels
{
	public static string GetLevelLabel(NormalizationLevel level) => level switch
	{
		NormalizationLevel.NF1 => "1NF",
		NormalizationLevel.NF2 => "2NF",
		NormalizationLevel.NF3 => "3NF",
		_ => level.ToString()
	};

	public static string GetLevelGroupTitle(NormalizationLevel level) => level switch
	{
		NormalizationLevel.NF1 => "1NF — 원자성",
		NormalizationLevel.NF2 => "2NF — 부분 종속",
		NormalizationLevel.NF3 => "3NF — 이행 종속",
		_ => level.ToString()
	};

	public static string GetSeverityLabel(IssueSeverity severity) => severity switch
	{
		IssueSeverity.Error => "오류",
		IssueSeverity.Warning => "경고",
		IssueSeverity.Info => "정보",
		_ => severity.ToString()
	};

	public static void ApplyListItemStyle(ListViewItem item, IssueSeverity severity)
	{
		item.UseItemStyleForSubItems = true;
		switch (severity)
		{
		case IssueSeverity.Error:
			item.BackColor = Color.FromArgb(254, 226, 226);
			item.ForeColor = Color.FromArgb(185, 28, 28);
			break;
		case IssueSeverity.Warning:
			item.BackColor = Color.FromArgb(254, 243, 199);
			item.ForeColor = Color.FromArgb(180, 83, 9);
			break;
		default:
			item.BackColor = Color.FromArgb(238, 242, 255);
			item.ForeColor = Color.FromArgb(67, 56, 202);
			break;
		}
	}
}
