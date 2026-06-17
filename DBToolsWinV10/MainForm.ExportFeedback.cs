using System;
using System.IO;
using DBToolsWinV10.Dialogs;

namespace DBToolsWinV10;

public partial class MainForm
{
	private void NotifyExportSucceeded(string title, string filePath, string message, bool offerOpenInNotepad = false)
	{
		statusLabel.Text = title + ": " + Path.GetFileName(filePath);
		OperationCompleteDialog.ShowSaved(this, title, filePath, message, offerOpenInNotepad);
	}

	private void NotifyExportFailed(string title, string filePath, Exception ex, string message = null)
	{
		statusLabel.Text = title + ": " + Path.GetFileName(filePath);
		OperationCompleteDialog.ShowFailed(this, title, filePath, message ?? "파일을 저장하지 못했습니다.", ex);
	}
}
