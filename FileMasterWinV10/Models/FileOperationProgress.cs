namespace FileMasterWinV10.Models;

public readonly struct FileOperationProgress
{
    public string CurrentPath { get; init; }
    public int Completed { get; init; }
    public int Total { get; init; }

    public int Percent => Total > 0 ? (int)(Completed * 100L / Total) : 0;

    public string CountText => Total > 0 ? $"{Completed} / {Total}" : $"{Completed}";
}
