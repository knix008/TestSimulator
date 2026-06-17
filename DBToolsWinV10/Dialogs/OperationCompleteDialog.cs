using System.Diagnostics;
using System.Windows.Forms;

namespace DBToolsWinV10.Dialogs;

public static class OperationCompleteDialog
{
	public static void ShowSaved(IWin32Window owner, string title, string savedPath, string message = null, bool offerOpenInNotepad = false)
	{
		string path = Path.GetFullPath(savedPath);
		string body = (string.IsNullOrWhiteSpace(message) ? "작업이 완료되었습니다." : message)
			+ "\n\n저장 경로:\n"
			+ path;
		if (offerOpenInNotepad)
		{
			if (MessageBox.Show(owner, body + "\n\n메모장으로 열까요?", title, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
			{
				Process.Start(new ProcessStartInfo("notepad.exe", path) { UseShellExecute = true });
			}
			return;
		}

		MessageBox.Show(owner, body, title, MessageBoxButtons.OK, MessageBoxIcon.Information);
	}

	public static void ShowSavedMany(IWin32Window owner, string title, IEnumerable<string> savedPaths, string message = null)
	{
		List<string> paths = savedPaths
			.Where(path => !string.IsNullOrWhiteSpace(path))
			.Select(Path.GetFullPath)
			.ToList();
		string body = (string.IsNullOrWhiteSpace(message) ? "작업이 완료되었습니다." : message)
			+ "\n\n저장 경로:";
		if (paths.Count == 0)
		{
			body += "\n(없음)";
		}
		else
		{
			body += "\n" + string.Join("\n", paths);
		}

		MessageBox.Show(owner, body, title, MessageBoxButtons.OK, MessageBoxIcon.Information);
	}

	public static void ShowFailed(IWin32Window owner, string title, string filePath, string message = null, Exception exception = null)
	{
		string path = string.IsNullOrWhiteSpace(filePath) ? "(없음)" : Path.GetFullPath(filePath);
		string body = (string.IsNullOrWhiteSpace(message) ? "작업에 실패했습니다." : message)
			+ "\n\n파일 경로:\n"
			+ path;
		if (exception != null && !string.IsNullOrWhiteSpace(exception.Message))
		{
			body += "\n\n오류:\n" + exception.Message;
		}

		MessageBox.Show(owner, body, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
	}
}
