using System.Threading;
using System.Windows.Forms;

namespace MyPDFEditorWinV10.App;

internal static class UiThread
{
	public static void EnsureSta()
	{
		if (Thread.CurrentThread.GetApartmentState() != ApartmentState.STA)
		{
			Thread.CurrentThread.SetApartmentState(ApartmentState.STA);
		}
	}
}
