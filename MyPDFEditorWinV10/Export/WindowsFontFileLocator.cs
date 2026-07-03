using System.Collections.Generic;
using System.IO;
using MyPDFEditorWinV10.Models;
using MyPDFEditorWinV10.Services;

namespace MyPDFEditorWinV10.Export;

internal static class WindowsFontFileLocator
{
	private static readonly Dictionary<string, string[]> FamilyCandidates = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
	{
		["Malgun Gothic"] = ["malgun.ttf", "malgun.ttc"],
		["맑은 고딕"] = ["malgun.ttf", "malgun.ttc"],
		["Gulim"] = ["gulim.ttc", "gulim.ttf"],
		["굴림"] = ["gulim.ttc", "gulim.ttf"],
		["Batang"] = ["batang.ttc", "batang.ttf"],
		["바탕"] = ["batang.ttc", "batang.ttf"],
		["Dotum"] = ["dotum.ttc", "dotum.ttf"],
		["돋움"] = ["dotum.ttc", "dotum.ttf"],
		["Arial"] = ["arial.ttf"],
		["Times New Roman"] = ["times.ttf", "timesbd.ttf"],
		["Courier New"] = ["cour.ttf"],
		["Segoe UI"] = ["segoeui.ttf"],
		["Calibri"] = ["calibri.ttf"],
		["Tahoma"] = ["tahoma.ttf"],
		["Verdana"] = ["verdana.ttf"],
		["Yu Gothic"] = ["yugothm.ttc", "yugothr.ttc"]
	};

	private static readonly Dictionary<string, byte[]> Cache = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);

	public static byte[] TryReadFontBytes(PdfTextBlock block)
	{
		string family = PdfTextBlockRenderHelper.ResolveFontFamily(block);
		string cacheKey = $"{family}|{block.IsBold}|{block.IsItalic}";
		if (Cache.TryGetValue(cacheKey, out byte[] cached))
		{
			return cached;
		}

		foreach (string fileName in GetCandidateFileNames(family, block.IsBold, block.IsItalic))
		{
			foreach (string directory in GetFontDirectories())
			{
				string path = Path.Combine(directory, fileName);
				if (!File.Exists(path))
				{
					continue;
				}

				try
				{
					byte[] bytes = File.ReadAllBytes(path);
					Cache[cacheKey] = bytes;
					return bytes;
				}
				catch
				{
				}
			}
		}

		return null;
	}

	private static IEnumerable<string> GetCandidateFileNames(string family, bool isBold, bool isItalic)
	{
		if (FamilyCandidates.TryGetValue(family, out string[] known))
		{
			foreach (string fileName in known)
			{
				yield return fileName;
			}
		}

		if (isBold && isItalic)
		{
			yield return ToFileToken(family) + "bi.ttf";
			yield return ToFileToken(family) + "z.ttf";
		}
		else if (isBold)
		{
			yield return ToFileToken(family) + "bd.ttf";
			yield return ToFileToken(family) + "b.ttf";
		}
		else if (isItalic)
		{
			yield return ToFileToken(family) + "i.ttf";
		}

		yield return ToFileToken(family) + ".ttf";
		yield return ToFileToken(family) + ".ttc";
	}

	private static string ToFileToken(string family)
	{
		return family.Replace(" ", string.Empty).ToLowerInvariant();
	}

	private static IEnumerable<string> GetFontDirectories()
	{
		string windowsFonts = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Fonts");
		if (Directory.Exists(windowsFonts))
		{
			yield return windowsFonts;
		}

		string localFonts = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
			"Microsoft",
			"Windows",
			"Fonts");
		if (Directory.Exists(localFonts))
		{
			yield return localFonts;
		}
	}
}
