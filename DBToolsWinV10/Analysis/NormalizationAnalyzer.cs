using System;
using System.Collections.Generic;
using System.Linq;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Analysis;

public static class NormalizationAnalyzer
{
	public static IReadOnlyList<NormalizationIssue> Analyze(DbSchema schema)
		=> AnalyzeLevel(schema, NormalizationLevel.NF5);

	public static IReadOnlyList<NormalizationIssue> AnalyzeLevels(DbSchema schema, NormalizationLevels levels)
	{
		if (levels == NormalizationLevels.None)
			levels = NormalizationLevels.NF1;

		List<NormalizationIssue> list = new List<NormalizationIssue>();
		foreach (DbTable table in schema.Tables)
		{
			if (levels.HasFlag(NormalizationLevels.NF1))
				Check1NF(table, list);
			if (levels.HasFlag(NormalizationLevels.NF2))
				Check2NF(table, schema, list);
			if (levels.HasFlag(NormalizationLevels.NF3))
				Check3NF(table, schema, list);
			if (levels.HasFlag(NormalizationLevels.BCNF))
				CheckBCNF(table, schema, list);
			if (levels.HasFlag(NormalizationLevels.NF4))
				Check4NF(table, schema, list);
			if (levels.HasFlag(NormalizationLevels.NF5))
				Check5NF(table, schema, list);
		}

		return list;
	}

	public static IReadOnlyList<NormalizationIssue> AnalyzeLevel(DbSchema schema, NormalizationLevel level)
	{
		List<NormalizationIssue> list = new List<NormalizationIssue>();
		foreach (DbTable table in schema.Tables)
		{
			Check1NF(table, list);
			if (level == NormalizationLevel.NF1) continue;
			Check2NF(table, schema, list);
			if (level == NormalizationLevel.NF2) continue;
			Check3NF(table, schema, list);
			if (level == NormalizationLevel.NF3) continue;
			CheckBCNF(table, schema, list);
			if (level == NormalizationLevel.BCNF) continue;
			Check4NF(table, schema, list);
			if (level == NormalizationLevel.NF4) continue;
			Check5NF(table, schema, list);
		}
		return list;
	}

	// Returns true when all issues up to the given level are non-errors
	public static bool LevelPasses(DbSchema schema, NormalizationLevel level)
	{
		var issues = AnalyzeLevel(schema, level);
		return !issues.Any(i => i.Severity == IssueSeverity.Error && NfLevelOf(i.Level) <= (int)level);
	}

	private static int NfLevelOf(NormalizationLevel l) => l switch
	{
		NormalizationLevel.NF1  => 0,
		NormalizationLevel.NF2  => 1,
		NormalizationLevel.NF3  => 2,
		NormalizationLevel.BCNF => 3,
		NormalizationLevel.NF4  => 4,
		NormalizationLevel.NF5  => 5,
		_ => 0
	};

