using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DBToolsWinV10.App;

/// <summary>
/// Applies Windows dark/light visual styles to native Win32 child controls in dialogs.
/// </summary>
internal static class NativeControlTheme
{
	private const int WmThemeChanged = 0x031A;

	private static readonly HashSet<Control> HookedControls = new();

	[DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
	private static extern int SetWindowTheme(nint hwnd, string pszSubAppName, string pszSubIdList);

	[DllImport("uxtheme.dll", EntryPoint = "#133")]
	private static extern bool AllowDarkModeForWindow(nint hwnd, bool allow);

	[DllImport("user32.dll", CharSet = CharSet.Auto)]
	private static extern nint SendMessage(nint hWnd, int msg, nint wParam, nint lParam);

	public static void ApplyDeep(Control root)
	{
		if (root == null || root.IsDisposed)
			return;

		ApplyToControl(root);
	}

	public static void Reapply(Control control)
	{
		if (control == null || control.IsDisposed || !control.IsHandleCreated)
			return;

		ApplyNativeTheme(control);
	}

	public static void ReapplyDeep(Control root)
	{
		if (root == null || root.IsDisposed)
			return;

		if (root.IsHandleCreated)
			ApplyNativeTheme(root);

		foreach (Control child in root.Controls)
			ReapplyDeep(child);
	}

	private static bool IsToolboxButton(Control control)
	{
		if (control is DBToolsWinV10.Controls.ToolboxButton)
			return true;

		for (Control parent = control.Parent; parent != null; parent = parent.Parent)
		{
			if (parent.Name == "panelToolBox")
				return true;
		}

		return false;
	}

	private static void ApplyToControl(Control control)
	{
		if (control == null || control.IsDisposed)
			return;

		EnsureHandleHook(control);
		if (control.IsHandleCreated)
			ApplyNativeTheme(control);

		foreach (Control child in control.Controls)
			ApplyToControl(child);
	}

	private static void EnsureHandleHook(Control control)
	{
		if (HookedControls.Contains(control))
			return;

		HookedControls.Add(control);
		control.HandleCreated += (_, _) => ApplyNativeTheme(control);
	}

	private static void ApplyNativeTheme(Control control)
	{
		if (!control.IsHandleCreated || control.IsDisposed)
			return;

		try
		{
			nint hwnd = control.Handle;
			bool dark = ModernTheme.IsDark;
			AllowDarkModeForWindow(hwnd, dark);

			string explorerTheme = dark ? "DarkMode_Explorer" : "Explorer";
			string cfdTheme = dark ? "DarkMode_CFD" : "Explorer";

			switch (control)
			{
				case DBToolsWinV10.Controls.ThemedCheckBox:
				case DBToolsWinV10.Controls.ThemedDialogButton:
					SetWindowTheme(hwnd, string.Empty, string.Empty);
					AllowDarkModeForWindow(hwnd, false);
					break;
				case Button btn when IsToolboxButton(btn):
					// Toolbox buttons are owner-colored and must never use native BUTTON chrome.
					SetWindowTheme(hwnd, string.Empty, string.Empty);
					AllowDarkModeForWindow(hwnd, false);
					break;
				case ComboBox:
					SetWindowTheme(hwnd, cfdTheme, "COMBOBOX");
					break;
				case TextBoxBase:
					SetWindowTheme(hwnd, cfdTheme, "EDIT");
					break;
				case NumericUpDown:
					SetWindowTheme(hwnd, cfdTheme, "EDIT");
					break;
				case Button btn when btn.FlatStyle == FlatStyle.Flat && !btn.UseVisualStyleBackColor:
				case CheckBox chk when chk.FlatStyle == FlatStyle.Flat && !chk.UseVisualStyleBackColor:
				case RadioButton rb when rb.FlatStyle == FlatStyle.Flat && !rb.UseVisualStyleBackColor:
					// Owner-colored flat controls paint ModernTheme colors; keep native dark mode off.
					SetWindowTheme(hwnd, string.Empty, string.Empty);
					AllowDarkModeForWindow(hwnd, false);
					break;
				case CheckBox or RadioButton or Button:
					SetWindowTheme(hwnd, explorerTheme, "BUTTON");
					break;
				case GroupBox:
					SetWindowTheme(hwnd, explorerTheme, "BUTTON");
					break;
				default:
					SetWindowTheme(hwnd, explorerTheme, null);
					break;
			}

			SendMessage(hwnd, WmThemeChanged, 0, 0);
			control.Invalidate(true);
		}
		catch
		{
			// uxtheme APIs are unavailable on some Windows builds.
		}
	}
}
