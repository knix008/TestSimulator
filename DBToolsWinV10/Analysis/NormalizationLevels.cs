using System;

namespace DBToolsWinV10.Analysis;

[Flags]
public enum NormalizationLevels
{
	None = 0,
	NF1 = 1 << 0,
	NF2 = 1 << 1,
	NF3 = 1 << 2,
	BCNF = 1 << 3,
	NF4 = 1 << 4,
	NF5 = 1 << 5,
	All = NF1 | NF2 | NF3 | BCNF | NF4 | NF5,
}
