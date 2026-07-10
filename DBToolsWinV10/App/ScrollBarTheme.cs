using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DBToolsWinV10.App;

/// <summary>
/// Applies ModernTheme colors to native Win32 scrollbars used by panels, lists, trees, and property grids.
/// </summary>
internal static class ScrollBarTheme
{
	private const int WmPaint = 0x000F;
	private const int WmNcDestroy = 0x0082;
	private const int WmThemeChanged = 0x031A;
	private const int SbCtl = 2;
	private const int SifAll = 0x0017;
	private const int MinThumbPixels = 18;
	private const int ArrowButtonPixels = 17;

	private const int PreferredAppModeForceDark = 0;
	private const int PreferredAppModeForceLight = 1;

	private static readonly Dictionary<nint, ScrollBarHook> Hooks = new();
	private static readonly HashSet<Control> WatchedControls = new();
	private static readonly HashSet<Form> WatchedForms = new();

	[StructLayout(LayoutKind.Sequential)]
	private struct Rect
	{
		public int Left;
		public int Top;
		public int Right;
		public int Bottom;

		public int Width => Right - Left;
		public int Height => Bottom - Top;
	}

	[StructLayout(LayoutKind.Sequential)]
	private struct PaintStruct
	{
		public nint hdc;
		public int fErase;
		public Rect rcPaint;
		public int fRestore;
		public int fIncUpdate;
		[MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
		public byte[] rgbReserved;
	}

	[StructLayout(LayoutKind.Sequential)]
	private struct ScrollInfo
	{
		public int cbSize;
		public int fMask;
		public int nMin;
		public int nMax;
		public int nPage;
		public int nPos;
		public int nTrackPos;
	}

	private delegate bool EnumChildWindowsProc(nint hwnd, nint lParam);

	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	private static extern bool EnumChildWindows(nint hwndParent, EnumChildWindowsProc lpEnumFunc, nint lParam);

	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	private static extern int GetClassName(nint hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);

	[DllImport("user32.dll")]
	private static extern bool GetClientRect(nint hWnd, out Rect lpRect);

	[DllImport("user32.dll")]
	private static extern nint BeginPaint(nint hWnd, ref PaintStruct lpPaint);

	[DllImport("user32.dll")]
	private static extern bool EndPaint(nint hWnd, ref PaintStruct lpPaint);

	[DllImport("user32.dll", CharSet = CharSet.Auto)]
	private static extern nint SendMessage(nint hWnd, int msg, nint wParam, nint lParam);

	[DllImport("comctl32.dll", EntryPoint = "GetScrollInfo")]
	private static extern bool GetScrollInfo(nint hwnd, int fnBar, ref ScrollInfo lpsi);

