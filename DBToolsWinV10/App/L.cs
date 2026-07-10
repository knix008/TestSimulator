using System.Resources;

namespace DBToolsWinV10.App;

public static class L
{
	private static ResourceManager _rm;

	public static void Init(string language)
	{
		string resName = language == "en"
			? "DBToolsWinV10.Localization.Strings_en"
			: "DBToolsWinV10.Localization.Strings_ko";
		_rm = new ResourceManager(resName, typeof(L).Assembly);
	}

	public static string S(string key, string fallback = null)
	{
		if (_rm == null) return fallback ?? key;
		try { return _rm.GetString(key) ?? fallback ?? key; }
		catch { return fallback ?? key; }
	}
}
