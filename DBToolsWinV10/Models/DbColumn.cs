using System;
using System.ComponentModel;

namespace DBToolsWinV10.Models;

public class DbColumn
{
	[Browsable(false)]
	public Guid Id { get; set; } = Guid.NewGuid();

	[Category("일반")]
	[Description("컬럼 이름")]
	[DisplayName("이름")]
	public string Name { get; set; } = "column";

	[Category("일반")]
	[Description("데이터 타입")]
	[DisplayName("데이터 타입")]
	public string DataType { get; set; } = "VARCHAR";

	[Category("일반")]
	[Description("길이 (VARCHAR 등에 적용)")]
	[DisplayName("길이")]
	public int? Length { get; set; }

	[Category("일반")]
	[Description("정밀도 (DECIMAL 등에 적용)")]
	[DisplayName("정밀도")]
	public int? Precision { get; set; }

	[Category("일반")]
	[Description("스케일 (DECIMAL 등에 적용)")]
	[DisplayName("스케일")]
	public int? Scale { get; set; }

	[Category("제약조건")]
	[Description("기본 키 여부")]
	[DisplayName("기본 키")]
	public bool IsPrimaryKey { get; set; }

	[Category("제약조건")]
	[Description("자동 증가 여부 (PK에만 적용)")]
	[DisplayName("자동 증가")]
	public bool IsAutoIncrement { get; set; }

	[Category("제약조건")]
	[Description("NULL 허용 여부")]
	[DisplayName("NULL 허용")]
	public bool IsNullable { get; set; } = true;

	[Category("제약조건")]
	[Description("유니크 제약조건 여부")]
	[DisplayName("유니크")]
	public bool IsUnique { get; set; }

	[Category("제약조건")]
	[Description("외래 키 여부")]
	[DisplayName("외래 키")]
	public bool IsForeignKey { get; set; }

	[Category("제약조건")]
	[Description("기본값")]
	[DisplayName("기본값")]
	public string DefaultValue { get; set; }

	[Category("정보")]
	[Description("컬럼 설명")]
	[DisplayName("설명")]
	public string Comment { get; set; }

	public string GetTypeDisplay()
	{
		string text = DataType;
		if (Length.HasValue)
		{
			text += $"({Length})";
		}
		else if (Precision.HasValue && Scale.HasValue)
		{
			text += $"({Precision},{Scale})";
		}
		else if (Precision.HasValue)
		{
			text += $"({Precision})";
		}
		return text;
	}

	public DbColumn Clone()
	{
		return new DbColumn
		{
			Id = Id,
			Name = Name,
			DataType = DataType,
			Length = Length,
			Precision = Precision,
			Scale = Scale,
			IsPrimaryKey = IsPrimaryKey,
			IsAutoIncrement = IsAutoIncrement,
			IsNullable = IsNullable,
			IsUnique = IsUnique,
			IsForeignKey = IsForeignKey,
			DefaultValue = DefaultValue,
			Comment = Comment
		};
	}
}
