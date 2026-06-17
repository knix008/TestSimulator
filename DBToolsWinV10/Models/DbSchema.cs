using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;

namespace DBToolsWinV10.Models;

public class DbSchema
{
	[Category("일반")]
	[Description("스키마(데이터베이스) 이름")]
	[DisplayName("이름")]
	public string Name { get; set; } = "새 스키마";

	[Category("일반")]
	[Description("대상 데이터베이스 종류")]
	[DisplayName("데이터베이스 종류")]
	public DbTargetType TargetDb { get; set; } = DbTargetType.SQLite;

	[Browsable(false)]
	public List<DbTable> Tables { get; set; } = new List<DbTable>();

	[Browsable(false)]
	public List<DbRelationship> Relationships { get; set; } = new List<DbRelationship>();

	public DbTable FindTable(Guid id)
	{
		return Tables.FirstOrDefault((DbTable t) => t.Id == id);
	}

	public DbColumn FindColumn(Guid tableId, Guid columnId)
	{
		return FindTable(tableId)?.Columns.FirstOrDefault((DbColumn c) => c.Id == columnId);
	}

	public bool RemoveColumn(Guid tableId, Guid columnId)
	{
		DbTable dbTable = FindTable(tableId);
		if (dbTable == null)
		{
			return false;
		}
		if (dbTable.Columns.RemoveAll((DbColumn c) => c.Id == columnId) == 0)
		{
			return false;
		}
		Relationships.RemoveAll((DbRelationship r) => r.SourceColumnId == columnId || r.TargetColumnId == columnId);
		return true;
	}

	public DbSchema Clone()
	{
		return new DbSchema
		{
			Name = Name,
			TargetDb = TargetDb,
			Tables = Tables.Select((DbTable t) => t.Clone()).ToList(),
			Relationships = Relationships.Select((DbRelationship r) => r.Clone()).ToList()
		};
	}
}
