using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using MyClockWinV10.Models;

namespace MyClockWinV10;

public partial class AddWorldTimeDialog : Window
{
    public WorldTimeEntry? Result { get; private set; }

    private bool _suppressCity;
    private bool _suppressRegion;
    private bool _navigatingCity;
    private bool _navigatingRegion;

    public AddWorldTimeDialog()
    {
        InitializeComponent();
        var zones = TimeZoneInfo.GetSystemTimeZones();
        TzCombo.ItemsSource  = zones;
        TzCombo.SelectedItem = zones.FirstOrDefault(z => z.Id == "UTC");
    }

    // ── City autocomplete ─────────────────────────────────────────────────

    private void CityBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_suppressCity) return;
        var matches = CityDatabase.Search(CityBox.Text).ToList();
        CityList.ItemsSource = matches;
        CityPopup.IsOpen     = matches.Count > 0;
        UpdateCitySelectEnabled();
    }

    private void CityList_PreviewMouseDown(object sender, MouseButtonEventArgs e)
    {
        var item = FindListBoxItem(CityList, e.OriginalSource as DependencyObject);
        if (item?.DataContext is CityInfo city)
        {
            CityList.SelectedItem = city;
            UpdateCitySelectEnabled();
            e.Handled = true;
        }
    }

    private void CityList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (CityList.SelectedItem is CityInfo city)
            ApplyCity(city);
    }

    private void CityList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        => UpdateCitySelectEnabled();

    private void CitySelect_Click(object sender, RoutedEventArgs e)
    {
        if (CityList.SelectedItem is CityInfo city)
            ApplyCity(city);
        else if (CityList.Items.Count == 1 && CityList.Items[0] is CityInfo only)
            ApplyCity(only);
    }

    private void CityBox_LostFocus(object sender, RoutedEventArgs e)
    {
        Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Input,
            new Action(() =>
            {
                if (IsPopupFocusWithin(CityPopup))
                    return;
                CityPopup.IsOpen = false;
            }));
    }

    private void CityBox_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (!CityPopup.IsOpen) return;
        switch (e.Key)
        {
            case Key.Down:
                _navigatingCity = true;
                CityList.SelectedIndex = Math.Min(CityList.SelectedIndex + 1, CityList.Items.Count - 1);
                if (CityList.SelectedIndex < 0) CityList.SelectedIndex = 0;
                _navigatingCity = false;
                UpdateCitySelectEnabled();
                e.Handled = true;
                break;
            case Key.Up:
                _navigatingCity = true;
                if (CityList.SelectedIndex > 0) CityList.SelectedIndex--;
                _navigatingCity = false;
                UpdateCitySelectEnabled();
                e.Handled = true;
                break;
            case Key.Enter:
                if (CityList.SelectedItem is CityInfo city)
                    ApplyCity(city);
                else if (CityList.Items.Count == 1 && CityList.Items[0] is CityInfo only)
                    ApplyCity(only);
                e.Handled = true;
                break;
            case Key.Escape:
                CityPopup.IsOpen = false;
                e.Handled = true;
                break;
        }
    }

    private void ApplyCity(CityInfo city)
    {
        _suppressCity   = true;
        _suppressRegion = true;
        CityBox.Text    = city.City;
        RegionBox.Text  = city.Country;
        _suppressCity   = false;
        _suppressRegion = false;
        CityPopup.IsOpen   = false;
        RegionPopup.IsOpen = false;

        var tz = TimeZoneInfo.GetSystemTimeZones().FirstOrDefault(z => z.Id == city.TimeZoneId);
        if (tz != null) TzCombo.SelectedItem = tz;

        CityList.SelectedItem = null;
        CityBox.CaretIndex    = CityBox.Text.Length;
        UpdateCitySelectEnabled();
        TzCombo.Focus();
    }

    private void UpdateCitySelectEnabled()
    {
        if (_navigatingCity) return;
        CitySelectBtn.IsEnabled = CityList.SelectedItem is CityInfo
                                  || (CityList.Items.Count == 1 && CityList.Items[0] is CityInfo);
    }

    // ── Region / Country autocomplete ─────────────────────────────────────

    private void RegionBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_suppressRegion) return;
        var matches = CityDatabase.SearchCountries(RegionBox.Text).ToList();
        RegionList.ItemsSource = matches;
        RegionPopup.IsOpen     = matches.Count > 0;
        UpdateRegionSelectEnabled();
    }

    private void RegionList_PreviewMouseDown(object sender, MouseButtonEventArgs e)
    {
        var item = FindListBoxItem(RegionList, e.OriginalSource as DependencyObject);
        if (item?.Content is string country)
        {
            RegionList.SelectedItem = country;
            UpdateRegionSelectEnabled();
            e.Handled = true;
        }
        else if (item?.DataContext is string countryFromDc)
        {
            RegionList.SelectedItem = countryFromDc;
            UpdateRegionSelectEnabled();
            e.Handled = true;
        }
    }

    private void RegionList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (RegionList.SelectedItem is string country)
            ApplyCountry(country);
    }

    private void RegionList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        => UpdateRegionSelectEnabled();

    private void RegionSelect_Click(object sender, RoutedEventArgs e)
    {
        if (RegionList.SelectedItem is string country)
            ApplyCountry(country);
        else if (RegionList.Items.Count == 1 && RegionList.Items[0] is string only)
            ApplyCountry(only);
    }

    private void RegionBox_LostFocus(object sender, RoutedEventArgs e)
    {
        Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Input,
            new Action(() =>
            {
                if (IsPopupFocusWithin(RegionPopup))
                    return;
                RegionPopup.IsOpen = false;
            }));
    }

    private void RegionBox_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (!RegionPopup.IsOpen) return;
        switch (e.Key)
        {
            case Key.Down:
                _navigatingRegion = true;
                RegionList.SelectedIndex = Math.Min(RegionList.SelectedIndex + 1, RegionList.Items.Count - 1);
                if (RegionList.SelectedIndex < 0) RegionList.SelectedIndex = 0;
                _navigatingRegion = false;
                UpdateRegionSelectEnabled();
                e.Handled = true;
                break;
            case Key.Up:
                _navigatingRegion = true;
                if (RegionList.SelectedIndex > 0) RegionList.SelectedIndex--;
                _navigatingRegion = false;
                UpdateRegionSelectEnabled();
                e.Handled = true;
                break;
            case Key.Enter:
                if (RegionList.SelectedItem is string country)
                    ApplyCountry(country);
                else if (RegionList.Items.Count == 1 && RegionList.Items[0] is string only)
                    ApplyCountry(only);
                e.Handled = true;
                break;
            case Key.Escape:
                RegionPopup.IsOpen = false;
                e.Handled = true;
                break;
        }
    }

    private void ApplyCountry(string country)
    {
        _suppressRegion = true;
        RegionBox.Text  = country;
        _suppressRegion = false;
        RegionPopup.IsOpen = false;
        RegionList.SelectedItem = null;
        RegionBox.CaretIndex    = RegionBox.Text.Length;
        UpdateRegionSelectEnabled();
    }

    private void UpdateRegionSelectEnabled()
    {
        if (_navigatingRegion) return;
        RegionSelectBtn.IsEnabled = RegionList.SelectedItem is string
                                    || (RegionList.Items.Count == 1 && RegionList.Items[0] is string);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static ListBoxItem? FindListBoxItem(ListBox list, DependencyObject? source)
    {
        while (source != null)
        {
            if (source is ListBoxItem lbi)
                return lbi;
            source = VisualTreeHelper.GetParent(source);
        }
        return null;
    }

    private static bool IsPopupFocusWithin(Popup popup)
    {
        if (!popup.IsOpen || popup.Child is not UIElement child)
            return false;
        return child.IsKeyboardFocusWithin || popup.IsMouseOver;
    }

    // ── Add / Cancel / Title bar ──────────────────────────────────────────

    private void Add_Click(object sender, RoutedEventArgs e)
    {
        CityPopup.IsOpen   = false;
        RegionPopup.IsOpen = false;

        if (string.IsNullOrWhiteSpace(CityBox.Text))
        {
            MessageBox.Show(this, "도시 이름을 입력해 주세요.", "입력 오류",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            CityBox.Focus();
            return;
        }
        if (TzCombo.SelectedItem is not TimeZoneInfo tz)
        {
            MessageBox.Show(this, "시간대를 선택해 주세요.", "입력 오류",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            TzCombo.Focus();
            return;
        }
        Result = new WorldTimeEntry
        {
            City       = CityBox.Text.Trim(),
            Region     = RegionBox.Text.Trim(),
            TimeZoneId = tz.Id
        };
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
        => DialogResult = false;

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
            DragMove();
    }
}
