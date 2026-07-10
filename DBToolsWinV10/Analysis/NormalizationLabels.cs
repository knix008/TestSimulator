using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

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
		NormalizationLevel.NF1  => L.S("NF1Group",  "1NF — 원자성"),
		NormalizationLevel.NF2  => L.S("NF2Group",  "2NF — 부분 종속"),
		NormalizationLevel.NF3  => L.S("NF3Group",  "3NF — 이행 종속"),
		NormalizationLevel.BCNF => L.S("BCNFGroup", "BCNF — Boyce-Codd 정규형"),
		_ => level.ToString()
	};

	public static string GetSeverityLabel(IssueSeverity severity) => severity switch
	{
		IssueSeverity.Error   => L.S("SevError",   "오류"),
		IssueSeverity.Warning => L.S("SevWarning", "경고"),
		IssueSeverity.Info    => L.S("SevInfo",    "정보"),
		_ => severity.ToString()
	};

	public static void ApplyListItemStyle(ListViewItem item, IssueSeverity severity)
	{
		item.UseItemStyleForSubItems = true;
		bool dark = ModernTheme.IsDark;
		switch (severity)
		{
		case IssueSeverity.Error:
			item.BackColor = dark ? Color.FromArgb(60, 22, 22) : Color.FromArgb(254, 226, 226);
			item.ForeColor = dark ? Color.FromArgb(252, 165, 165) : Color.FromArgb(185, 28, 28);
			break;
		case IssueSeverity.Warning:
			item.BackColor = dark ? Color.FromArgb(60, 45, 10) : Color.FromArgb(254, 243, 199);
			item.ForeColor = dark ? Color.FromArgb(252, 211, 77)  : Color.FromArgb(180, 83, 9);
			break;
		default:
			item.BackColor = dark ? Color.FromArgb(22, 30, 60)   : Color.FromArgb(238, 242, 255);
			item.ForeColor = dark ? Color.FromArgb(165, 180, 252) : Color.FromArgb(67, 56, 202);
			break;
		}
	}
}
