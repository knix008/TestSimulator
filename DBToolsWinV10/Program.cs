using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using DBToolsWinV10.App;
using DBToolsWinV10.Dialogs;

namespace DBToolsWinV10;

internal static class Program
{
	[STAThread]
	private static void Main(string[] args)
	{
		UiThread.EnsureSta();
		L.Init(AppSettings.GetLanguage());
		ModernTheme.SetTheme(AppSettings.GetTheme() == "dark"
			? ModernTheme.ThemeKind.Dark
			: ModernTheme.ThemeKind.Light);
		ApplicationConfiguration.Initialize();
		Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
		Application.ThreadException += delegate(object _, ThreadExceptionEventArgs e)
		{
			UiThread.Run(delegate
			{
				ErrorDialog.Show(UiThread.GetMainForm(), "오류", e.Exception);
			});
		};
		Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
		AppDomain.CurrentDomain.UnhandledException += delegate(object _, UnhandledExceptionEventArgs e)
		{
			object exceptionObject = e.ExceptionObject;
			Exception ex = exceptionObject as Exception;
			if (ex != null)
			{
				Form main = UiThread.GetMainForm();
				if (main != null && !main.IsDisposed)
				{
					try
					{
						main.BeginInvoke(delegate
						{
							ErrorDialog.Show(main, "치명적 오류", ex);
						});
					}
					catch
					{
					}
				}
			}
		};
		string initialFile = null;
		if (args.Length > 0 && File.Exists(args[0]))
		{
			initialFile = args[0];
		}
		else
		{
			initialFile = RecentFilesManager.GetMostRecent();
		}

		Application.Run(new MainForm(initialFile));
	}
}
