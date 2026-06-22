namespace ReqTrace.Importing;

public readonly record struct ImportProgressReport(int Percent, string Step, string? Detail = null);
