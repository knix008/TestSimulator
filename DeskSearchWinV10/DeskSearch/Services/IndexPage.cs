using DeskSearch.Models;

namespace DeskSearch.Services;

public readonly record struct IndexPage(IReadOnlyList<FileEntry> Entries, long LastId);
