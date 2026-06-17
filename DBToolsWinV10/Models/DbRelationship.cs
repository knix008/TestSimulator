using System;
using System.ComponentModel;

namespace DBToolsWinV10.Models;

public class DbRelationship
{
	[Browsable(false)]
	public Guid Id { get; set; } = Guid.NewGuid();

	[Category("일반")]
	[Description("관계 이름 (선택사항)")]
	[DisplayName("이름")]
	public string Name { get; set; } = string.Empty;

	[Category("일반")]
	[Description("관계 유형")]
	[DisplayName("관계 유형")]
	public RelationshipType Type { get; set; } = RelationshipType.OneToMany;

	[Browsable(false)]
	public Guid SourceTableId { get; set; }

	[Browsable(false)]
	public Guid SourceColumnId { get; set; }

	[Browsable(false)]
	public Guid TargetTableId { get; set; }

	[Browsable(false)]
	public Guid TargetColumnId { get; set; }

	public DbRelationship Clone()
	{
		return new DbRelationship
		{
			Id = Id,
			Name = Name,
			Type = Type,
			SourceTableId = SourceTableId,
			SourceColumnId = SourceColumnId,
			TargetTableId = TargetTableId,
			TargetColumnId = TargetColumnId
		};
	}
}