	private static void Check1NF(DbTable table, List<NormalizationIssue> issues)
	{
		if (!table.Columns.Any((DbColumn c) => c.IsPrimaryKey))
		{
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF1,
				Severity = IssueSeverity.Error,
				Table = table.Name,
				AffectedColumns = "(테이블 전체)",
				Message = "기본 키(PK)가 없습니다.",
				Hint = "모든 테이블은 행을 유일하게 식별하는 기본 키를 가져야 합니다."
			});
		}
		List<List<string>> list = DetectRepeatingGroups(table.Columns.Select((DbColumn c) => c.Name).ToList());
		foreach (List<string> item in list)
		{
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF1,
				Severity = IssueSeverity.Warning,
				Table = table.Name,
				AffectedColumns = string.Join(", ", item),
				Message = "반복 그룹 컬럼이 감지되었습니다.",
				Hint = "반복되는 데이터는 별도 테이블로 분리하는 것이 1NF 원칙에 부합합니다."
			});
		}
		List<DbColumn> list2 = table.Columns.Where(delegate(DbColumn c)
		{
			bool flag = c.Name.EndsWith("list", StringComparison.OrdinalIgnoreCase) || c.Name.EndsWith("tags", StringComparison.OrdinalIgnoreCase) || c.Name.EndsWith("_csv", StringComparison.OrdinalIgnoreCase) || c.Name.EndsWith("_json", StringComparison.OrdinalIgnoreCase);
			bool flag2 = flag;
			if (!flag2)
			{
				bool flag3;
				switch (c.DataType.ToUpperInvariant())
				{
				case "JSON":
				case "JSONB":
				case "ARRAY":
					flag3 = true;
					break;
				default:
					flag3 = false;
					break;
				}
				flag2 = flag3;
			}
			return flag2;
		}).ToList();
		foreach (DbColumn item2 in list2)
		{
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF1,
				Severity = IssueSeverity.Info,
				Table = table.Name,
				AffectedColumns = item2.Name,
				Message = $"원자적이지 않은 값을 저장할 수 있는 타입입니다 ({item2.DataType}).",
				Hint = "1NF는 각 셀에 단일 원자값을 요구합니다. 별도 테이블 또는 조인 테이블을 검토하세요."
			});
		}
	}

	private static void Check2NF(DbTable table, DbSchema schema, List<NormalizationIssue> issues)
	{
		List<DbColumn> list = table.Columns.Where((DbColumn c) => c.IsPrimaryKey).ToList();
		if (list.Count >= 2)
		{
			string pkNames = string.Join(", ", list.Select((DbColumn c) => c.Name));
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF2,
				Severity = IssueSeverity.Warning,
				Table = table.Name,
				AffectedColumns = pkNames,
				Message = "복합 기본 키가 있습니다.",
				Hint = "비키 속성이 복합 PK의 일부에만 종속(부분 종속)되어 있는지 검토하세요. 부분 종속이 있다면 해당 속성을 별도 테이블로 분리하십시오."
			});
		}
	}

	private static void Check3NF(DbTable table, DbSchema schema, List<NormalizationIssue> issues)
	{
		HashSet<Guid> pkCols = (from c in table.Columns
			where c.IsPrimaryKey
			select c.Id).ToHashSet();
		HashSet<Guid> fkColIds = (from r in schema.Relationships
			where r.SourceTableId == table.Id
			select r.SourceColumnId).ToHashSet();
		List<DbColumn> list = (from c in table.Columns
			where !pkCols.Contains(c.Id) && !fkColIds.Contains(c.Id)
			where c.Name.EndsWith("_name", StringComparison.OrdinalIgnoreCase) || c.Name.EndsWith("_title", StringComparison.OrdinalIgnoreCase) || c.Name.EndsWith("_code", StringComparison.OrdinalIgnoreCase) || c.Name.EndsWith("_label", StringComparison.OrdinalIgnoreCase)
			select c).ToList();
		if (list.Count == 0)
		{
			return;
		}
		foreach (DbColumn item in list)
		{
			string prefix = item.Name.Substring(0, item.Name.LastIndexOf('_'));
			if (table.Columns.Any((DbColumn c) => c.Name.Equals(prefix + "_id", StringComparison.OrdinalIgnoreCase) && !pkCols.Contains(c.Id)))
			{
				issues.Add(new NormalizationIssue
				{
					Level = NormalizationLevel.NF3,
					Severity = IssueSeverity.Warning,
					Table = table.Name,
					AffectedColumns = $"{prefix}_id, {item.Name}",
					Message = "비키 속성 간 이행 종속 가능성이 있습니다.",
					Hint = $"'{prefix}_id' → '{item.Name}' 관계가 비키 속성 간 이행 종속이면 '{prefix}' 엔티티를 별도 테이블로 분리하세요."
				});
			}
		}
	}

	private static void CheckBCNF(DbTable table, DbSchema schema, List<NormalizationIssue> issues)
	{
		// BCNF: every functional dependency X→Y where X is a superkey.
		// Heuristic: any non-PK column that has _id suffix AND a corresponding _name/_code column
		// is a candidate for a non-superkey determinant.
		HashSet<Guid> pkIds = (from c in table.Columns where c.IsPrimaryKey select c.Id).ToHashSet();
		var nonPkCols = table.Columns.Where(c => !pkIds.Contains(c.Id)).ToList();

		foreach (var col in nonPkCols)
		{
			if (!col.Name.EndsWith("_id", StringComparison.OrdinalIgnoreCase)) continue;
			string prefix = col.Name[..^3]; // strip "_id"
			bool hasDependent = nonPkCols.Any(c =>
				c.Id != col.Id &&
				(c.Name.StartsWith(prefix + "_", StringComparison.OrdinalIgnoreCase) ||
				 c.Name.Equals(prefix, StringComparison.OrdinalIgnoreCase)));
			if (hasDependent)
			{
				issues.Add(new NormalizationIssue
				{
					Level    = NormalizationLevel.BCNF,
					Severity = IssueSeverity.Warning,
					Table    = table.Name,
					AffectedColumns = col.Name,
					Message  = $"비슈퍼키 결정자 가능성: '{col.Name}'이 관련 속성을 결정합니다.",
					Hint     = $"'{col.Name}' 관련 속성들을 별도의 테이블로 분리하면 BCNF를 만족할 수 있습니다."
				});
			}
		}
	}

	private static void Check4NF(DbTable table, DbSchema schema, List<NormalizationIssue> issues)
	{
		// 4NF: no non-trivial multi-valued dependencies (MVDs).
		HashSet<Guid> pkIds = table.Columns.Where(c => c.IsPrimaryKey).Select(c => c.Id).ToHashSet();
		HashSet<Guid> fkColIds = GetOutgoingForeignKeyColumnIds(table, schema);

		List<DbColumn> multiValuedCols = table.Columns
			.Where(c => !pkIds.Contains(c.Id))
			.Where(IsMultiValuedAttributeColumn)
			.ToList();
		if (multiValuedCols.Count >= 2)
		{
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF4,
				Severity = IssueSeverity.Warning,
				Table = table.Name,
				AffectedColumns = string.Join(", ", multiValuedCols.Select(c => c.Name)),
				Message = "독립적인 다중값 속성이 한 테이블에 함께 있습니다.",
				Hint = "4NF는 비자명 다중값 종속(MVD)이 없어야 합니다. 각 다중값 사실을 별도 테이블 또는 조인 테이블로 분리하세요."
			});
		}

		List<DbColumn> pkCols = table.Columns.Where(c => c.IsPrimaryKey).ToList();
		if (pkCols.Count == 2 && pkCols.All(c => fkColIds.Contains(c.Id)))
		{
			List<DbColumn> extraCols = table.Columns
				.Where(c => !pkIds.Contains(c.Id) && !fkColIds.Contains(c.Id))
				.ToList();
			if (extraCols.Count > 0)
			{
				issues.Add(new NormalizationIssue
				{
					Level = NormalizationLevel.NF4,
					Severity = IssueSeverity.Warning,
					Table = table.Name,
					AffectedColumns = string.Join(", ", extraCols.Select(c => c.Name)),
					Message = "조인 테이블에 관계 외 속성이 포함되어 있습니다.",
					Hint = "두 엔티티 간 다중값 관계만 저장해야 한다면 추가 속성을 별도 테이블로 분리해 4NF를 만족하는지 검토하세요."
				});
			}
		}

		List<DbRelationship> outgoing = schema.Relationships
			.Where(r => r.SourceTableId == table.Id)
			.ToList();
		HashSet<Guid> fkOutsidePk = outgoing
			.Where(r => !pkIds.Contains(r.SourceColumnId))
			.Select(r => r.SourceColumnId)
			.ToHashSet();
		if (pkCols.Count >= 2 && fkOutsidePk.Count >= 2)
		{
			HashSet<Guid> distinctParents = outgoing
				.Where(r => fkOutsidePk.Contains(r.SourceColumnId))
				.Select(r => r.TargetTableId)
				.ToHashSet();
			if (distinctParents.Count >= 2)
			{
				List<string> fkNames = table.Columns
					.Where(c => fkOutsidePk.Contains(c.Id))
					.Select(c => c.Name)
					.ToList();
				issues.Add(new NormalizationIssue
				{
					Level = NormalizationLevel.NF4,
					Severity = IssueSeverity.Info,
					Table = table.Name,
					AffectedColumns = string.Join(", ", fkNames),
					Message = "복합 키 테이블에 독립적인 다중값 관계가 함께 표현된 것으로 보입니다.",
					Hint = "서로 독립적인 다중값 사실은 각각 별도 조인 테이블로 분리하면 4NF에 가깝습니다."
				});
			}
		}
	}

	private static void Check5NF(DbTable table, DbSchema schema, List<NormalizationIssue> issues)
	{
		// 5NF (PJNF): no non-trivial join dependencies that are not implied by keys.
		List<DbColumn> pkCols = table.Columns.Where(c => c.IsPrimaryKey).ToList();
		HashSet<Guid> pkIds = pkCols.Select(c => c.Id).ToHashSet();
		List<DbRelationship> outgoing = schema.Relationships
			.Where(r => r.SourceTableId == table.Id)
			.ToList();

		if (pkCols.Count >= 3)
		{
			HashSet<Guid> pkParentTables = outgoing
				.Where(r => pkIds.Contains(r.SourceColumnId))
				.Select(r => r.TargetTableId)
				.ToHashSet();
			if (pkParentTables.Count >= 3)
			{
				issues.Add(new NormalizationIssue
				{
					Level = NormalizationLevel.NF5,
					Severity = IssueSeverity.Warning,
					Table = table.Name,
					AffectedColumns = string.Join(", ", pkCols.Select(c => c.Name)),
					Message = "3개 이상 엔티티를 연결하는 복합 키 테이블입니다.",
					Hint = "삼진(triadic) 사실은 조인 종속으로 분해할 수 있는지 검토하세요. 5NF를 만족하려면 조인으로 복원 가능한 테이블을 더 작은 관계로 나누는 것이 좋습니다."
				});
			}
		}

		HashSet<Guid> parentTables = outgoing.Select(r => r.TargetTableId).ToHashSet();
		if (parentTables.Count >= 3)
		{
			int fkOutsidePk = outgoing.Count(r => !pkIds.Contains(r.SourceColumnId));
			if (pkCols.Count < 3 || fkOutsidePk > 0)
			{
				List<string> fkNames = outgoing
					.Select(r => table.Columns.FirstOrDefault(c => c.Id == r.SourceColumnId)?.Name)
					.Where(name => !string.IsNullOrEmpty(name))
					.Distinct(StringComparer.OrdinalIgnoreCase)
					.ToList();
				issues.Add(new NormalizationIssue
				{
					Level = NormalizationLevel.NF5,
					Severity = IssueSeverity.Info,
					Table = table.Name,
					AffectedColumns = string.Join(", ", fkNames),
					Message = "3개 이상의 엔티티를 한 테이블에서 동시에 참조합니다.",
					Hint = "이 테이블이 여러 이진 관계의 조인으로 복원 가능하다면, 5NF 관점에서 관계를 분해하는 설계를 검토하세요."
				});
			}
		}

		bool hasManyToMany = outgoing.Any(r => r.Type == RelationshipType.ManyToMany)
			|| schema.Relationships.Any(r => r.Type == RelationshipType.ManyToMany &&
				(r.SourceTableId == table.Id || r.TargetTableId == table.Id));
		if (hasManyToMany && table.Columns.Count(c => !pkIds.Contains(c.Id)) >= 3)
		{
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF5,
				Severity = IssueSeverity.Info,
				Table = table.Name,
				AffectedColumns = "(테이블 전체)",
				Message = "다대다 관계 주변에 복합 사실이 한 테이블에 모여 있을 수 있습니다.",
				Hint = "N:M 관계와 부가 속성이 결합·조인 종속을 만들지 않는지 확인하고, 필요하면 중간 테이블을 더 분해하세요."
			});
		}
	}

	private static HashSet<Guid> GetOutgoingForeignKeyColumnIds(DbTable table, DbSchema schema) =>
		schema.Relationships
			.Where(r => r.SourceTableId == table.Id)
			.Select(r => r.SourceColumnId)
			.ToHashSet();

	private static bool IsMultiValuedAttributeColumn(DbColumn col)
	{
		if (col.Name.EndsWith("_list", StringComparison.OrdinalIgnoreCase)
			|| col.Name.EndsWith("_tags", StringComparison.OrdinalIgnoreCase)
			|| col.Name.EndsWith("_skills", StringComparison.OrdinalIgnoreCase)
			|| col.Name.EndsWith("_items", StringComparison.OrdinalIgnoreCase)
			|| col.Name.EndsWith("_hobbies", StringComparison.OrdinalIgnoreCase)
			|| col.Name.EndsWith("_categories", StringComparison.OrdinalIgnoreCase)
			|| col.Name.EndsWith("_options", StringComparison.OrdinalIgnoreCase))
		{
			return true;
		}

		return col.DataType.ToUpperInvariant() switch
		{
			"JSON" or "JSONB" or "ARRAY" => true,
			_ => false
		};
	}

	private static List<List<string>> DetectRepeatingGroups(List<string> names)
	{
		List<List<string>> list = new List<List<string>>();
		HashSet<string> hashSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		foreach (string name in names)
		{
			if (hashSet.Contains(name))
			{
				continue;
			}
			int num = name.Length - 1;
			while (num >= 0 && char.IsDigit(name[num]))
			{
				num--;
			}
			if (num == name.Length - 1)
			{
				continue;
			}
			string prefix = name.Substring(0, num + 1);
			List<string> list2 = names.Where((string n) => n.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && n.Length > prefix.Length && n.Substring(prefix.Length).All(char.IsDigit)).ToList();
			if (list2.Count < 2)
			{
				continue;
			}
			list.Add(list2);
			foreach (string item in list2)
			{
				hashSet.Add(item);
			}
		}
		return list;
	}
}
