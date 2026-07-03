using System;
using System.IO;
using System.Windows.Forms;
using MyPDFEditorWinV10.App;
using MyPDFEditorWinV10.Dialogs;
using PdfiumViewer;

namespace MyPDFEditorWinV10;

internal static class Program
{
	[STAThread]
	private static void Main(string[] args)
	{
		ConfigurePdfiumNative();

		UiThread.EnsureSta();
		ApplicationConfiguration.Initialize();
		Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
		Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
		Application.ThreadException += (_, e) =>
		{
			ErrorDialog.Show(null, "오류", "예기치 않은 오류가 발생했습니다.", e.Exception);
		};
		AppDomain.CurrentDomain.UnhandledException += (_, e) =>
		{
			if (e.ExceptionObject is Exception ex)
			{
				ErrorDialog.Show(null, "치명적 오류", "프로그램을 계속 실행할 수 없습니다.", ex);
			}
		};

		string initialFile = args.Length > 0 && File.Exists(args[0]) ? args[0] : null;
		Application.Run(new MainForm(initialFile));
	}

	private static void ConfigurePdfiumNative()
	{
		PdfiumResolver.Resolve += (_, e) =>
		{
			string baseDir = AppContext.BaseDirectory;
			string archFolder = Environment.Is64BitProcess ? "x64" : "x86";
			string[] candidates =
			{
				Path.Combine(baseDir, archFolder, "pdfium.dll"),
				Path.Combine(baseDir, "pdfium.dll")
			};

			foreach (string candidate in candidates)
			{
				if (File.Exists(candidate))
				{
					e.PdfiumFileName = candidate;
					return;
				}
			}
		};
	}
}
