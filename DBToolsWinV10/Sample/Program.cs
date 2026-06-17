namespace DBToolsWinV10.Sample;

internal static class Program
{
	public static void Main()
	{
		string outputDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Template"));

		Console.WriteLine($"Template DB 파일 생성: {outputDir}");
		Console.WriteLine();

		SampleGenerationResult result = SampleDbGenerator.GenerateAll(outputDir);
		foreach (string file in result.CreatedFiles)
			Console.WriteLine($"  - {file}");

		Console.WriteLine();
		Console.WriteLine(result.Message);
	}
}
