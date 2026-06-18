using System;
using System.Collections.Generic;
using System.Linq;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Analysis;

public static class IndexAdvisor
{
    private static readonly string[] LookupSuffixes  = ["_id", "_code", "_no"];
    private static readonly string[] CandidateSuffixes = ["_name", "_date", "_status", "_type"];

    public static IReadOnlyList<IndexSuggestion> Analyze(DbSchema schema)
    {
        var suggestions = new List<IndexSuggestion>();

        // FK column IDs from relationships (source side)
        var fkColumnIds = schema.Relationships
            .Select(r => r.SourceColumnId)
            .ToHashSet();

        foreach (var table in schema.Tables)
        {
            foreach (var col in table.Columns)
            {
                bool isPk     = col.IsPrimaryKey;
                bool isUnique = col.IsUnique;
                bool isFkByFlag = col.IsForeignKey;
                bool isFkByRel  = fkColumnIds.Contains(col.Id);
                string lower = col.Name.ToLowerInvariant();

                if (isPk)
                {
                    suggestions.Add(new IndexSuggestion
                    {
                        Table  = table.Name,
                        Column = col.Name,
                        Kind   = IndexSuggestionKind.AlreadyIndexed,
                        Reason = "기본 키(PK)는 자동으로 인덱싱됩니다.",
                        Recommendation = "별도 인덱스 불필요",
                    });
                    continue;
                }

                if (isUnique)
                {
                    suggestions.Add(new IndexSuggestion
                    {
                        Table  = table.Name,
                        Column = col.Name,
                        Kind   = IndexSuggestionKind.AlreadyIndexed,
                        Reason = "UNIQUE 제약조건은 내부적으로 인덱스를 생성합니다.",
                        Recommendation = "별도 인덱스 불필요",
                    });
                    continue;
                }

                if (isFkByFlag || isFkByRel)
                {
                    string source = isFkByRel ? "관계(Relationship)" : "FK 플래그";
                    suggestions.Add(new IndexSuggestion
                    {
                        Table  = table.Name,
                        Column = col.Name,
                        Kind   = IndexSuggestionKind.Required,
                        Reason = $"외래 키 컬럼입니다 ({source}). JOIN 및 참조 무결성 검사에 사용됩니다.",
                        Recommendation = $"CREATE INDEX idx_{table.Name.ToLowerInvariant()}_{lower} ON {table.Name} ({col.Name});",
                    });
                    continue;
                }

                if (HasAnySuffix(lower, LookupSuffixes))
                {
                    suggestions.Add(new IndexSuggestion
                    {
                        Table  = table.Name,
                        Column = col.Name,
                        Kind   = IndexSuggestionKind.Recommended,
                        Reason = "이름 패턴(_id/_code/_no)이 조회 기준 컬럼임을 나타냅니다.",
                        Recommendation = $"CREATE INDEX idx_{table.Name.ToLowerInvariant()}_{lower} ON {table.Name} ({col.Name});",
                    });
                    continue;
                }

                if (HasAnySuffix(lower, CandidateSuffixes))
                {
                    suggestions.Add(new IndexSuggestion
                    {
                        Table  = table.Name,
                        Column = col.Name,
                        Kind   = IndexSuggestionKind.Consider,
                        Reason = "이름 패턴(_name/_date/_status/_type)이 검색·필터 대상이 될 수 있습니다.",
                        Recommendation = $"쿼리 빈도와 선택도(Selectivity)를 확인한 뒤 인덱스 추가를 검토하세요.",
                    });
                }
            }
        }

        return suggestions;
    }

    private static bool HasAnySuffix(string name, string[] suffixes)
    {
        foreach (string s in suffixes)
            if (name.EndsWith(s, StringComparison.Ordinal))
                return true;
        return false;
    }
}
