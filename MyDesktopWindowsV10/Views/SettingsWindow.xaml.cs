using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;
using Palisades.Models;
using Palisades.Services;

namespace Palisades.Views;

/// <summary>
/// The configuration window reached from the tray icon: one place to tweak every fence.
/// </summary>
public partial class SettingsWindow : Window, INotifyPropertyChanged
{
    private readonly FenceManager _manager;
    private FenceData? _selectedFence;

    public SettingsWindow(FenceManager manager)
    {
        _manager = manager;
        InitializeComponent();
        DataContext = this;
        SelectedFence = Fences.FirstOrDefault();

        Localize();
        Strings.Changed += Localize;
        Closed += (_, _) => Strings.Changed -= Localize;
    }

    public IEnumerable<UiLanguage> LanguageOptions => Enum.GetValues<UiLanguage>();

    /// <summary>
    /// Walks the window and swaps any text the table knows about, so the XAML stays plain English
    /// and there is nothing to keep in sync.
    /// </summary>
    private void Localize()
    {
        Title = Strings.T("Palisades");
        Localizer.Apply(this);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ObservableCollection<FenceData> Fences => _manager.Fences;

    public AppSettings Settings => _manager.Settings;

    public IEnumerable<FenceSort> SortOptions => Enum.GetValues<FenceSort>();

    public bool HasSelection => _selectedFence is not null;

    public FenceData? SelectedFence
    {
        get => _selectedFence;
        set
        {
            if (ReferenceEquals(_selectedFence, value))
            {
                return;
            }

            _selectedFence = value;
            Raise();
            Raise(nameof(HasSelection));
            Raise(nameof(FenceOpacity));
        }
    }

    /// <summary>The alpha of the fence background, exposed as a friendly 0 to 1 slider.</summary>
    public double FenceOpacity
    {
        get => _selectedFence is null ? 1 : AlphaOf(_selectedFence.Background) / 255.0;
        set
        {
            if (_selectedFence is null)
            {
                return;
            }

            _selectedFence.Background = WithAlpha(_selectedFence.Background, (byte)Math.Round(Math.Clamp(value, 0.1, 1) * 255));
            Raise();
        }
    }

    private void NewFence_Click(object sender, RoutedEventArgs e)
    {
        SelectedFence = _manager.CreateFenceAtCursor();
    }

    private void NewPortal_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog { Title = "Choose a folder to show as a fence" };
        if (dialog.ShowDialog(this) == true)
        {
            SelectedFence = _manager.CreatePortal(dialog.FolderName);
        }
    }

    private void DeleteFence_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is null)
        {
            return;
        }

        var answer = MessageBox.Show(this,
            string.Format(Strings.T("Delete the fence '{0}'? The files it points at are left alone."), _selectedFence.Name),
            Strings.T("Delete fence"), MessageBoxButton.YesNo, MessageBoxImage.Warning);

        if (answer == MessageBoxResult.Yes)
        {
            var index = Fences.IndexOf(_selectedFence);
            _manager.Remove(_selectedFence);
            SelectedFence = Fences.Count == 0 ? null : Fences[Math.Clamp(index, 0, Fences.Count - 1)];
        }
    }

    private void RevealFence_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is null)
        {
            return;
        }

        _selectedFence.Hidden = false;
        _selectedFence.RolledUp = false;
        Settings.AllHidden = false;
    }

    private void Accent_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is not null && sender is Button { Tag: string accent })
        {
            _selectedFence.Accent = accent;
        }
    }

    private void Background_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is not null && sender is Button { Tag: string colour })
        {
            _selectedFence.Background = WithAlpha(colour, AlphaOf(_selectedFence.Background));
        }
    }

    private void PickPortal_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is null)
        {
            return;
        }

        var dialog = new OpenFolderDialog
        {
            Title = Strings.T("Choose the folder this fence should mirror"),
            InitialDirectory = Directory.Exists(_selectedFence.PortalPath) ? _selectedFence.PortalPath! : ""
        };

        if (dialog.ShowDialog(this) != true)
        {
            return;
        }

        _selectedFence.PortalPath = dialog.FolderName;
        _selectedFence.Kind = FenceKind.Portal;
        if (_selectedFence.Sort == FenceSort.Manual)
        {
            _selectedFence.Sort = FenceSort.Name;
        }

        _manager.RefreshPortal(_selectedFence);
    }

    private void StopPortal_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is not null)
        {
            _selectedFence.Kind = FenceKind.Manual;
        }
    }

    private void AddItems_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is null)
        {
            return;
        }

        var dialog = new OpenFileDialog
        {
            Title = Strings.T("Add items to this fence"),
            Filter = $"{Strings.T("Shortcuts and links")} (*.lnk;*.url)|*.lnk;*.url|{Strings.T("All files")} (*.*)|*.*",
            Multiselect = true
        };

        if (dialog.ShowDialog(this) == true)
        {
            AddPaths(dialog.FileNames);
        }
    }

    private void AddFolder_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is null)
        {
            return;
        }

        var dialog = new OpenFolderDialog { Title = Strings.T("Add a folder to this fence"), Multiselect = true };
        if (dialog.ShowDialog(this) == true)
        {
            AddPaths(dialog.FolderNames);
        }
    }

    private void RemoveItem_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedFence is not null && sender is Button { Tag: FenceItem item })
        {
            _selectedFence.Items.Remove(item);
        }
    }

    private void AddPaths(IEnumerable<string> paths)
    {
        if (_selectedFence is null)
        {
            return;
        }

        foreach (var path in paths)
        {
            if (_selectedFence.Items.Any(item => string.Equals(item.Path, path, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            _selectedFence.Items.Add(new FenceItem { Name = PortalSync.DisplayName(path), Path = path });
        }
    }

    private static byte AlphaOf(string colour)
    {
        try
        {
            return ColorConverter.ConvertFromString(colour) is Color parsed ? parsed.A : (byte)196;
        }
        catch (FormatException)
        {
            return 196;
        }
    }

    private static string WithAlpha(string colour, byte alpha)
    {
        try
        {
            if (ColorConverter.ConvertFromString(colour) is Color parsed)
            {
                return $"#{alpha:X2}{parsed.R:X2}{parsed.G:X2}{parsed.B:X2}";
            }
        }
        catch (FormatException)
        {
        }

        return colour;
    }

    private void Raise([CallerMemberName] string? propertyName = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}
