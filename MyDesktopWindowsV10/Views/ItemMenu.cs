using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using MyDesktop.Interop;
using MyDesktop.Services;

namespace MyDesktop.Views;

/// <summary>
/// The menu Windows 11 shows for an icon, shown for an icon in a fence or on MyDesktop's desktop.
///
/// Windows 11 does not show the full shell menu any more. Explorer puts its own short menu in front
/// of it — a row of icon buttons, a handful of commands, and "Show more options" for the rest — and
/// that is what the desktop shows. Explorer draws it itself and offers no way for another program to
/// ask for it, so this builds one of the same shape. The commands in it are not invented: they are
/// read out of the shell's own menu and run through it, so each one does exactly what it does in
/// Explorer, including the ones installed by other programs.
///
/// What cannot be carried over are the commands Explorer hosts only for itself — the ones that come
/// from an app package rather than from a context menu handler, such as a modern "Compress to ZIP
/// file". Those appear in this menu only when the shell also offers them to the old menu.
/// </summary>
internal static class ItemMenu
{
    /// <summary>
    /// The commands Windows 11 keeps in the menu itself, in its order. Everything else in the
    /// shell's menu waits behind "Show more options", which is where Windows puts it too.
    /// </summary>
    private static readonly (string Verb, string Glyph, string Gesture)[] Promoted =
    [
        ("open", MenuArt.Open, "Enter"),
        ("opennewtab", MenuArt.Open, ""),
        ("opennewwindow", MenuArt.OpenExternal, ""),
        ("explore", MenuArt.FolderOpen, ""),
        ("openas", MenuArt.OpenWith, ""),
        ("runas", MenuArt.Shield, ""),
        ("opencontaining", MenuArt.FolderOpen, ""),
        ("PinToStartScreen", MenuArt.Pin, ""),
        ("taskbarpin", MenuArt.Pin, ""),
        ("taskbarunpin", MenuArt.Unpin, ""),
        ("pintohome", MenuArt.Pin, ""),
        ("pintohomefile", MenuArt.Pin, ""),
        ("Windows.Compress", MenuArt.Compress, ""),
        ("compress", MenuArt.Compress, ""),
        ("copyaspath", MenuArt.CopyPath, "Ctrl+Shift+C"),
        ("properties", MenuArt.Properties, "Alt+Enter")
    ];

    /// <summary>The buttons across the top, in Windows 11's order.</summary>
    private static readonly (string Verb, string Glyph)[] Tools =
    [
        ("cut", MenuArt.Cut),
        ("copy", MenuArt.Copy),
        ("rename", MenuArt.Rename),
        ("Windows.ModernShare", MenuArt.Share),
        ("delete", MenuArt.Delete)
    ];

    /// <summary>
    /// Shows the menu for <paramref name="paths"/> at a point in screen pixels.
    /// </summary>
    /// <param name="extras">MyDesktop's own entries, shown below the shell's.</param>
    /// <param name="chose">Called with the id of the caller's own entry that was picked.</param>
    /// <param name="ran">Called after a shell command has run, so the caller can take a new look.</param>
    public static void Show(Window owner, IReadOnlyList<string> paths, Point screenPoint,
        IReadOnlyList<ShellContextMenu.Entry> extras, Action<int> chose, Action ran)
    {
        var live = ShellContextMenu.Live.OpenForItems(owner, paths);
        if (live is null)
        {
            Diagnostics.Write("the shell gave no menu, falling back to the old one");
            // No shell menu to shape: the caller's own entries are still worth showing, and the old
            // path knows how to show them on their own.
            var picked = ShellContextMenu.ShowForItems(owner, paths, screenPoint, extras);
            if (picked == 0)
            {
                ran();
            }
            else
            {
                chose(picked);
            }

            return;
        }

        var menu = new ContextMenu
        {
            Style = (Style)Application.Current.Resources["ShellMenu"],
            Placement = PlacementMode.AbsolutePoint,
            StaysOpen = false
        };

        // The command runs once the menu is gone, the way it does in Explorer: a renaming dialog or
        // a properties sheet appearing from underneath an open menu looks like two things at once.
        Action? pending = null;

        var row = ToolRow(menu, live, action => pending = action, ran);
        if (row is not null)
        {
            menu.Items.Add(row);
            menu.Items.Add(Line());
        }

        var promoted = 0;
        foreach (var (verb, glyph, gesture) in Promoted)
        {
            if (live.Find(verb) is not { } node)
            {
                continue;
            }

            menu.Items.Add(Row(node.Text, glyph, node.Enabled, () => pending = () =>
            {
                live.Run(node);
                ran();
            }, gesture));
            promoted++;
        }

        if (extras.Count > 0)
        {
            if (promoted > 0)
            {
                menu.Items.Add(Line());
            }

            foreach (var entry in extras)
            {
                menu.Items.Add(Own(entry, id => pending = () => chose(id)));
            }
        }

        menu.Items.Add(Line());
        menu.Items.Add(Row(Strings.T("Show more options"), MenuArt.MoreOptions, true,
            () => pending = () => Classic(owner, paths, screenPoint, extras, chose, ran), "Shift+F10"));

        var transform = PresentationSource.FromVisual(owner)?.CompositionTarget?.TransformFromDevice ?? Matrix.Identity;
        var anchor = transform.Transform(screenPoint);
        menu.HorizontalOffset = anchor.X;
        menu.VerticalOffset = anchor.Y;

        // A menu belongs to the foreground window. Neither the fences nor the desktop layer are ever
        // activated by a click — they are pinned to the bottom of the z-order and the desktop layer
        // does not even take activation — so without this the menu is dismissed the instant it opens.
        NativeMethods.SetForegroundWindow(new System.Windows.Interop.WindowInteropHelper(owner).Handle);

        menu.Closed += (_, _) =>
        {
            // Run first, dispose second: the command is run through the menu that is being let go of.
            var action = pending;
            pending = null;
            action?.Invoke();
            live.Dispose();
        };

        MenuArt.Show(menu);
    }

