using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Input;
using MyClockWinV10.Models;
using MyClockWinV10.Services;

namespace MyClockWinV10;

public partial class CalendarWindow : Window
{
    private readonly GoogleCalendarService                _service;
    private readonly ObservableCollection<CalendarEventItem> _events;

    public Action? OnConnected;
    public Action? OnDisconnected;

    public CalendarWindow(GoogleCalendarService service,
                          ObservableCollection<CalendarEventItem> events)
    {
        InitializeComponent();
        _service = service;
        _events  = events;
        EventList.ItemsSource = _events;
        RefreshUI();
    }

    // ── UI state ──────────────────────────────────────────────────────────

    private void RefreshUI()
    {
        if (_service.IsConnected)
        {
            DisconnectedPanel.Visibility = Visibility.Collapsed;
            ConnectedPanel.Visibility    = Visibility.Visible;
            EmailText.Text               = _service.ConnectedEmail;
            UpdateEmptyText();
        }
        else
        {
            DisconnectedPanel.Visibility = Visibility.Visible;
            ConnectedPanel.Visibility    = Visibility.Collapsed;
            EmptyText.Visibility         = Visibility.Collapsed;
        }
    }

    private void UpdateEmptyText()
    {
        EmptyText.Visibility = _events.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        EmptyText.Text = "14일 이내 일정이 없습니다.";
    }

    // ── Connect / Disconnect ─────────────────────────────────────────────

    private async void ConnectBtn_Click(object sender, RoutedEventArgs e)
    {
        if (!GoogleCalendarService.HasCredentialsFile())
        {
            ConnectStatusText.Text = $"파일 없음: {GoogleCalendarService.CredentialPath}";
            return;
        }

        ConnectBtn.IsEnabled   = false;
        ConnectStatusText.Text = "브라우저에서 Google 로그인 중...";

        try
        {
            await Task.Run(() => _service.ConnectAsync());
            RefreshUI();
            OnConnected?.Invoke();
            await SyncAsync();
        }
        catch (Exception ex)
        {
            ConnectStatusText.Text = $"연결 실패: {ex.Message}";
            ConnectBtn.IsEnabled   = true;
        }
    }

    private async void DisconnectBtn_Click(object sender, RoutedEventArgs e)
    {
        await _service.DisconnectAsync();
        _events.Clear();
        RefreshUI();
        OnDisconnected?.Invoke();
    }

    // ── Sync ─────────────────────────────────────────────────────────────

    private async void SyncBtn_Click(object sender, RoutedEventArgs e)
    {
        SyncBtn.IsEnabled = false;
        SyncBtn.Content   = "동기화 중...";
        await SyncAsync();
        SyncBtn.IsEnabled = true;
        SyncBtn.Content   = "동기화";
    }

    public async Task SyncAsync()
    {
        try
        {
            var items = await _service.GetUpcomingEventsAsync();
            _events.Clear();
            foreach (var ev in items) _events.Add(ev);
            LastSyncText.Text = $"마지막 동기화: {DateTime.Now:HH:mm}";
            UpdateEmptyText();
        }
        catch (Exception ex)
        {
            LastSyncText.Text = $"동기화 실패: {ex.Message}";
        }
    }

    // ── Window chrome ────────────────────────────────────────────────────

    private void Caption_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }

    private void CloseBtn_Click(object sender, RoutedEventArgs e) => Close();
}
