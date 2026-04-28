using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Globalization;
using System.Windows.Threading;
using System.Windows.Input;
using Microsoft.Win32;
using MeetingMinute.App.Models;
using MeetingMinute.App.Services;

namespace MeetingMinute.App;

public partial class MainWindow : Window
{
    private static bool IsDesignMode =>
        DesignerProperties.GetIsInDesignMode(new DependencyObject()) ||
        LicenseManager.UsageMode == LicenseUsageMode.Designtime;

    private enum UiLanguage
    {
        Ko,
        En
    }

    private sealed class UiPreferences
    {
        public string Language { get; set; } = "ko";
    }

    private static readonly Dictionary<string, string> Ko = new()
    {
        ["window.title"] = "회의록 — Meeting Minute",
        ["menu.settings"] = "언어 설정",
        ["menu.language.ko"] = "한국어",
        ["menu.language.en"] = "English",
        ["app.title"] = "회의록",
        ["button.new"] = "새 문서",
        ["button.open"] = "열기…",
        ["button.save"] = "저장",
        ["button.saveas"] = "다른 이름으로 저장…",
        ["tab.write"] = "작성",
        ["label.title"] = "회의 제목",
        ["label.date"] = "일시",
        ["label.timerange"] = "시작 / 종료 시간",
        ["label.location"] = "장소 / 온라인 링크",
        ["label.author"] = "작성자",
        ["label.attendees"] = "참석자 (한 줄에 한 명, 또는 쉼표 구분)",
        ["label.agenda"] = "안건 및 논의",
        ["label.decisions"] = "결정 사항",
        ["label.actions"] = "액션 아이템 (담당 / 내용 / 기한 형식 권장)",
        ["label.next"] = "차기 회의",
        ["label.notes"] = "기타 메모",
        ["hint.markdown"] = "파일로 저장되는 Markdown 미리보기입니다. 필요하면 직접 수정할 수 있으며 저장 시 그대로 반영됩니다.",
        ["hint.path.none"] = "저장 위치가 없습니다. Markdown(.md) 또는 Word(.docx)로 저장됩니다.",
        ["dialog.open.title"] = "회의록 열기",
        ["dialog.save.title"] = "회의록 저장",
        ["dialog.open.failed"] = "파일을 열 수 없습니다.",
        ["dialog.save.failed"] = "저장하지 못했습니다.",
        ["dialog.discard"] = "현재 내용을 버리고 새로 시작하시겠습니까?",
        ["dialog.save.success"] = "파일 저장이 완료되었습니다.",
        ["status.unknown"] = "회의 시간 상태를 계산 중입니다.",
        ["status.notset"] = "회의 시간이 설정되지 않았습니다.",
        ["status.invalid"] = "시작 시간 형식이 올바르지 않습니다. (예: 14:00)",
        ["status.endsinvalid"] = "종료 시간 형식이 올바르지 않습니다. (예: 15:00)",
        ["status.before"] = "회의 시작까지 {0} 남음",
        ["status.running"] = "회의 진행 중 · 경과 {0}",
        ["status.running.remaining"] = "회의 진행 중 · 경과 {0} / 남은 {1}",
        ["status.ended"] = "회의 종료 · 총 {0} 진행 (종료 후 {1})",
        ["dialog.confirm"] = "확인",
        ["dialog.error"] = "오류",
        ["dialog.done"] = "완료"
    };

