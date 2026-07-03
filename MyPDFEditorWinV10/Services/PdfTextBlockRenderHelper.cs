using System.Drawing;
using MyPDFEditorWinV10.Models;
using PdfSharp.Drawing;

namespace MyPDFEditorWinV10.Services;

public static class PdfTextBlockRenderHelper
{
	private static readonly Dictionary<string, string> KnownFamilyNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
	{
		["Arial"] = "Arial",
		["ArialMT"] = "Arial",
		["Arial-Bold"] = "Arial",
		["Arial-BoldMT"] = "Arial",
		["Arial-Italic"] = "Arial",
		["Arial-ItalicMT"] = "Arial",
		["Arial-BoldItalic"] = "Arial",
		["Arial-BoldItalicMT"] = "Arial",
		["Helvetica"] = "Arial",
		["Helvetica-Bold"] = "Arial",
		["Helvetica-Oblique"] = "Arial",
		["Helvetica-BoldOblique"] = "Arial",
		["Times"] = "Times New Roman",
		["Times-Roman"] = "Times New Roman",
		["TimesNewRoman"] = "Times New Roman",
		["TimesNewRomanPS"] = "Times New Roman",
		["TimesNewRomanPSMT"] = "Times New Roman",
		["TimesNewRomanPS-BoldMT"] = "Times New Roman",
		["TimesNewRomanPS-ItalicMT"] = "Times New Roman",
		["TimesNewRomanPS-BoldItalicMT"] = "Times New Roman",
		["Times-Bold"] = "Times New Roman",
		["Times-Italic"] = "Times New Roman",
		["Times-BoldItalic"] = "Times New Roman",
		["Courier"] = "Courier New",
		["CourierNew"] = "Courier New",
		["CourierNewPSMT"] = "Courier New",
		["Courier-Bold"] = "Courier New",
		["MalgunGothic"] = "Malgun Gothic",
		["Malgun Gothic"] = "Malgun Gothic",
		["맑은 고딕"] = "Malgun Gothic",
		["Gulim"] = "Gulim",
		["GulimChe"] = "Gulim",
		["Dotum"] = "Dotum",
		["DotumChe"] = "Dotum",
		["Batang"] = "Batang",
		["BatangChe"] = "Batang",
		["Gungsuh"] = "Gungsuh",
		["GungsuhChe"] = "Gungsuh",
		["HYGoThic-Medium"] = "Malgun Gothic",
		["HYGothic-Medium"] = "Malgun Gothic",
		["HYGothic-Extra"] = "Malgun Gothic",
		["HYSinMyeongJo-Medium"] = "Batang",
		["SegoeUI"] = "Segoe UI",
		["Segoe UI"] = "Segoe UI",
		["Tahoma"] = "Tahoma",
		["Verdana"] = "Verdana",
		["Calibri"] = "Calibri",
		["Cambria"] = "Cambria",
		["SimSun"] = "SimSun",
		["SimHei"] = "SimHei",
		["MS-Gothic"] = "MS Gothic",
		["MSGothic"] = "MS Gothic",
		["YuGothic"] = "Yu Gothic",
		["Yu Gothic"] = "Yu Gothic"
	};

	public static string ResolveFontFamily(PdfTextBlock block)
	{
		if (block == null)
		{
			return "Malgun Gothic";
		}

		if (!string.IsNullOrWhiteSpace(block.FontFamilyName))
		{
			string fromDetails = MapToWindowsFamily(block.FontFamilyName);
			if (!string.IsNullOrWhiteSpace(fromDetails))
			{
				return fromDetails;
			}
		}

		return MapToWindowsFamily(block.FontName) ?? "Malgun Gothic";
	}

	public static FontStyle GetFontStyle(PdfTextBlock block)
	{
		FontStyle style = FontStyle.Regular;
		if (block?.IsBold == true)
		{
			style |= FontStyle.Bold;
		}

		if (block?.IsItalic == true)
		{
			style |= FontStyle.Italic;
		}

		return style;
	}

	public static XFontStyleEx GetXFontStyle(PdfTextBlock block)
	{
		if (block?.IsBold == true && block.IsItalic)
		{
			return XFontStyleEx.BoldItalic;
		}

		if (block?.IsBold == true)
		{
			return XFontStyleEx.Bold;
		}

		if (block?.IsItalic == true)
		{
			return XFontStyleEx.Italic;
		}

		return XFontStyleEx.Regular;
	}

	public static Color GetEditorForeColor(PdfTextBlock block)
	{
		if (block == null)
		{
			return Color.Black;
		}

		return Color.FromArgb(block.FillColorR, block.FillColorG, block.FillColorB);
	}

	public static Font CreateEditorFont(PdfTextBlock block, float fontSize)
	{
		string family = ResolveFontFamily(block);
		FontStyle style = GetFontStyle(block);
		try
		{
			return new Font(family, fontSize, style, GraphicsUnit.Point);
		}
		catch
		{
			try
			{
				return new Font(FontFamily.GenericSansSerif, fontSize, style, GraphicsUnit.Point);
			}
			catch
			{
				return new Font("Malgun Gothic", fontSize, style, GraphicsUnit.Point);
			}
		}
	}

