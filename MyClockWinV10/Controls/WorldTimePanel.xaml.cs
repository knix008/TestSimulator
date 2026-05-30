using System;
using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
using MyClockWinV10.Models;

namespace MyClockWinV10.Controls;

public partial class WorldTimePanel : UserControl
{
    public ObservableCollection<WorldTimeEntry> Entries { get; } = new();

    private static readonly (string City, string Region, string TzId)[] DefaultZones =
    [
        ("서울",         "대한민국",    "Korea Standard Time"),
        ("도쿄",         "일본",        "Tokyo Standard Time"),
        ("베이징",       "중국",        "China Standard Time"),
        ("싱가포르",     "싱가포르",    "Singapore Standard Time"),
        ("두바이",       "UAE",         "Arabian Standard Time"),
        ("모스크바",     "러시아",      "Russian Standard Time"),
        ("파리",         "프랑스",      "Romance Standard Time"),
        ("런던",         "영국",        "GMT Standard Time"),
        ("뉴욕",         "미국 동부",   "Eastern Standard Time"),
        ("시카고",       "미국 중부",   "Central Standard Time"),
        ("로스앤젤레스", "미국 서부",   "Pacific Standard Time"),
        ("시드니",       "호주",        "AUS Eastern Standard Time"),
        ("호놀룰루",     "미국 하와이", "Hawaiian Standard Time"),
    ];

    public WorldTimePanel()
    {
        InitializeComponent();
        foreach (var (city, region, tz) in DefaultZones)
            Entries.Add(new WorldTimeEntry { City = city, Region = region, TimeZoneId = tz });
        WorldTimeList.ItemsSource = Entries;
    }

    public void UpdateTimes(bool use24h)
    {
        var utcNow = DateTime.UtcNow;
        foreach (var entry in Entries)
        {
            try
            {
                var tz    = TimeZoneInfo.FindSystemTimeZoneById(entry.TimeZoneId);
                var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz);
                entry.LocalDateTime = local;
                entry.DisplayTime   = use24h ? local.ToString("HH:mm") : local.ToString("hh:mm tt");
            }
            catch
            {
                entry.DisplayTime = "--:--";
            }
        }
    }

    private void AddCity_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new AddWorldTimeDialog { Owner = Window.GetWindow(this) };
        if (dlg.ShowDialog() == true && dlg.Result is not null)
            Entries.Add(dlg.Result);
    }

    private void DeleteCity_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is WorldTimeEntry entry)
            Entries.Remove(entry);
    }
}