    private static readonly Dictionary<string, string> En = new()
    {
        ["window.title"] = "Meeting Minute",
        ["menu.settings"] = "Language Settings",
        ["menu.language.ko"] = "Korean",
        ["menu.language.en"] = "English",
        ["app.title"] = "Meeting Minutes",
        ["button.new"] = "New",
        ["button.open"] = "Open…",
        ["button.save"] = "Save",
        ["button.saveas"] = "Save As…",
        ["tab.write"] = "Write",
        ["label.title"] = "Title",
        ["label.date"] = "Date",
        ["label.timerange"] = "Start / End Time",
        ["label.location"] = "Location / Online Link",
        ["label.author"] = "Author",
        ["label.attendees"] = "Attendees (one per line or comma-separated)",
        ["label.agenda"] = "Agenda & Discussion",
        ["label.decisions"] = "Decisions",
        ["label.actions"] = "Action Items (Owner / Task / Due Date)",
        ["label.next"] = "Next Meeting",
        ["label.notes"] = "Notes",
        ["hint.markdown"] = "This is a Markdown preview to be saved. You can edit it directly, and it will be saved as-is.",
        ["hint.path.none"] = "No save path selected. File will be saved as Markdown (.md) or Word (.docx).",
        ["dialog.open.title"] = "Open Meeting Minutes",
        ["dialog.save.title"] = "Save Meeting Minutes",
        ["dialog.open.failed"] = "Unable to open file.",
        ["dialog.save.failed"] = "Unable to save file.",
        ["dialog.discard"] = "Discard current content and start a new document?",
        ["dialog.save.success"] = "File has been saved successfully.",
        ["status.unknown"] = "Calculating meeting time status...",
        ["status.notset"] = "Meeting time is not set.",
        ["status.invalid"] = "Invalid start time format. (e.g. 14:00)",
        ["status.endsinvalid"] = "Invalid end time format. (e.g. 15:00)",
        ["status.before"] = "Starts in {0}",
        ["status.running"] = "In progress · elapsed {0}",
        ["status.running.remaining"] = "In progress · elapsed {0} / remaining {1}",
        ["status.ended"] = "Ended · total {0} (ended {1} ago)",
        ["dialog.confirm"] = "Confirm",
        ["dialog.error"] = "Error",
        ["dialog.done"] = "Done"
    };

    private string? _currentPath;
    private bool _suppressMdEvents;
    private bool _markdownDirty;
    private UiLanguage _language = UiLanguage.Ko;
    private readonly DispatcherTimer _statusTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private bool _isTimeTextInternalChange;

    public MainWindow()
    {
        InitializeComponent();

        if (IsDesignMode)
            return;

        Loaded += (_, _) =>
        {
            LoadLanguagePreference();
            ApplyLanguageToUi();
            MainTabs.SelectedIndex = 0;
            SetDefaultDateTimeIfEmpty();
            _statusTimer.Tick += (_, _) => UpdateElapsedStatus();
            _statusTimer.Start();
            UpdateElapsedStatus();
        };
    }

    private void SetDefaultDateTimeIfEmpty()
    {
        if (FldDate.SelectedDate is null)
            FldDate.SelectedDate = DateTime.Today;
        if (string.IsNullOrWhiteSpace(FldStartTime.Text))
            FldStartTime.Text = DateTime.Now.ToString("HH:mm", CultureInfo.CurrentCulture);
        if (string.IsNullOrWhiteSpace(FldEndTime.Text))
            FldEndTime.Text = DateTime.Now.AddHours(1).ToString("HH:mm", CultureInfo.CurrentCulture);
    }

    private MeetingMinuteDocument PullDocumentFromUi()
    {
        return new MeetingMinuteDocument
        {
            Title = FldTitle.Text,
            DateTimeText = BuildDateTimeText(),
            Location = FldLocation.Text,
            Author = FldAuthor.Text,
            Attendees = FldAttendees.Text,
            AgendaAndDiscussion = FldAgenda.Text,
            Decisions = FldDecisions.Text,
            ActionItems = FldActions.Text,
            NextMeeting = FldNext.Text,
            Notes = FldNotes.Text
        };
    }

    private void PushDocumentToUi(MeetingMinuteDocument doc)
    {
        FldTitle.Text = doc.Title;
        ApplyDateTimeText(doc.DateTimeText);
        FldLocation.Text = doc.Location;
        FldAuthor.Text = doc.Author;
        FldAttendees.Text = doc.Attendees;
        FldAgenda.Text = doc.AgendaAndDiscussion;
        FldDecisions.Text = doc.Decisions;
        FldActions.Text = doc.ActionItems;
        FldNext.Text = doc.NextMeeting;
        FldNotes.Text = doc.Notes;
    }

    private string GetMarkdownForSave()
    {
        if (_markdownDirty && MainTabs.SelectedIndex == 1)
            return FldMarkdown.Text;
        return MarkdownMeetingSerializer.ToMarkdown(PullDocumentFromUi());
    }

    private void RefreshMarkdownFromForm()
    {
        _suppressMdEvents = true;
        try
        {
            FldMarkdown.Text = MarkdownMeetingSerializer.ToMarkdown(PullDocumentFromUi());
            _markdownDirty = false;
        }
        finally
        {
            _suppressMdEvents = false;
        }
    }