	public static XFont CreatePdfFont(PdfTextBlock block, double fontSize)
	{
		double size = fontSize > 0 ? fontSize : 11d;
		return new XFont(ResolveFontFamily(block), size, GetXFontStyle(block));
	}

	public static XBrush CreatePdfBrush(PdfTextBlock block)
	{
		if (block == null)
		{
			return XBrushes.Black;
		}

		return new XSolidBrush(XColor.FromArgb(block.FillColorR, block.FillColorG, block.FillColorB));
	}

	public static void ApplyFontStyleFromNames(string fontName, string detailsName, ref bool isBold, ref bool isItalic, ref string familyName)
	{
		if (!string.IsNullOrWhiteSpace(detailsName))
		{
			ParseStyleFromName(detailsName, ref isBold, ref isItalic, ref familyName);
		}

		if (!string.IsNullOrWhiteSpace(fontName))
		{
			ParseStyleFromName(fontName, ref isBold, ref isItalic, ref familyName);
		}
	}

	private static string MapToWindowsFamily(string rawName)
	{
		if (string.IsNullOrWhiteSpace(rawName))
		{
			return null;
		}

		string normalized = StripSubsetPrefix(rawName.Trim());
		if (KnownFamilyNames.TryGetValue(normalized, out string mapped))
		{
			return mapped;
		}

		bool bold = false;
		bool italic = false;
		string baseName = normalized;
		ParseStyleFromName(normalized, ref bold, ref italic, ref baseName);
		baseName = StripMetricSuffixes(baseName);
		if (KnownFamilyNames.TryGetValue(baseName, out mapped))
		{
			return mapped;
		}

		if (baseName.Contains("Gothic", StringComparison.OrdinalIgnoreCase) ||
			baseName.Contains("Malgun", StringComparison.OrdinalIgnoreCase) ||
			baseName.Contains("맑은", StringComparison.OrdinalIgnoreCase) ||
			baseName.Contains("HYGoThic", StringComparison.OrdinalIgnoreCase) ||
			baseName.Contains("HYGothic", StringComparison.OrdinalIgnoreCase))
		{
			return "Malgun Gothic";
		}

		if (baseName.Contains("MyeongJo", StringComparison.OrdinalIgnoreCase) ||
			baseName.Contains("Batang", StringComparison.OrdinalIgnoreCase))
		{
			return "Batang";
		}

		if (baseName.Contains("Gulim", StringComparison.OrdinalIgnoreCase))
		{
			return "Gulim";
		}

		if (baseName.Contains("Dotum", StringComparison.OrdinalIgnoreCase))
		{
			return "Dotum";
		}

		if (baseName.Contains("Arial", StringComparison.OrdinalIgnoreCase) ||
			baseName.Contains("Helvetica", StringComparison.OrdinalIgnoreCase))
		{
			return "Arial";
		}

		if (baseName.Contains("Times", StringComparison.OrdinalIgnoreCase))
		{
			return "Times New Roman";
		}

		if (baseName.Contains("Courier", StringComparison.OrdinalIgnoreCase))
		{
			return "Courier New";
		}

		if (baseName.Contains(' ') && !baseName.EndsWith("MT", StringComparison.OrdinalIgnoreCase))
		{
			return baseName;
		}

		return null;
	}

	private static void ParseStyleFromName(string rawName, ref bool isBold, ref bool isItalic, ref string familyName)
	{
		string normalized = StripSubsetPrefix(rawName.Trim());
		if (normalized.Contains("BoldItalic", StringComparison.OrdinalIgnoreCase) ||
			normalized.Contains("BoldOblique", StringComparison.OrdinalIgnoreCase))
		{
			isBold = true;
			isItalic = true;
		}
		else if (normalized.Contains("Bold", StringComparison.OrdinalIgnoreCase))
		{
			isBold = true;
		}

		if (normalized.Contains("Italic", StringComparison.OrdinalIgnoreCase) ||
			normalized.Contains("Oblique", StringComparison.OrdinalIgnoreCase))
		{
			isItalic = true;
		}

		string candidate = StripMetricSuffixes(normalized);
		candidate = candidate
			.Replace("-BoldItalic", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("-BoldOblique", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("-Bold", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("-Italic", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("-Oblique", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("BoldItalic", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("BoldOblique", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("Bold", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("Italic", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Replace("Oblique", string.Empty, StringComparison.OrdinalIgnoreCase)
			.Trim('-', ' ', '_');

		if (!string.IsNullOrWhiteSpace(candidate))
		{
			familyName = candidate;
		}
	}

	private static string StripSubsetPrefix(string fontName)
	{
		int plusIndex = fontName.IndexOf('+');
		return plusIndex >= 0 ? fontName[(plusIndex + 1)..] : fontName;
	}

	private static string StripMetricSuffixes(string fontName)
	{
		string result = fontName;
		if (result.EndsWith("PSMT", StringComparison.OrdinalIgnoreCase))
		{
			result = result[..^4];
		}
		else if (result.EndsWith("PS", StringComparison.OrdinalIgnoreCase))
		{
			result = result[..^2];
		}
		else if (result.EndsWith("MT", StringComparison.OrdinalIgnoreCase))
		{
			result = result[..^2];
		}

		return result.TrimEnd('-', ' ');
	}
}
