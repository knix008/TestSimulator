using System;
using System.Collections.Generic;
using System.Linq;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Analysis;

public static class NormalizationAnalyzer
{
	public static IReadOnlyList<NormalizationIssue> Analyze(DbSchema schema)
		=> AnalyzeLevel(schema, NormalizationLevel.BCNF);

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
