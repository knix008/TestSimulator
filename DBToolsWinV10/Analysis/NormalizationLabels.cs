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
		NormalizationLevel.BCNF => "BCNF",
		NormalizationLevel.NF4 => "4NF",
		NormalizationLevel.NF5 => "5NF",
		_ => level.ToString()
	};

	public static string FormatLevelsLabel(NormalizationLevels levels)
	{
		if (levels == NormalizationLevels.None)
			return "1NF";

		var parts = new System.Collections.Generic.List<string>();
		if (levels.HasFlag(NormalizationLevels.NF1)) parts.Add("1NF");
		if (levels.HasFlag(NormalizationLevels.NF2)) parts.Add("2NF");
		if (levels.HasFlag(NormalizationLevels.NF3)) parts.Add("3NF");
		if (levels.HasFlag(NormalizationLevels.BCNF)) parts.Add("BCNF");
		if (levels.HasFlag(NormalizationLevels.NF4)) parts.Add("4NF");
		if (levels.HasFlag(NormalizationLevels.NF5)) parts.Add("5NF");
		return parts.Count > 0 ? string.Join(" · ", parts) : "1NF";
	}

	public static string GetLevelGroupTitle(NormalizationLevel level) => level switch
	{
		NormalizationLevel.NF1  => L.S("NF1Group",  "1NF — 원자성"),
		NormalizationLevel.NF2  => L.S("NF2Group",  "2NF — 부분 종속"),
		NormalizationLevel.NF3  => L.S("NF3Group",  "3NF — 이행 종속"),
		NormalizationLevel.BCNF => L.S("BCNFGroup", "BCNF — Boyce-Codd 정규형"),
		NormalizationLevel.NF4  => L.S("NF4Group",  "4NF — 다중값 종속"),
		NormalizationLevel.NF5  => L.S("NF5Group",  "5NF — 조인 종속"),
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
		item.BackColor = Color.Empty;
		item.ForeColor = severity switch
		{
			IssueSeverity.Error => ModernTheme.Danger,
			IssueSeverity.Warning => ModernTheme.Warning,
			_ => ModernTheme.Info,
		};
	}
}