	[DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
	private static extern int SetWindowTheme(nint hwnd, string pszSubAppName, string pszSubIdList);

	[DllImport("uxtheme.dll", EntryPoint = "#133")]
	private static extern bool AllowDarkModeForWindow(nint hwnd, bool allow);

	[DllImport("uxtheme.dll", EntryPoint = "#135")]
	private static extern int SetPreferredAppMode(int appMode);

	[SuppressMessage("Interoperability", "WFO5001")]
	public static void SyncSystemColorMode()
	{
		try
		{
			SetPreferredAppMode(ModernTheme.IsDark ? PreferredAppModeForceDark : PreferredAppModeForceLight);
		}
		catch
		{
			// uxtheme ordinal exports are unavailable on some Windows builds.
		}

		try
		{
			Application.SetColorMode(ModernTheme.IsDark ? SystemColorMode.Dark : SystemColorMode.Classic);
		}
		catch
		{
			// Older Windows versions may not support application color mode.
		}
	}

	public static void Apply(Control root)
	{
		if (root == null || root.IsDisposed)
			return;

		WatchControl(root);
		if (root is Form form)
			WatchForm(form);

		ApplyToControl(root);
	}

	public static void Refresh(Control root)
	{
		if (root == null || root.IsDisposed)
			return;

		SyncSystemColorMode();
		DetachHooksForControl(root);
		ApplyToControl(root);
	}

	private static void WatchForm(Form form)
	{
		if (WatchedForms.Contains(form))
			return;

		WatchedForms.Add(form);
		form.ControlAdded += (_, e) =>
		{
			WatchControl(e.Control);
			ApplyToControl(e.Control);
		};
	}

	private static void WatchControl(Control control)
	{
		if (control == null || control.IsDisposed || WatchedControls.Contains(control))
			return;

		WatchedControls.Add(control);
		control.HandleCreated += (_, _) => ApplyToControl(control);
		control.HandleDestroyed += (_, _) => DetachHooksForControl(control);
		control.SizeChanged += (_, _) =>
		{
			if (control.IsHandleCreated)
				ApplyToControl(control);
		};
		control.VisibleChanged += (_, _) =>
		{
			if (control.IsHandleCreated)
				ApplyToControl(control);
		};
	}

	private static void ApplyToControl(Control control)
	{
		if (control == null || control.IsDisposed)
			return;

		if (control.IsHandleCreated)
		{
			if (ShouldApplyNativeScrollbarTheme(control))
				ApplyNativeScrollbarTheme(control.Handle);

			AttachToHwnd(control.Handle);
		}

		foreach (Control child in control.Controls)
			ApplyToControl(child);
	}

	private static bool ShouldApplyNativeScrollbarTheme(Control control) =>
		UsesNativeScrollbars(control);

	private static bool UsesNativeScrollbars(Control control) =>
		control is ScrollBar
		|| control is ListView
		|| control is TreeView
		|| control is TextBoxBase
		|| control is PropertyGrid
		|| control is DataGridView
		|| control is RichTextBox
		|| control is Panel { AutoScroll: true }
		|| control is ScrollableControl { AutoScroll: true };

	[DllImport("user32.dll")]
	private static extern bool InvalidateRect(nint hWnd, nint lpRect, bool bErase);

	private static void ApplyNativeScrollbarTheme(nint hwnd)
	{
		try
		{
			AllowDarkModeForWindow(hwnd, ModernTheme.IsDark);
			if (ModernTheme.IsDark)
				SetWindowTheme(hwnd, "DarkMode_Explorer", null);
			else
				SetWindowTheme(hwnd, "Explorer", null);

			SendMessage(hwnd, WmThemeChanged, 0, 0);
			InvalidateRect(hwnd, 0, true);
		}
		catch
		{
			// Ignore failures on older Windows versions.
		}
	}

	private static void DetachHooksForControl(Control control)
	{
		if (control == null || !control.IsHandleCreated)
			return;

		DetachFromHwnd(control.Handle);
		foreach (Control child in control.Controls)
			DetachHooksForControl(child);
	}

	private static void DetachAllHooks()
	{
		foreach (ScrollBarHook hook in Hooks.Values)
			hook.ReleaseHandle();

		Hooks.Clear();
	}

	private static void AttachToHwnd(nint hwnd)
	{
		if (IsScrollBarWindow(hwnd))
			AttachHook(hwnd);

		EnumChildWindows(hwnd, (childHwnd, _) =>
		{
			if (IsScrollBarWindow(childHwnd))
				AttachHook(childHwnd);
			return true;
		}, 0);
	}

	private static void DetachFromHwnd(nint hwnd)
	{
		if (Hooks.Remove(hwnd, out ScrollBarHook directHook))
			directHook.ReleaseHandle();

		EnumChildWindows(hwnd, (childHwnd, _) =>
		{
			if (Hooks.Remove(childHwnd, out ScrollBarHook hook))
				hook.ReleaseHandle();
			return true;
		}, 0);
	}

	private static bool IsScrollBarWindow(nint hwnd)
	{
		var className = new System.Text.StringBuilder(32);
		return GetClassName(hwnd, className, className.Capacity) > 0
			&& className.ToString() == "ScrollBar";
	}

	private static void AttachHook(nint hwnd)
	{
		if (Hooks.ContainsKey(hwnd))
			return;

		try
		{
			// Disable visual styles so WM_PAINT custom drawing is used.
			SetWindowTheme(hwnd, string.Empty, string.Empty);
		}
		catch
		{
			// Continue with subclassing even if theming API is unavailable.
		}

		var hook = new ScrollBarHook(hwnd);
		Hooks[hwnd] = hook;
		hook.InvalidateBar();
	}

	private sealed class ScrollBarHook : NativeWindow
	{
		public ScrollBarHook(nint handle)
		{
			AssignHandle(handle);
		}

		public void InvalidateBar()
		{
			if (Handle != 0)
			{
				NativeInvalidateRect(Handle, 0, true);
				NativeUpdateWindow(Handle);
			}
		}

		protected override void WndProc(ref Message m)
		{
			if (m.Msg == WmPaint)
			{
				PaintThemedScrollbar();
				m.Result = 0;
				return;
			}

			if (m.Msg == WmThemeChanged)
			{
				InvalidateBar();
			}

			if (m.Msg == WmNcDestroy)
			{
				Hooks.Remove(Handle);
				ReleaseHandle();
			}

			base.WndProc(ref m);
		}

		private void PaintThemedScrollbar()
		{
			var paint = new PaintStruct { rgbReserved = new byte[32] };
			nint hdc = BeginPaint(Handle, ref paint);
			if (hdc == 0)
				return;

			try
			{
				using var graphics = Graphics.FromHdc(hdc);
				GetClientRect(Handle, out Rect rect);
				var bounds = new Rectangle(0, 0, rect.Width, rect.Height);
				bool vertical = bounds.Height >= bounds.Width;
				DrawScrollbar(graphics, bounds, vertical, Handle);
			}
			finally
			{
				EndPaint(Handle, ref paint);
			}
		}

		private static void DrawScrollbar(Graphics g, Rectangle bounds, bool vertical, nint hwnd)
		{
			var info = new ScrollInfo
			{
				cbSize = Marshal.SizeOf<ScrollInfo>(),
				fMask = SifAll
			};
			if (!GetScrollInfo(hwnd, SbCtl, ref info))
			{
				using var fallback = new SolidBrush(ModernTheme.ScrollBarTrack);
				g.FillRectangle(fallback, bounds);
				return;
			}

			using var trackBrush = new SolidBrush(ModernTheme.ScrollBarTrack);
			g.FillRectangle(trackBrush, bounds);

			int range = info.nMax - info.nMin + 1;
			if (range <= 0 || info.nPage <= 0)
				return;

			Rectangle track = vertical
				? new Rectangle(bounds.X, bounds.Y + ArrowButtonPixels, bounds.Width, Math.Max(0, bounds.Height - ArrowButtonPixels * 2))
				: new Rectangle(bounds.X + ArrowButtonPixels, bounds.Y, Math.Max(0, bounds.Width - ArrowButtonPixels * 2), bounds.Height);

			if (track.Width <= 0 || track.Height <= 0)
				return;

			int trackPixels = vertical ? track.Height : track.Width;
			int thumbPixels = (int)Math.Round((double)trackPixels * info.nPage / range);
			thumbPixels = Math.Clamp(thumbPixels, MinThumbPixels, trackPixels);

			int travel = Math.Max(0, trackPixels - thumbPixels);
			int maxPos = Math.Max(1, info.nMax - info.nMin - info.nPage + 1);
			int thumbOffset = (int)Math.Round((double)travel * (info.nPos - info.nMin) / maxPos);

			Rectangle thumb = vertical
				? new Rectangle(track.X + 3, track.Y + thumbOffset, Math.Max(4, track.Width - 6), thumbPixels)
				: new Rectangle(track.X + thumbOffset, track.Y + 3, thumbPixels, Math.Max(4, track.Height - 6));

			using var thumbBrush = new SolidBrush(ModernTheme.ScrollBarThumb);
			g.FillRectangle(thumbBrush, thumb);

			DrawArrowButtons(g, bounds, vertical);
		}

		private static void DrawArrowButtons(Graphics g, Rectangle bounds, bool vertical)
		{
			using var arrowBrush = new SolidBrush(ModernTheme.ScrollBarArrow);
			if (vertical)
			{
				int centerX = bounds.X + bounds.Width / 2;
				g.FillPolygon(arrowBrush, [
					new Point(centerX, bounds.Y + ArrowButtonPixels / 2 - 3),
					new Point(centerX - 4, bounds.Y + ArrowButtonPixels / 2 + 3),
					new Point(centerX + 4, bounds.Y + ArrowButtonPixels / 2 + 3)
				]);
				g.FillPolygon(arrowBrush, [
					new Point(centerX, bounds.Bottom - ArrowButtonPixels / 2 + 3),
					new Point(centerX - 4, bounds.Bottom - ArrowButtonPixels / 2 - 3),
					new Point(centerX + 4, bounds.Bottom - ArrowButtonPixels / 2 - 3)
				]);
			}
			else
			{
				int centerY = bounds.Y + bounds.Height / 2;
				g.FillPolygon(arrowBrush, [
					new Point(bounds.X + ArrowButtonPixels / 2 - 3, centerY),
					new Point(bounds.X + ArrowButtonPixels / 2 + 3, centerY - 4),
					new Point(bounds.X + ArrowButtonPixels / 2 + 3, centerY + 4)
				]);
				g.FillPolygon(arrowBrush, [
					new Point(bounds.Right - ArrowButtonPixels / 2 + 3, centerY),
					new Point(bounds.Right - ArrowButtonPixels / 2 - 3, centerY - 4),
					new Point(bounds.Right - ArrowButtonPixels / 2 - 3, centerY + 4)
				]);
			}
		}

		[DllImport("user32.dll")]
		private static extern bool NativeInvalidateRect(nint hWnd, nint lpRect, bool bErase);

		[DllImport("user32.dll")]
		private static extern bool NativeUpdateWindow(nint hWnd);
	}
}
