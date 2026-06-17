using System;
using System.Threading;
using System.Windows.Forms;

namespace DBToolsWinV10.App;

internal static class UiThread
{
	public static void EnsureSta()
	{
		if (Thread.CurrentThread.GetApartmentState() != ApartmentState.STA)
		{
			Thread.CurrentThread.SetApartmentState(ApartmentState.STA);
		}
	}

	public static Form GetMainForm()
	{
		foreach (Form openForm in Application.OpenForms)
		{
			if (!openForm.IsDisposed)
			{
				return openForm;
			}
		}
		return null;
	}

	public static void Run(Action action)
	{
		EnsureSta();
		Form mainForm = GetMainForm();
		if (mainForm != null && mainForm.InvokeRequired)
		{
			mainForm.Invoke(action);
		}
		else
		{
			action();
		}
	}
}
