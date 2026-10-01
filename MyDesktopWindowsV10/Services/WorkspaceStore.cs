using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Threading;
using MyDesktop.Models;

namespace MyDesktop.Services;

/// <summary>
/// Reads and writes the fence layout. Saves are coalesced so dragging a fence does not hammer the disk.
/// </summary>
public sealed class WorkspaceStore
{
    private static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MyDesktop");

    private static readonly string DataFile = Path.Combine(Folder, "fences.json");

    /// <summary>
    /// Where the fences lived while the application was called Palisades. Reading it once on the
    /// first run under the new name is what keeps a rename from looking like a wipe; the file is
    /// left where it is, so going back to an older build finds its layout intact.
    /// </summary>
    private static readonly string RenamedFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Palisades", "fences.json");

    private static readonly string LegacyFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Palisade", "workspace.json");

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly DispatcherTimer _debounce;
    private WorkspaceData? _pending;

    public WorkspaceStore()
    {
        _debounce = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromMilliseconds(600)
        };
        _debounce.Tick += (_, _) =>
        {
            _debounce.Stop();
            Flush();
        };
    }

    /// <summary>
    /// Whether <see cref="Load"/> found a layout belonging to this user. A fresh install has none,
    /// which is what tells the first run that the choices made during setup are still the only ones
    /// anybody has made.
    /// </summary>
    public bool LoadedSavedWorkspace { get; private set; }

    public WorkspaceData Load()
    {
        var workspace = ReadFile(DataFile);
        if (workspace is null)
        {
            workspace = ReadFile(RenamedFile);
            if (workspace is not null)
            {
                Diagnostics.Write($"carried the fences over from {RenamedFile}");
            }
        }

        if (workspace is null)
        {
            workspace = ImportLegacy() ?? new WorkspaceData();
        }
        else
        {
            LoadedSavedWorkspace = true;
        }

        foreach (var fence in workspace.Fences)
        {
            if (fence.ExpandedHeight < 80)
            {
                fence.ExpandedHeight = Math.Max(fence.Height, 180);
            }
        }

        return workspace;
    }

    public void ScheduleSave(WorkspaceData workspace)
    {
        _pending = workspace;
        _debounce.Stop();
        _debounce.Start();
    }

    public void Flush()
    {
        if (_pending is null)
        {
            return;
        }

        var workspace = _pending;

        try
        {
            Directory.CreateDirectory(Folder);
            var temporaryFile = DataFile + ".tmp";
            File.WriteAllText(temporaryFile, JsonSerializer.Serialize(workspace, Options));
            File.Move(temporaryFile, DataFile, true);

            // Cleared only once the file on disk really says so. Clearing it first and then failing
            // would drop the change silently, and the next thing to look at the layout would be the
            // next run of the application, reading a file that never heard about it.
            _pending = null;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Something else is holding the file — a backup agent, a scanner. The work stays pending
            // so the next save, and the one at shutdown, both try again.
            Diagnostics.Write($"save failed, will retry: {exception.Message}");
            _debounce.Stop();
            _debounce.Start();
        }
    }

    private static WorkspaceData? ReadFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                return JsonSerializer.Deserialize<WorkspaceData>(File.ReadAllText(path), Options);
            }
        }
        catch (JsonException)
        {
        }
        catch (IOException)
        {
        }

        return null;
    }

    /// <summary>Carries groups from the first single-window version over to real fences.</summary>
    private static WorkspaceData? ImportLegacy()
    {
        if (!File.Exists(LegacyFile))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(LegacyFile));
            if (!document.RootElement.TryGetProperty("Groups", out var groups) || groups.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var workspace = new WorkspaceData();
            var offset = 0;
            foreach (var group in groups.EnumerateArray())
            {
                var fence = new FenceData
                {
                    Name = group.TryGetProperty("Name", out var name) ? name.GetString() ?? "Fence" : "Fence",
                    Accent = group.TryGetProperty("Accent", out var accent) ? accent.GetString() ?? "#D9F078" : "#D9F078",
                    Left = 80 + offset * 40,
                    Top = 80 + offset * 40,
                    Width = 340,
                    Height = 280,
                    ExpandedHeight = 280
                };

                if (group.TryGetProperty("Items", out var items) && items.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        var path = item.TryGetProperty("TargetPath", out var target) ? target.GetString() : null;
                        if (!string.IsNullOrWhiteSpace(path))
                        {
                            fence.Items.Add(new FenceItem
                            {
                                Name = item.TryGetProperty("Name", out var itemName)
                                    ? itemName.GetString() ?? Path.GetFileNameWithoutExtension(path)
                                    : Path.GetFileNameWithoutExtension(path),
                                Path = path
                            });
                        }
                    }
                }

                workspace.Fences.Add(fence);
                offset++;
            }

            return workspace.Fences.Count > 0 ? workspace : null;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
    }
}
