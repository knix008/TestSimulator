using System.Collections;
using System.Windows.Forms;

namespace DBToolsWinV10.Controls;

internal sealed class BufferedListView : ListView
{
	public BufferedListView()
	{
		DoubleBuffered = true;
	}
}
