using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using MyClockWinV10.Models;

namespace MyClockWinV10.Services;

public static class CalendarEventStore
{
    private static readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MyClock", "calendar.json");

    public static List<CalendarEvent> Load()
    {
        try
        {
            if (!File.Exists(_path)) return [];
            return JsonSerializer.Deserialize<List<CalendarEvent>>(
                File.ReadAllText(_path)) ?? [];
        }
        catch { return []; }
    }

    public static void Save(List<CalendarEvent> events)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(events,
                new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }
}