    /// <summary>The whole shell menu, as Windows shows it behind "Show more options".</summary>
    private static void Classic(Window owner, IReadOnlyList<string> paths, Point screenPoint,
        IReadOnlyList<ShellContextMenu.Entry> extras, Action<int> chose, Action ran)
    {
        var picked = ShellContextMenu.ShowForItems(owner, paths, screenPoint, extras);
        if (picked != 0)
        {
            chose(picked);
        }
        else
        {
            ran();
        }
    }

    private static MenuItem? ToolRow(ContextMenu menu, ShellContextMenu.Live live, Action<Action> queue, Action ran)
    {
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(6, 2, 6, 2) };

        foreach (var (verb, glyph) in Tools)
        {
            if (live.Find(verb) is not { } node)
            {
                continue;
            }

            // Glyph above, the shell's own wording below, the way Windows 11 labels these.
            var face = new StackPanel { Orientation = Orientation.Vertical };
            face.Children.Add(new TextBlock
            {
                Text = glyph,
                FontFamily = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets"),
                FontSize = 16,
                HorizontalAlignment = HorizontalAlignment.Center
            });
            face.Children.Add(new TextBlock
            {
                Text = node.Text,

                // Named outright: the button draws its glyph in the icon font, and a label left to
                // inherit that font comes out as a row of empty boxes in any language it has no
                // letters for.
                FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI"),
                FontSize = 11,
                Margin = new Thickness(0, 4, 0, 0),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                HorizontalAlignment = HorizontalAlignment.Center
            });

            var button = new Button
            {
                Style = (Style)Application.Current.Resources["ShellMenuToolButton"],
                Content = face,
                IsEnabled = node.Enabled
            };

            button.Click += (_, _) =>
            {
                queue(() =>
                {
                    live.Run(node);
                    ran();
                });

                // A button is not a menu entry, so closing the menu is this handler's job. The
                // command itself waits for the menu to be gone, the way every other entry does.
                menu.IsOpen = false;
            };

            buttons.Children.Add(button);
        }

        if (buttons.Children.Count == 0)
        {
            return null;
        }

        // The row is an entry of the menu so it scrolls and lays out with the rest, but it must not
        // behave like one: no hover bar across it, and no closing when the gap between buttons is hit.
        var item = new MenuItem
        {
            Header = buttons,
            Height = double.NaN,
            Padding = new Thickness(0),
            Focusable = false,
            Template = RowTemplate()
        };

        return item;
    }

    /// <summary>A plain holder, so the button row is not drawn as a highlighted menu line.</summary>
    private static ControlTemplate RowTemplate()
    {
        var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetValue(ContentPresenter.ContentSourceProperty, "Header");
        presenter.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);

        return new ControlTemplate(typeof(MenuItem)) { VisualTree = presenter };
    }

    private static MenuItem Own(ShellContextMenu.Entry entry, Action<int> chose)
    {
        if (entry.Children is { Count: > 0 } children)
        {
            var parent = Row(entry.Text, MenuArt.MoveToFence, true, null);
            foreach (var child in children)
            {
                parent.Items.Add(Own(child, chose));
            }

            return parent;
        }

        return Row(entry.Text, MenuArt.Fence, true, () => chose(entry.Id));
    }

    private static MenuItem Row(string header, string glyph, bool enabled, Action? action, string? gesture = null)
    {
        var item = new MenuItem
        {
            Header = header,
            IsEnabled = enabled,
            Style = (Style)Application.Current.Resources["ShellMenuItem"],
            InputGestureText = gesture ?? string.Empty,
            Icon = MenuArt.Icon(glyph)
        };

        if (action is not null)
        {
            item.Click += (_, e) =>
            {
                // Only the entry that was clicked, not every parent it bubbled through.
                if (ReferenceEquals(e.OriginalSource, item))
                {
                    action();
                }
            };
        }

        return item;
    }

    private static Separator Line() => new()
    {
        Style = (Style)Application.Current.Resources["ShellMenuSeparator"]
    };
}
