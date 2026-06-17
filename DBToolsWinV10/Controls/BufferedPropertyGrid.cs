using System.Reflection;
using System.Windows.Forms;

namespace DBToolsWinV10.Controls;

public sealed class BufferedPropertyGrid : PropertyGrid
{
	public BufferedPropertyGrid()
	{
		typeof(Control).InvokeMember(
			"DoubleBuffered",
			BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.SetProperty,
			null,
			this,
			[true]);
	}
}
