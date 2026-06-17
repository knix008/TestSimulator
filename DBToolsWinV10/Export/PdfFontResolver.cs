using System.Collections.Generic;
using System.IO;
using PdfSharp.Fonts;

namespace DBToolsWinV10.Export;

internal sealed class ReportPdfFontResolver : IFontResolver
{
	private static readonly string[] RegularFontFiles =
	[
		"malgun.ttf",
		"malgunsl.ttf",
		"segoeui.ttf",
		"arial.ttf",
		"tahoma.ttf"
	];

	private static readonly string[] BoldFontFiles =
	[
		"malgunbd.ttf",
		"segoeuib.ttf",
		"arialbd.ttf",
		"tahomabd.ttf"
	];

	private static readonly string[] FallbackFamilyNames =
	[
		"Malgun Gothic",
		"맑은 고딕",
		"Segoe UI",
		"Arial",
		"Tahoma"
	];

	private static readonly Dictionary<string, string> FaceToFilePath = new Dictionary<string, string>();
	private static readonly Dictionary<string, byte[]> FaceToBytes = new Dictionary<string, byte[]>();
	private static bool _initialized;

	public static void EnsureInitialized()
	{
		if (_initialized)
		{
			return;
		}

		if (GlobalFontSettings.FontResolver == null)
		{
			GlobalFontSettings.FontResolver = new ReportPdfFontResolver();
		}

		_initialized = true;
	}

	public FontResolverInfo ResolveTypeface(string familyName, bool isBold, bool isItalic)
	{
		FontResolverInfo info = PlatformFontResolver.ResolveTypeface(familyName, isBold, isItalic);
		if (info != null)
		{
			return info;
		}

		foreach (string fallbackFamily in FallbackFamilyNames)
		{
			info = PlatformFontResolver.ResolveTypeface(fallbackFamily, isBold, isItalic);
			if (info != null)
			{
				return info;
			}
		}

		string faceName = ResolveEmbeddedFace(isBold);
		return faceName == null ? null : new FontResolverInfo(faceName, isBold, isItalic);
	}

	public byte[] GetFont(string faceName)
	{
		if (FaceToBytes.TryGetValue(faceName, out byte[] cached))
		{
			return cached;
		}

		if (FaceToFilePath.TryGetValue(faceName, out string filePath) && File.Exists(filePath))
		{
			byte[] bytes = File.ReadAllBytes(filePath);
			FaceToBytes[faceName] = bytes;
			return bytes;
		}

		return null;
	}

	private static string ResolveEmbeddedFace(bool isBold)
	{
		string faceName = isBold ? "ReportPdfBold" : "ReportPdfRegular";
		if (FaceToFilePath.ContainsKey(faceName))
		{
			return faceName;
		}

		string filePath = FindFontFile(isBold ? BoldFontFiles : RegularFontFiles);
		if (filePath == null)
		{
			return null;
		}

		FaceToFilePath[faceName] = filePath;
		return faceName;
	}

	private static string FindFontFile(IEnumerable<string> candidates)
	{
		foreach (string directory in GetFontDirectories())
		{
			foreach (string fileName in candidates)
			{
				string path = Path.Combine(directory, fileName);
				if (File.Exists(path))
				{
					return path;
				}
			}
		}

		return null;
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
