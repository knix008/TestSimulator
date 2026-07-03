using System.Collections.Generic;
using MyPDFEditorWinV10.Models;
using MyPDFEditorWinV10.Services;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace MyPDFEditorWinV10.Export;

internal sealed class PdfPigExportFontCache
{
	private readonly PdfDocumentBuilder _builder;
	private readonly Dictionary<string, PdfDocumentBuilder.AddedFont> _fonts = new Dictionary<string, PdfDocumentBuilder.AddedFont>();

	public PdfPigExportFontCache(PdfDocumentBuilder builder)
	{
		_builder = builder;
	}

	public PdfDocumentBuilder.AddedFont GetFont(PdfTextBlock block)
	{
		string family = PdfTextBlockRenderHelper.ResolveFontFamily(block);
		string key = $"{family}|{block.IsBold}|{block.IsItalic}";
		if (_fonts.TryGetValue(key, out PdfDocumentBuilder.AddedFont cached))
		{
			return cached;
		}

		byte[] fontBytes = WindowsFontFileLocator.TryReadFontBytes(block);
		PdfDocumentBuilder.AddedFont added;
		if (fontBytes != null && fontBytes.Length > 0)
		{
			try
			{
				added = _builder.AddTrueTypeFont(fontBytes);
				_fonts[key] = added;
				return added;
			}
			catch
			{
			}
		}

		added = _builder.AddStandard14Font(MapStandard14Font(block));
		_fonts[key] = added;
		return added;
	}

	private static Standard14Font MapStandard14Font(PdfTextBlock block)
	{
		string family = PdfTextBlockRenderHelper.ResolveFontFamily(block);
		if (family.Contains("Courier", StringComparison.OrdinalIgnoreCase))
		{
			if (block.IsBold && block.IsItalic)
			{
				return Standard14Font.CourierBoldOblique;
			}

			if (block.IsBold)
			{
				return Standard14Font.CourierBold;
			}

			if (block.IsItalic)
			{
				return Standard14Font.CourierOblique;
			}

			return Standard14Font.Courier;
		}

		if (family.Contains("Times", StringComparison.OrdinalIgnoreCase))
		{
			if (block.IsBold && block.IsItalic)
			{
				return Standard14Font.TimesBoldItalic;
			}

			if (block.IsBold)
			{
				return Standard14Font.TimesBold;
			}

			if (block.IsItalic)
			{
				return Standard14Font.TimesItalic;
			}

			return Standard14Font.TimesRoman;
		}

		if (block.IsBold && block.IsItalic)
		{
			return Standard14Font.HelveticaBoldOblique;
		}

		if (block.IsBold)
		{
			return Standard14Font.HelveticaBold;
		}

		if (block.IsItalic)
		{
			return Standard14Font.HelveticaOblique;
		}

		return Standard14Font.Helvetica;
	}
}
