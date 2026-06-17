using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;

namespace DBToolsWinV10.Models;

public class DbTable
{
	[Browsable(false)]
	public Guid Id { get; set; } = Guid.NewGuid();

	[Category("일반")]
	[Description("테이블 이름")]
	[DisplayName("이름")]
	public string Name { get; set; } = "new_table";

	[Category("일반")]
	[Description("테이블 설명")]
	[DisplayName("설명")]
	public string Comment { get; set; }

	[Browsable(false)]
	public List<DbColumn> Columns { get; set; } = new List<DbColumn>();

	[Category("통계")]
	[ReadOnly(true)]
	[Description("전체 컬럼 수")]
	[DisplayName("컬럼 수")]
	public int ColumnCount => Columns.Count;

	[Category("통계")]
	[ReadOnly(true)]
	[Description("기본 키 컬럼 수")]
	[DisplayName("기본 키 수")]
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
