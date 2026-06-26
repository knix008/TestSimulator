using Unhwp;

string hwp = args.Length > 0 ? args[0] : Path.Combine(Path.GetTempPath(), "sample.hwp");
if (!File.Exists(hwp))
{
    Console.Error.WriteLine($"File not found: {hwp}");
    return 1;
}

using var doc = UnhwpDocument.ParseFile(hwp);
string json = doc.ToJson(compact: false);
string body = doc.ToMarkdown(new MarkdownOptions());

Console.WriteLine($"JSON length: {json.Length}");
Console.WriteLine($"Markdown length: {body.Length}");
Console.WriteLine("--- headings in markdown ---");
foreach (string line in body.Split('\n').Where(l => l.TrimStart().StartsWith('#')))
    Console.WriteLine(line);

return 0;
