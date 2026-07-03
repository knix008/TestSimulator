using System.Windows.Forms;
using MyPDFEditorWinV10.Dialogs;
using UglyToad.PdfPig;
using PdfPigDocument = UglyToad.PdfPig.PdfDocument;

namespace MyPDFEditorWinV10.Services;

public static class PdfUnlockService
{
	public static bool TryUnlock(IWin32Window owner, string filePath, out string password, out bool isPasswordProtected)
	{
		password = null;
		isPasswordProtected = false;

		if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
		{
			return false;
		}

		if (TryOpenWithPassword(filePath, null))
		{
			return true;
		}

		isPasswordProtected = true;
		bool showInvalidPassword = false;
		string fileName = Path.GetFileName(filePath);

		while (true)
		{
			using PdfPasswordDialog dialog = new PdfPasswordDialog(fileName, showInvalidPassword);
			if (dialog.ShowDialog(owner) != DialogResult.OK)
			{
				password = null;
				return false;
			}

			string candidate = dialog.Password;
			if (TryOpenWithPassword(filePath, candidate))
			{
				password = candidate;
				return true;
			}

			showInvalidPassword = true;
		}
	}

	public static bool TryOpenWithPassword(string filePath, string password)
	{
		return TryOpenPdfium(filePath, password) && TryOpenPdfPig(filePath, password);
	}

	private static bool TryOpenPdfium(string filePath, string password)
	{
		try
		{
			using PdfiumViewer.PdfDocument document = string.IsNullOrEmpty(password)
				? PdfiumViewer.PdfDocument.Load(filePath)
				: PdfiumViewer.PdfDocument.Load(filePath, password);
			return document != null && document.PageCount > 0;
		}
		catch
		{
			return false;
		}
	}

	private static bool TryOpenPdfPig(string filePath, string password)
	{
		try
		{
			ParsingOptions options = new ParsingOptions();
			if (!string.IsNullOrEmpty(password))
			{
				options.Password = password;
			}

			using PdfPigDocument document = PdfPigDocument.Open(filePath, options);
			return document.NumberOfPages > 0;
		}
		catch
		{
			return false;
		}
	}
}
