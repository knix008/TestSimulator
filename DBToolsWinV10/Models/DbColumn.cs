using System;
using System.ComponentModel;
using DBToolsWinV10.App;

namespace DBToolsWinV10.Models;

public class DbColumn
{
	[Browsable(false)]
	public Guid Id { get; set; } = Guid.NewGuid();

	[LCategory("PgCatGeneral", "일반")]
	[LDescription("PgDescColName", "컬럼 이름")]
	[LDisplayName("PgName", "이름")]
	public string Name { get; set; } = "column";

	[LCategory("PgCatGeneral", "일반")]
	[LDescription("PgDescDataType", "데이터 타입")]
	[LDisplayName("PgDataType", "데이터 타입")]
	public string DataType { get; set; } = "VARCHAR";

	[LCategory("PgCatGeneral", "일반")]
	[LDescription("PgDescLength", "길이 (VARCHAR 등에 적용)")]
	[LDisplayName("PgLength", "길이")]
	public int? Length { get; set; }

	[LCategory("PgCatGeneral", "일반")]
	[LDescription("PgDescPrecision", "정밀도 (DECIMAL 등에 적용)")]
	[LDisplayName("PgPrecision", "정밀도")]
	public int? Precision { get; set; }

	[LCategory("PgCatGeneral", "일반")]
	[LDescription("PgDescScale", "스케일 (DECIMAL 등에 적용)")]
	[LDisplayName("PgScale", "스케일")]
	public int? Scale { get; set; }

	[LCategory("PgCatConstraints", "제약조건")]
	[LDescription("PgDescIsPK", "기본 키 여부")]
	[LDisplayName("PgPrimaryKey", "기본 키")]
	public bool IsPrimaryKey { get; set; }

	[LCategory("PgCatConstraints", "제약조건")]
	[LDescription("PgDescIsAI", "자동 증가 여부 (PK에만 적용)")]
	[LDisplayName("PgAutoIncrement", "자동 증가")]
	public bool IsAutoIncrement { get; set; }

	[LCategory("PgCatConstraints", "제약조건")]
	[LDescription("PgDescIsNull", "NULL 허용 여부")]
	[LDisplayName("PgAllowNull", "NULL 허용")]
	public bool IsNullable { get; set; } = true;

	[LCategory("PgCatConstraints", "제약조건")]
	[LDescription("PgDescIsUnique", "유니크 제약조건 여부")]
	[LDisplayName("PgUnique", "유니크")]
	public bool IsUnique { get; set; }

	[LCategory("PgCatConstraints", "제약조건")]
	[LDescription("PgDescIsFK", "외래 키 여부")]
	[LDisplayName("PgForeignKey", "외래 키")]
	public bool IsForeignKey { get; set; }

	[LCategory("PgCatConstraints", "제약조건")]
	[LDescription("PgDescDefault", "기본값")]
	[LDisplayName("PgDefaultValue", "기본값")]
	public string DefaultValue { get; set; }

	[LCategory("PgCatInfo", "정보")]
	[LDescription("PgDescColComment", "컬럼 설명")]
	[LDisplayName("PgDescription", "설명")]
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
