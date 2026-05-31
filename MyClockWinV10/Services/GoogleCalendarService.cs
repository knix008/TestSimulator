using System.IO;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Calendar.v3;
using Google.Apis.Calendar.v3.Data;
using Google.Apis.Services;
using Google.Apis.Util.Store;
using MyClockWinV10.Models;

namespace MyClockWinV10.Services;

public class GoogleCalendarService
{
    private static readonly string[] Scopes = [CalendarService.Scope.CalendarReadonly];

    private static readonly string AppDataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MyClock");

    public static readonly string CredentialPath = Path.Combine(AppDataDir, "google_credentials.json");
    private static readonly string TokenDir  = Path.Combine(AppDataDir, "google_token");
    private static readonly string TokenFile = Path.Combine(TokenDir,
        "Google.Apis.Auth.OAuth2.Responses.TokenResponse-user");

    private CalendarService? _service;

    public bool   IsConnected    => _service != null;
    public string ConnectedEmail { get; private set; } = "";

    // ── Auth ─────────────────────────────────────────────────────────────

    public async Task ConnectAsync()
    {
        Directory.CreateDirectory(AppDataDir);
        await using var stream = new FileStream(CredentialPath, FileMode.Open, FileAccess.Read);

        var credential = await GoogleWebAuthorizationBroker.AuthorizeAsync(
            GoogleClientSecrets.FromStream(stream).Secrets,
            Scopes, "user", CancellationToken.None,
            new FileDataStore(TokenDir, true));

        _service = new CalendarService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName       = "MyClock"
        });

        try
        {
            var list = await _service.CalendarList.List().ExecuteAsync();
            ConnectedEmail = list.Items?.FirstOrDefault(c => c.Primary == true)?.Summary ?? "연결됨";
        }
        catch { ConnectedEmail = "연결됨"; }
    }

    public Task DisconnectAsync()
    {
        if (Directory.Exists(TokenDir)) Directory.Delete(TokenDir, recursive: true);
        _service       = null;
        ConnectedEmail = "";
        return Task.CompletedTask;
    }

    // ── Event fetch ───────────────────────────────────────────────────────

    public async Task<List<CalendarEventItem>> GetUpcomingEventsAsync(int daysAhead = 14)
    {
        if (_service == null) return [];

        // Fetch default reminders from the primary calendar
        List<int> defaultReminders = [];
        try
        {
            var cal = await _service.CalendarList.Get("primary").ExecuteAsync();
            defaultReminders = cal.DefaultReminders?
                .Where(r => r.Minutes.HasValue)
                .Select(r => r.Minutes!.Value)
                .ToList() ?? [];
        }
        catch { }

        var req = _service.Events.List("primary");
        req.TimeMinDateTimeOffset = DateTimeOffset.Now;
        req.TimeMaxDateTimeOffset = DateTimeOffset.Now.AddDays(daysAhead);
        req.ShowDeleted  = false;
        req.SingleEvents = true;
        req.OrderBy      = EventsResource.ListRequest.OrderByEnum.StartTime;
        req.MaxResults   = 250;

        var response = await req.ExecuteAsync();
        var result   = new List<CalendarEventItem>();

        foreach (var ev in response.Items ?? [])
        {
            if (string.IsNullOrEmpty(ev.Summary)) continue;

            bool     isAllDay = ev.Start?.Date != null;
            DateTime start    = isAllDay
                ? DateTime.Parse(ev.Start!.Date)
                : (ev.Start?.DateTimeDateTimeOffset?.LocalDateTime ?? DateTime.MinValue);

            var item = new CalendarEventItem
            {
                Id       = ev.Id ?? Guid.NewGuid().ToString(),
                Title    = ev.Summary,
                Start    = start,
                IsAllDay = isAllDay,
                Location = ev.Location ?? ""
            };

            bool useDefault = ev.Reminders?.UseDefault ?? true;
            item.ReminderMinutes = useDefault
                ? new List<int>(defaultReminders)
                : (ev.Reminders?.Overrides?
                    .Where(r => r.Minutes.HasValue)
                    .Select(r => r.Minutes!.Value)
                    .ToList() ?? []);

            result.Add(item);
        }

        return result;
    }

    // ── Static helpers ────────────────────────────────────────────────────

    public static bool HasCredentialsFile() => File.Exists(CredentialPath);
    public static bool HasStoredToken()     => File.Exists(TokenFile);
}
