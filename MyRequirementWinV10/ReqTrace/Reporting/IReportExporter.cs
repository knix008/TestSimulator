namespace ReqTrace.Reporting;

public interface IReportExporter
{
    string DefaultFileExtension { get; }
    void Export(TraceabilityReportData data, string outputFilePath);
}
