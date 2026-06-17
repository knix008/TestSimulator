namespace DBToolsWinV10.Sample;

internal static class Program
{
	public static void Main()
	{
		string outputDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."));
		Console.WriteLine($"Sample DB 파일 생성: {outputDir}");
		Console.WriteLine();
		SampleDbGenerator.GenerateAll(outputDir);
		Console.WriteLine();
		Console.WriteLine("완료.");
	}
}
