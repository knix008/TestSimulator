using System;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Import;

public static class SchemaLayout
{
	public static void AutoArrange(DbSchema schema)
	{
		int count = schema.Tables.Count;
		if (count != 0)
		{
			int num = Math.Max(1, (int)Math.Ceiling(Math.Sqrt(count)));
			for (int i = 0; i < count; i++)
			{
				DbTable dbTable = schema.Tables[i];
				int num2 = i / num;
				int num3 = i % num;
				dbTable.X = 40f + (float)num3 * 280f;
				dbTable.Y = 60f + (float)num2 * 220f;
			}
		}
	}
}
