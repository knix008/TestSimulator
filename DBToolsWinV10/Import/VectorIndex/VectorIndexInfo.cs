using System.Collections.Generic;

namespace DBToolsWinV10.Import.VectorIndex;

public sealed class VectorIndexInfo
{
	public string Engine { get; set; }

	public string IndexType { get; set; }

	public string Metric { get; set; }

	public int Dimension { get; set; }

	public long VectorCount { get; set; }

	public long FileSizeBytes { get; set; }

	public IReadOnlyList<VectorIndexComponent> Components { get; set; } = new List<VectorIndexComponent>();

	public IReadOnlyDictionary<string, string> Properties { get; set; } = new Dictionary<string, string>();
}

public sealed class VectorIndexComponent
{
	public string Name { get; set; }

	public string IndexType { get; set; }

	public int Dimension { get; set; }

	public long VectorCount { get; set; }

	public string Metric { get; set; }
}
