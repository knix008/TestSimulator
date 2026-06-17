using System;
using System.Collections.Generic;
using System.Linq;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Analysis;

public static class NormalizationAnalyzer
{
	public static IReadOnlyList<NormalizationIssue> Analyze(DbSchema schema)
	{
		List<NormalizationIssue> list = new List<NormalizationIssue>();
		foreach (DbTable table in schema.Tables)
		{
			Check1NF(table, list);
			Check2NF(table, schema, list);
			Check3NF(table, schema, list);
		}
		return list;
	}

	private static void Check1NF(DbTable table, List<NormalizationIssue> issues)
	{
		if (!table.Columns.Any((DbColumn c) => c.IsPrimaryKey))
		{
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF1,
				Severity = IssueSeverity.Error,
				Table = table.Name,
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
				Message = "반복 그룹 컬럼이 감지되었습니다: " + string.Join(", ", item),
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
				Message = $"컬럼 '{item2.Name}' ({item2.DataType})이 원자적이지 않은 값을 저장할 수 있습니다.",
				Hint = "1NF는 각 셀에 단일 원자값을 요구합니다. 별도 테이블 또는 조인 테이블을 검토하세요."
			});
		}
	}

	private static void Check2NF(DbTable table, DbSchema schema, List<NormalizationIssue> issues)
	{
		List<DbColumn> list = table.Columns.Where((DbColumn c) => c.IsPrimaryKey).ToList();
		if (list.Count >= 2)
		{
			issues.Add(new NormalizationIssue
			{
				Level = NormalizationLevel.NF2,
				Severity = IssueSeverity.Warning,
				Table = table.Name,
				Message = "복합 기본 키(" + string.Join(", ", list.Select((DbColumn c) => c.Name)) + ")가 있습니다.",
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
					Message = "컬럼 '" + item.Name + "'이 이행 종속될 가능성이 있습니다.",
					Hint = $"'{prefix}_id' → '{item.Name}' 관계가 비키 속성 간 이행 종속이면 '{prefix}' 엔티티를 별도 테이블로 분리하세요."
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
