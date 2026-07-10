using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Models;

public class DbTable
{
	[Browsable(false)]
	public Guid Id { get; set; } = Guid.NewGuid();

	[LCategory("PgCatGeneral", "일반")]
	[LDescription("PgDescTableName", "테이블 이름")]
	[LDisplayName("PgName", "이름")]
	public string Name { get; set; } = "new_table";

	[LCategory("PgCatGeneral", "일반")]
	[LDescription("PgDescTableComment", "테이블 설명")]
	[LDisplayName("PgDescription", "설명")]
	public string Comment { get; set; }

	[Browsable(false)]
	public List<DbColumn> Columns { get; set; } = new List<DbColumn>();

	[LCategory("PgCatStats", "통계")]
	[ReadOnly(true)]
	[LDescription("PgDescColumnCount", "전체 컬럼 수")]
	[LDisplayName("PgColumnCount", "컬럼 수")]
	public int ColumnCount => Columns.Count;

	[LCategory("PgCatStats", "통계")]
	[ReadOnly(true)]
	[LDescription("PgDescPkCount", "기본 키 컬럼 수")]
	[LDisplayName("PgPrimaryKeyCount", "기본 키 수")]
	public int PrimaryKeyCount => Columns.Count((DbColumn c) => c.IsPrimaryKey);

	[Browsable(false)]
	public float X { get; set; }

	[Browsable(false)]
	public float Y { get; set; }

	[Browsable(false)]
	public float Width { get; set; } = 210f;

	public DbTable Clone()
	{
		return new DbTable
		{
			Id = Id,
			Name = Name,
			Comment = Comment,
			Columns = Columns.Select((DbColumn c) => c.Clone()).ToList(),
			X = X,
			Y = Y,
			Width = Width
		};
	}
}
