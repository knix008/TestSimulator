using System.Collections.ObjectModel;
using System.Text.Json.Serialization;

namespace Palisades.Models;

public enum FenceKind
{
    /// <summary>Items are added by hand and remembered in the workspace file.</summary>
    Manual,

    /// <summary>Items mirror the live contents of a folder (Fences calls these portals).</summary>
    Portal
}

public enum UiLanguage
{
    /// <summary>Follow the language Windows is set to.</summary>
    System,
    English,
    Korean
}

public enum FenceSort
{
    Manual,
    Name,
    Kind,
    Modified
}

public sealed class WorkspaceData
{
    public int Version { get; set; } = 2;
    public AppSettings Settings { get; set; } = new();
    public ObservableCollection<FenceData> Fences { get; set; } = [];

    /// <summary>Where each icon sits on the drawn desktop, keyed by its path.</summary>
    public Dictionary<string, DesktopSpot> DesktopPositions { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class DesktopSpot
{
    public double X { get; set; }
    public double Y { get; set; }
}

public sealed class AppSettings : ObservableObject
{
    private bool _quickHideOnDesktopDoubleClick = true;
    private bool _createFenceWithRightDrag = true;
    private bool _snapToGrid = true;
    private int _gridSize = 10;
    private bool _snapToEdges = true;
    private bool _launchAtLogin;
    private bool _fencesLocked;
    private bool _allHidden;
    private bool _hideDesktopIcons;
    private bool _drawDesktop = true;
    private UiLanguage _language = UiLanguage.System;

    /// <summary>Which language the menus and settings are shown in.</summary>
    public UiLanguage Language
    {
        get => _language;
        set => Set(ref _language, value);
    }

    /// <summary>Double-clicking empty desktop rolls every fence out of sight and back.</summary>
    public bool QuickHideOnDesktopDoubleClick
    {
        get => _quickHideOnDesktopDoubleClick;
        set => Set(ref _quickHideOnDesktopDoubleClick, value);
    }

    /// <summary>Right-dragging a rectangle on empty desktop creates a fence there.</summary>
    public bool CreateFenceWithRightDrag
    {
        get => _createFenceWithRightDrag;
        set => Set(ref _createFenceWithRightDrag, value);
    }

    public bool SnapToGrid
    {
        get => _snapToGrid;
        set => Set(ref _snapToGrid, value);
    }

    public int GridSize
    {
        get => _gridSize;
        set => Set(ref _gridSize, Math.Clamp(value, 2, 64));
    }

    public bool SnapToEdges
    {
        get => _snapToEdges;
        set => Set(ref _snapToEdges, value);
    }

    public bool LaunchAtLogin
    {
        get => _launchAtLogin;
        set => Set(ref _launchAtLogin, value);
    }

    /// <summary>Locked fences cannot be moved, resized or edited by accident.</summary>
    public bool FencesLocked
    {
        get => _fencesLocked;
        set => Set(ref _fencesLocked, value);
    }

    public bool AllHidden
    {
        get => _allHidden;
        set => Set(ref _allHidden, value);
    }

    /// <summary>
    /// Hides the shell's own desktop icons so only the fences show. Restored when Palisades exits.
    /// </summary>
    public bool HideDesktopIcons
    {
        get => _hideDesktopIcons;
        set => Set(ref _hideDesktopIcons, value);
    }

    /// <summary>
    /// Palisades switches the shell's icon layer off and draws the desktop itself. That is what lets
    /// an item inside a fence stop appearing on the wallpaper while its file stays in the Desktop
    /// folder for Explorer. Turning it off gives the desktop back to the shell.
    /// </summary>
    public bool DrawDesktop
    {
        get => _drawDesktop;
        set => Set(ref _drawDesktop, value);
    }
}

public sealed class FenceData : ObservableObject
{
    private string _name = "New fence";
    private double _left = 120;
    private double _top = 120;
    private double _width = 320;
    private double _height = 260;
    private double _expandedHeight = 260;
    private string _background = "#C4132B24";
    private string _titleBackground = "#59000000";
    private string _foreground = "#F2F5EF";
    private string _accent = "#D9F078";
    private bool _rolledUp;
    private bool _hidden;
    private FenceKind _kind = FenceKind.Manual;
    private string? _portalPath;
    private bool _portalShowHidden;
    private FenceSort _sort = FenceSort.Manual;
    private double _iconSize = 48;
    private bool _showLabels = true;

    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    public string Name
    {
        get => _name;
        set => Set(ref _name, value);
    }

    public double Left
    {
        get => _left;
        set => Set(ref _left, value);
    }

    public double Top
    {
        get => _top;
        set => Set(ref _top, value);
    }

    public double Width
    {
        get => _width;
        set => Set(ref _width, value);
    }

    public double Height
    {
        get => _height;
        set => Set(ref _height, value);
    }

    /// <summary>Height to restore when the fence is rolled back down.</summary>
    public double ExpandedHeight
    {
        get => _expandedHeight;
        set => Set(ref _expandedHeight, value);
    }

    public string Background
    {
        get => _background;
        set => Set(ref _background, value);
    }

    public string TitleBackground
    {
        get => _titleBackground;
        set => Set(ref _titleBackground, value);
    }

    public string Foreground
    {
        get => _foreground;
        set => Set(ref _foreground, value);
    }

    public string Accent
    {
        get => _accent;
        set => Set(ref _accent, value);
    }

    public bool RolledUp
    {
        get => _rolledUp;
        set => Set(ref _rolledUp, value);
    }

    public bool Hidden
    {
        get => _hidden;
        set => Set(ref _hidden, value);
    }

    public FenceKind Kind
    {
        get => _kind;
        set
        {
            if (Set(ref _kind, value))
            {
                Raise(nameof(IsPortal));
            }
        }
    }

    public string? PortalPath
    {
        get => _portalPath;
        set => Set(ref _portalPath, value);
    }

    public bool PortalShowHidden
    {
        get => _portalShowHidden;
        set => Set(ref _portalShowHidden, value);
    }

    public FenceSort Sort
    {
        get => _sort;
        set => Set(ref _sort, value);
    }

    public double IconSize
    {
        get => _iconSize;
        set
        {
            if (Set(ref _iconSize, Math.Clamp(value, 24, 96)))
            {
                Raise(nameof(CellWidth));
                Raise(nameof(CellHeight));
            }
        }
    }

    public bool ShowLabels
    {
        get => _showLabels;
        set
        {
            if (Set(ref _showLabels, value))
            {
                Raise(nameof(CellHeight));
            }
        }
    }

    public ObservableCollection<FenceItem> Items { get; set; } = [];

    [JsonIgnore]
    public bool IsPortal => Kind == FenceKind.Portal;

    [JsonIgnore]
    public double CellWidth => Math.Max(IconSize + 30, 74);

    [JsonIgnore]
    public double CellHeight => IconSize + (ShowLabels ? 40 : 14);

    public FenceData Clone()
    {
        var copy = new FenceData
        {
            Name = Name,
            Left = Left,
            Top = Top,
            Width = Width,
            Height = Height,
            ExpandedHeight = ExpandedHeight,
            Background = Background,
            TitleBackground = TitleBackground,
            Foreground = Foreground,
            Accent = Accent,
            Kind = Kind,
            PortalPath = PortalPath,
            PortalShowHidden = PortalShowHidden,
            Sort = Sort,
            IconSize = IconSize,
            ShowLabels = ShowLabels
        };

        foreach (var item in Items)
        {
            copy.Items.Add(new FenceItem { Name = item.Name, Path = item.Path });
        }

        return copy;
    }
}

public sealed class FenceItem : ObservableObject
{
    private string _name = "";
    private string _path = "";
    private double _x;
    private double _y;

    /// <summary>Only meaningful on the drawn desktop, where icons keep their own spot.</summary>
    [JsonIgnore]
    public double X
    {
        get => _x;
        set => Set(ref _x, value);
    }

    [JsonIgnore]
    public double Y
    {
        get => _y;
        set => Set(ref _y, value);
    }

    public string Name
    {
        get => _name;
        set => Set(ref _name, value);
    }

    public string Path
    {
        get => _path;
        set
        {
            if (Set(ref _path, value))
            {
                Raise(nameof(Icon));
                Raise(nameof(Exists));
            }
        }
    }

    /// <summary>True for shell places such as the Recycle Bin, which have no file path.</summary>
    [JsonIgnore]
    public bool IsShellPlace => Path.StartsWith("::{", StringComparison.Ordinal);

    /// <summary>The Recycle Bin is the one shell place with a command of its own: emptying it.</summary>
    [JsonIgnore]
    public bool IsRecycleBin => string.Equals(
        Path, "::{645FF040-5081-101B-9F08-00AA002F954E}", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public System.Windows.Media.ImageSource? Icon => IsShellPlace
        ? Services.ShellIconService.GetShellIcon(Path)
        : Services.ShellIconService.GetIcon(Path);

    [JsonIgnore]
    public bool Exists => IsShellPlace || File.Exists(Path) || Directory.Exists(Path);

    public void RefreshIcon()
    {
        Services.ShellIconService.Invalidate(Path);
        Raise(nameof(Icon));
        Raise(nameof(Exists));
    }
}
