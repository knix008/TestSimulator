using System;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Controls;

public sealed class ColumnEventArgs(DbTable table, DbColumn column) : EventArgs
{
	public DbTable Table { get; } = table;

	public DbColumn Column { get; } = column;
}
