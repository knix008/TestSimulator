using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace DBToolsWinV10.App;

internal static class ClipboardHelper
{
	public static void SetText(string text)
	{
		if (string.IsNullOrEmpty(text))
		{
			return;
		}
		if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA)
		{
			SetTextCore(text);
			return;
		}
		Exception error = null;
		ManualResetEventSlim done = new ManualResetEventSlim(initialState: false);
		try
		{
			Thread thread = new Thread((ThreadStart)delegate
			{
				try
				{
					SetTextCore(text);
				}
				catch (Exception ex)
				{
					error = ex;
				}
				finally
				{
					done.Set();
				}
			});
			thread.SetApartmentState(ApartmentState.STA);
			thread.IsBackground = true;
			thread.Start();
			if (!done.Wait(TimeSpan.FromSeconds(5L)))
			{
				throw new TimeoutException("클립보드 복사 시간이 초과되었습니다.");
			}
			if (error != null)
			{
				throw error;
			}
		}
		finally
		{
			if (done != null)
			{
				((IDisposable)done).Dispose();
			}
		}
	}

	private static void SetTextCore(string text)
	{
		for (int i = 0; i < 5; i++)
		{
			try
			{
				Clipboard.SetText(text);
				break;
			}
			catch (ExternalException) when (i < 4)
			{
				Thread.Sleep(50);
			}
		}
	}
}
