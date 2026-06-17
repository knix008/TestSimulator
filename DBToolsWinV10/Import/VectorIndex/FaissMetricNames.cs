namespace DBToolsWinV10.Import.VectorIndex;

internal static class FaissMetricNames
{
	public static string FromInt(int metricType)
	{
		return metricType switch
		{
			0 => "L2",
			1 => "InnerProduct",
			20 => "L1",
			21 => "Linf",
			22 => "Lp",
			23 => "Canberra",
			24 => "BrayCurtis",
			25 => "JensenShannon",
			26 => "Jaccard",
			27 => "Mahalanobis",
			28 => "Hamming",
			_ => $"Metric({metricType})"
		};
	}
}
