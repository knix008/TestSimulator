using System.Drawing;

namespace MyPDFEditorWinV10.Models;

public sealed class EditableDocument
{
	public string SourcePdfPath { get; set; }

	public string TextContent { get; set; } = string.Empty;

	public List<string> PageTexts { get; } = new();

	public List<EmbeddedImage> Images { get; } = new();

	public bool IsDirty { get; set; }

	public void EnsurePageCount(int pageCount)
	{
		if (pageCount < 0)
		{
			pageCount = 0;
		}

		while (PageTexts.Count < pageCount)
		{
			PageTexts.Add(string.Empty);
		}

		if (PageTexts.Count > pageCount)
		{
			PageTexts.RemoveRange(pageCount, PageTexts.Count - pageCount);
		}
	}

	public bool HasEditableContent()
	{
		if (Images.Count > 0)
		{
			return true;
		}

		foreach (string pageText in PageTexts)
		{
			if (!string.IsNullOrWhiteSpace(pageText))
			{
				return true;
			}
		}

		return !string.IsNullOrWhiteSpace(TextContent);
	}

	public string BuildCombinedTextContent()
	{
		System.Text.StringBuilder builder = new System.Text.StringBuilder();
		for (int i = 0; i < PageTexts.Count; i++)
		{
			if (string.IsNullOrWhiteSpace(PageTexts[i]))
			{
				continue;
			}

			if (builder.Length > 0)
			{
				builder.AppendLine();
				builder.AppendLine();
			}

			builder.AppendLine($"--- 페이지 {i + 1} ---");
			builder.AppendLine(PageTexts[i]);
		}

		return builder.ToString().TrimEnd();
	}

	public string DisplayTitle
	{
		get
		{
			if (string.IsNullOrWhiteSpace(SourcePdfPath))
			{
				return IsDirty ? "새 문서 *" : "새 문서";
			}

			string name = Path.GetFileName(SourcePdfPath);
			return IsDirty ? $"{name} *" : name;
		}
	}
}

public sealed class EmbeddedImage
{
	public string Name { get; set; }

	public Bitmap Bitmap { get; set; }

	public int? SourcePageIndex { get; set; }
}