    private void BtnNew_Click(object sender, RoutedEventArgs e)
    {
        if (!ConfirmDiscard())
            return;

        _currentPath = null;
        PushDocumentToUi(new MeetingMinuteDocument());
        SetDefaultDateTimeIfEmpty();
        RefreshMarkdownFromForm();
    }

    private void BtnOpen_Click(object sender, RoutedEventArgs e)
    {
        if (!ConfirmDiscard())
            return;

        var dlg = new OpenFileDialog
        {
            Filter = _language == UiLanguage.En ? "Markdown (*.md)|*.md|All files (*.*)|*.*" : "Markdown (*.md)|*.md|모든 파일 (*.*)|*.*",
            Title = T("dialog.open.title")
        };

        if (dlg.ShowDialog(this) != true)
            return;

        try
        {
            var text = File.ReadAllText(dlg.FileName, Encoding.UTF8);
            var doc = MarkdownMeetingSerializer.FromMarkdown(text);
            _currentPath = dlg.FileName;
            PushDocumentToUi(doc);
            _suppressMdEvents = true;
            try
            {
                FldMarkdown.Text = text;
                _markdownDirty = false;
            }
            finally
            {
                _suppressMdEvents = false;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"{T("dialog.open.failed")}\n{ex.Message}", T("dialog.error"), MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_currentPath))
        {
            SaveAsInternal();
            return;
        }

        SaveToPath(_currentPath);
    }

    private void BtnSaveAs_Click(object sender, RoutedEventArgs e)
    {
        SaveAsInternal();
    }

    private void SaveAsInternal()
    {
        var dlg = new SaveFileDialog
        {
            Filter = _language == UiLanguage.En
                ? "Markdown (*.md)|*.md|Word Document (*.docx)|*.docx|All files (*.*)|*.*"
                : "Markdown (*.md)|*.md|Word 문서 (*.docx)|*.docx|모든 파일 (*.*)|*.*",
            DefaultExt = ".md",
            Title = T("dialog.save.title"),
            FileName = BuildDefaultFileName()
        };

        if (dlg.ShowDialog(this) != true)
            return;

            if (SaveToPath(dlg.FileName))
            _currentPath = dlg.FileName;

    }

    private string BuildDefaultFileName()
    {
        var date = FldDate.SelectedDate ?? DateTime.Now;
        var timeText = FldStartTime.Text.Trim();

        if (!TimeSpan.TryParse(timeText, CultureInfo.CurrentCulture, out var parsedTime)
            && !TimeSpan.TryParse(timeText, CultureInfo.InvariantCulture, out parsedTime))
        {
            parsedTime = DateTime.Now.TimeOfDay;
        }

        var stamp = $"{date:yyyy-MM-dd}-{parsedTime:hh\\-mm}";
        return $"회의록-{stamp}";
    }

