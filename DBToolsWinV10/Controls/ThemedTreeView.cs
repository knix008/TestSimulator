using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Controls;

internal sealed class ThemedTreeView : TreeView
{
	public ThemedTreeView()
	{
		DoubleBuffered = true;
		ApplyTheme();
	}

	public void ApplyTheme()
	{
		BorderStyle = BorderStyle.None;
		BackColor = ModernTheme.PanelBackground;
		ForeColor = ModernTheme.TextPrimary;
		Font = ModernTheme.UiFont;
		ItemHeight = 22;
		LineColor = ModernTheme.BorderLight;
		Invalidate(true);
	}

}
