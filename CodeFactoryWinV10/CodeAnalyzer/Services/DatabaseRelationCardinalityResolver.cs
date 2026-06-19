using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>FK 관계의 카디널리티(1:1, 1:N, N:M)를 테이블 PK/FK 구성으로부터 추정합니다.</summary>
public static class DatabaseRelationCardinalityResolver
{
    /// <summary>크로우 풋(까마귀 발) 표기에서 자식(From) 쪽이 "많음"인지. FK 컬럼이 자식 테이블의 단일 PK일 때만 1:1이라 false.</summary>
    public static bool IsChildMany(DatabaseSchemaResult schema, DatabaseRelation relation) =>
        !IsOneToOne(schema, relation);

    /// <summary>부모(To) 쪽은 FK가 가리키는 고유 키이므로 항상 "하나".</summary>
    public static bool IsParentMany(DatabaseSchemaResult schema, DatabaseRelation relation) => false;

    /// <summary>가운데 라벨로 표시할 카디널리티 문자열(예: 1:N, N:M).</summary>
    public static string GetCardinalityLabel(DatabaseSchemaResult schema, DatabaseRelation relation)
    {
        if (IsOneToOne(schema, relation))
        {
            return "1:1";
        }

        return IsJunctionRelation(schema, relation) ? "N:M" : "1:N";
    }

    private static bool IsOneToOne(DatabaseSchemaResult schema, DatabaseRelation relation)
    {
        if (string.IsNullOrWhiteSpace(relation.FromColumn))
        {
            return false;
        }

        if (!schema.TableMap.TryGetValue(relation.FromTableId, out var fromTable))
        {
            return false;
        }

        var primaryKeyColumns = fromTable.Columns.Where(c => c.IsPrimaryKey).ToList();
        return primaryKeyColumns.Count == 1
            && string.Equals(primaryKeyColumns[0].Name, relation.FromColumn, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>From 테이블이 두 개 이상의 부모를 참조하는 FK들로만 PK가 구성된 N:M 연결(브릿지/주니션) 테이블인지 판단합니다.</summary>
    private static bool IsJunctionRelation(DatabaseSchemaResult schema, DatabaseRelation relation)
    {
        if (!schema.TableMap.TryGetValue(relation.FromTableId, out var fromTable))
        {
            return false;
        }

        var primaryKeyColumns = fromTable.Columns
            .Where(c => c.IsPrimaryKey)
            .Select(c => c.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (primaryKeyColumns.Count < 2)
        {
            return false;
        }

        var fkRelationsFromTable = schema.Relations
            .Where(r => string.Equals(r.FromTableId, fromTable.Id, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var distinctParents = fkRelationsFromTable
            .Select(r => r.ToTableId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        if (distinctParents < 2)
        {
            return false;
        }

        var fkColumns = fkRelationsFromTable
            .Where(r => !string.IsNullOrWhiteSpace(r.FromColumn))
            .Select(r => r.FromColumn!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return primaryKeyColumns.IsSubsetOf(fkColumns);
    }
}