    private static string SanitizeFileName(string title)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = title.Trim().Select(c => invalid.Contains(c) ? '_' : c).ToArray();
        var name = new string(chars);
        return string.IsNullOrWhiteSpace(name) ? "회의록" : name;
    }

    private bool SaveToPath(string path)
    {
        try
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext == ".docx")
            {
                WordMeetingSerializer.SaveAsDocx(path, PullDocumentFromUi());
            }
            else
            {
                var md = GetMarkdownForSave();
                File.WriteAllText(path, md, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            }

            _markdownDirty = false;
            MessageBox.Show(this, $"{T("dialog.save.success")}\n{path}", T("dialog.done"), MessageBoxButton.OK, MessageBoxImage.Information);
            return true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"{T("dialog.save.failed")}\n{ex.Message}", T("dialog.error"), MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    private bool ConfirmDiscard()
    {
        var doc = PullDocumentFromUi();
        if (!_markdownDirty && IsDocumentVisuallyEmpty(doc))
            return true;

        var r = MessageBox.Show(this, T("dialog.discard"), T("dialog.confirm"),
            MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
        return r == MessageBoxResult.Yes;
    }

    private static bool IsDocumentVisuallyEmpty(MeetingMinuteDocument doc)
    {
        return string.IsNullOrWhiteSpace(doc.Title)
               && string.IsNullOrWhiteSpace(doc.DateTimeText)
               && string.IsNullOrWhiteSpace(doc.Location)
               && string.IsNullOrWhiteSpace(doc.Author)
               && string.IsNullOrWhiteSpace(doc.Attendees)
               && string.IsNullOrWhiteSpace(doc.AgendaAndDiscussion)
               && string.IsNullOrWhiteSpace(doc.Decisions)
               && string.IsNullOrWhiteSpace(doc.ActionItems)
               && string.IsNullOrWhiteSpace(doc.NextMeeting)
               && string.IsNullOrWhiteSpace(doc.Notes);
    }

    private string BuildDateTimeText()
    {
        var dateText = FldDate.SelectedDate?.ToString("yyyy-MM-dd", CultureInfo.CurrentCulture) ?? "";
        var startTimeText = FldStartTime.Text.Trim();
        var endTimeText = FldEndTime.Text.Trim();
        var timeRangeText = BuildTimeRangeText(startTimeText, endTimeText);

        if (string.IsNullOrWhiteSpace(dateText))
            return timeRangeText;
        if (string.IsNullOrWhiteSpace(timeRangeText))
            return dateText;
        return $"{dateText} {timeRangeText}";
    }

    private void ApplyDateTimeText(string? text)
    {
        var raw = text?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(raw))
        {
            FldDate.SelectedDate = null;
            FldStartTime.Text = "";
            FldEndTime.Text = "";
            return;
        }

        var parts = raw.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length > 0 && DateTime.TryParse(parts[0], CultureInfo.CurrentCulture, DateTimeStyles.None, out var parsedDate))
        {
            FldDate.SelectedDate = parsedDate.Date;
            ApplyTimeRangeText(parts.Length > 1 ? parts[1].Trim() : "");
            return;
        }

        if (DateTime.TryParse(raw, CultureInfo.CurrentCulture, DateTimeStyles.None, out var parsedDateTime))
        {
            FldDate.SelectedDate = parsedDateTime.Date;
            FldStartTime.Text = parsedDateTime.ToString("HH:mm", CultureInfo.CurrentCulture);
            FldEndTime.Text = parsedDateTime.AddHours(1).ToString("HH:mm", CultureInfo.CurrentCulture);
            return;
        }

        FldDate.SelectedDate = null;
        ApplyTimeRangeText(raw);
        UpdateElapsedStatus();
    }

    private void ApplyTimeRangeText(string timeRangeText)
    {
        var raw = timeRangeText.Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            FldStartTime.Text = "";
            FldEndTime.Text = "";
            return;
        }

        var normalized = raw.Replace("–", "-", StringComparison.Ordinal).Replace("—", "-", StringComparison.Ordinal);
        var tokens = normalized.Split('-', 2, StringSplitOptions.TrimEntries);
        if (tokens.Length == 2)
        {
            FldStartTime.Text = tokens[0];
            FldEndTime.Text = tokens[1];
            return;
        }

        FldStartTime.Text = raw;
        if (TimeSpan.TryParse(raw, CultureInfo.CurrentCulture, out var start)
            || TimeSpan.TryParse(raw, CultureInfo.InvariantCulture, out start))
        {
            FldEndTime.Text = start.Add(TimeSpan.FromHours(1)).ToString(@"hh\:mm", CultureInfo.InvariantCulture);
        }
        else
        {
            FldEndTime.Text = "";
        }
    }

    private static string BuildTimeRangeText(string startTimeText, string endTimeText)
    {
        var start = startTimeText.Trim();
        var end = endTimeText.Trim();

        if (string.IsNullOrWhiteSpace(start))
            return end;
        if (string.IsNullOrWhiteSpace(end))
            return start;
        return $"{start} - {end}";
    }

    private void MeetingTimeFieldChanged(object sender, RoutedEventArgs e)
    {
        if (sender is TextBox tb)
        {
            FormatTimeFieldInput(tb);

            if (ReferenceEquals(tb, FldStartTime)
                && !string.IsNullOrWhiteSpace(FldStartTime.Text)
                && TryParseTime(FldStartTime.Text, out var start))
            {
                FldEndTime.Text = start.Add(TimeSpan.FromHours(1)).ToString(@"hh\:mm", CultureInfo.InvariantCulture);
            }
        }

        UpdateElapsedStatus();
    }

    private void TimeField_PreviewTextInput(object sender, TextCompositionEventArgs e)
    {
        e.Handled = !e.Text.All(char.IsDigit);
    }

    private void TimeField_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (sender is not TextBox tb)
            return;

        if (e.Key == Key.Space)
        {
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Back && tb.SelectionLength == 0 && tb.CaretIndex == 3 && tb.Text.Length >= 3)
        {
            // Make backspace over HH:mm feel natural by deleting the minute's first digit.
            tb.CaretIndex = 2;
        }
    }

    private void TimeField_Pasting(object sender, DataObjectPastingEventArgs e)
    {
        if (sender is not TextBox tb)
            return;

        if (!e.SourceDataObject.GetDataPresent(DataFormats.Text))
        {
            e.CancelCommand();
            return;
        }

        var pasted = e.SourceDataObject.GetData(DataFormats.Text) as string ?? "";
        var digits = new string(pasted.Where(char.IsDigit).Take(4).ToArray());
        var formatted = digits.Length switch
        {
            <= 2 => digits,
            _ => $"{digits[..2]}:{digits[2..]}"
        };

        _isTimeTextInternalChange = true;
        try
        {
            tb.Text = formatted;
            tb.CaretIndex = tb.Text.Length;
        }
        finally
        {
            _isTimeTextInternalChange = false;
        }

        e.CancelCommand();
    }

    private void TimeField_LostFocus(object sender, RoutedEventArgs e)
    {
        if (sender is not TextBox tb)
            return;

        if (TryParseTime(tb.Text, out var parsed))
        {
            tb.Text = parsed.ToString(@"hh\:mm", CultureInfo.InvariantCulture);
            tb.ClearValue(BorderBrushProperty);
        }
        else if (!string.IsNullOrWhiteSpace(tb.Text))
        {
            tb.BorderBrush = (System.Windows.Media.Brush)FindResource("BrushError");
        }
        else
        {
            tb.ClearValue(BorderBrushProperty);
        }
    }

    private void FormatTimeFieldInput(TextBox tb)
    {
        if (_isTimeTextInternalChange)
            return;

        var digits = new string(tb.Text.Where(char.IsDigit).Take(4).ToArray());
        var formatted = digits.Length switch
        {
            <= 2 => digits,
            _ => $"{digits[..2]}:{digits[2..]}"
        };

        if (tb.Text == formatted)
            return;

        _isTimeTextInternalChange = true;
        try
        {
            tb.Text = formatted;
            tb.CaretIndex = tb.Text.Length;
        }
        finally
        {
            _isTimeTextInternalChange = false;
        }
    }

    private void UpdateElapsedStatus()
    {
        if (FldDate.SelectedDate is null || string.IsNullOrWhiteSpace(FldStartTime.Text))
        {
            TxtElapsedStatus.Text = T("status.notset");
            return;
        }

        if (!TryParseTime(FldStartTime.Text, out var startTime))
        {
            TxtElapsedStatus.Text = T("status.invalid");
            return;
        }

        var start = FldDate.SelectedDate.Value.Date + startTime;
        var now = DateTime.Now;

        var hasEnd = !string.IsNullOrWhiteSpace(FldEndTime.Text);
        var endTime = TimeSpan.Zero;
        var endValid = !hasEnd || TryParseTime(FldEndTime.Text, out endTime);
        var end = hasEnd && endValid ? FldDate.SelectedDate.Value.Date + endTime : DateTime.MinValue;

        if (hasEnd && !endValid)
        {
            TxtElapsedStatus.Text = T("status.endsinvalid");
            return;
        }

        if (now < start)
        {
            TxtElapsedStatus.Text = string.Format(CultureInfo.CurrentCulture, T("status.before"), FormatDuration(start - now));
            return;
        }

        if (hasEnd && endValid && now <= end)
        {
            TxtElapsedStatus.Text = string.Format(
                CultureInfo.CurrentCulture,
                T("status.running.remaining"),
                FormatDuration(now - start),
                FormatDuration(end - now));
            return;
        }

        if (hasEnd && endValid && now > end)
        {
            TxtElapsedStatus.Text = string.Format(
                CultureInfo.CurrentCulture,
                T("status.ended"),
                FormatDuration(end - start),
                FormatDuration(now - end));
            return;
        }

        TxtElapsedStatus.Text = string.Format(CultureInfo.CurrentCulture, T("status.running"), FormatDuration(now - start));
    }

    private static bool TryParseTime(string text, out TimeSpan value)
    {
        var t = text.Trim();
        if (!(TimeSpan.TryParse(t, CultureInfo.CurrentCulture, out value)
              || TimeSpan.TryParse(t, CultureInfo.InvariantCulture, out value)))
            return false;
        return value >= TimeSpan.Zero && value < TimeSpan.FromHours(24);
    }

    private static string FormatDuration(TimeSpan span)
    {
        if (span < TimeSpan.Zero)
            span = span.Negate();
        var totalHours = (int)span.TotalHours;
        return $"{totalHours:00}:{span.Minutes:00}:{span.Seconds:00}";
    }

    private void FldMarkdown_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_suppressMdEvents)
            return;
        _markdownDirty = true;
    }

    private void MainTabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (e.Source is not TabControl tc || tc != MainTabs)
            return;

        if (MainTabs.SelectedIndex == 1 && !_markdownDirty)
            RefreshMarkdownFromForm();
    }

    private string T(string key)
    {
        var src = _language == UiLanguage.Ko ? Ko : En;
        return src.TryGetValue(key, out var value) ? value : key;
    }

    private void ApplyLanguageToUi()
    {
        Title = T("window.title");
        MenuSettings.Header = T("menu.settings");
        MenuLanguageKo.Header = T("menu.language.ko");
        MenuLanguageEn.Header = T("menu.language.en");
        MenuLanguageKo.IsChecked = _language == UiLanguage.Ko;
        MenuLanguageEn.IsChecked = _language == UiLanguage.En;

        TxtAppTitle.Text = T("app.title");
        BtnNew.Content = T("button.new");
        BtnOpen.Content = T("button.open");
        BtnSave.Content = T("button.save");
        BtnSaveAs.Content = T("button.saveas");
        TabWrite.Header = T("tab.write");

        LblTitle.Text = T("label.title");
        LblDate.Text = T("label.date");
        LblTimeRange.Text = T("label.timerange");
        LblLocation.Text = T("label.location");
        LblAuthor.Text = T("label.author");
        LblAttendees.Text = T("label.attendees");
        LblAgenda.Text = T("label.agenda");
        LblDecisions.Text = T("label.decisions");
        LblActions.Text = T("label.actions");
        LblNextMeeting.Text = T("label.next");
        LblNotes.Text = T("label.notes");
        TxtMarkdownHint.Text = T("hint.markdown");
        FldDate.ToolTip = _language == UiLanguage.En ? "Select date from calendar." : "회의 날짜를 달력에서 선택하세요.";
        FldStartTime.ToolTip = _language == UiLanguage.En ? "Start time (e.g. 14:00)" : "시작 시간 (예: 14:00)";
        FldEndTime.ToolTip = _language == UiLanguage.En ? "End time (e.g. 15:00)" : "종료 시간 (예: 15:00)";

        UpdateElapsedStatus();
    }

    private void MenuLanguageKo_Click(object sender, RoutedEventArgs e)
    {
        _language = UiLanguage.Ko;
        ApplyLanguageToUi();
        SaveLanguagePreference();
    }

    private void MenuLanguageEn_Click(object sender, RoutedEventArgs e)
    {
        _language = UiLanguage.En;
        ApplyLanguageToUi();
        SaveLanguagePreference();
    }

    private static string PreferencesPath()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MeetingMinute");
        Directory.CreateDirectory(root);
        return Path.Combine(root, "preferences.json");
    }

    private void LoadLanguagePreference()
    {
        try
        {
            var path = PreferencesPath();
            if (!File.Exists(path))
                return;
            var json = File.ReadAllText(path, Encoding.UTF8);
            var pref = JsonSerializer.Deserialize<UiPreferences>(json);
            _language = string.Equals(pref?.Language, "en", StringComparison.OrdinalIgnoreCase) ? UiLanguage.En : UiLanguage.Ko;
        }
        catch
        {
            _language = UiLanguage.Ko;
        }
    }

    private void SaveLanguagePreference()
    {
        var pref = new UiPreferences { Language = _language == UiLanguage.En ? "en" : "ko" };
        var json = JsonSerializer.Serialize(pref, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(PreferencesPath(), json, Encoding.UTF8);
    }
}
