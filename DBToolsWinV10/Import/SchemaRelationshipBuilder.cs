using System;
using System.Collections.Generic;
using System.Linq;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Import;

internal static class SchemaRelationshipBuilder
{
	public static void AddForeignKey(DbSchema schema, IReadOnlyDictionary<string, DbTable> tableMap, string parentTableName, string parentColumnName, string childTableName, string childColumnName, string constraintName = null)
	{
		if (!tableMap.TryGetValue(parentTableName, out DbTable parentTable) || !tableMap.TryGetValue(childTableName, out DbTable childTable))
		{
			return;
		}
		DbColumn parentCol = parentTable.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, parentColumnName, StringComparison.OrdinalIgnoreCase));
		DbColumn childCol = childTable.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, childColumnName, StringComparison.OrdinalIgnoreCase));
		if (parentCol != null && childCol != null)
		{
			string text = $"{parentTable.Name}.{parentCol.Name}->{childTable.Name}.{childCol.Name}";
			if (!schema.Relationships.Any((DbRelationship r) => r.SourceTableId == parentTable.Id && r.SourceColumnId == parentCol.Id && r.TargetTableId == childTable.Id && r.TargetColumnId == childCol.Id))
			{
				schema.Relationships.Add(new DbRelationship
				{
					Name = (string.IsNullOrWhiteSpace(constraintName) ? ("fk_" + childTable.Name + "_" + childCol.Name) : constraintName),
					Type = RelationshipType.OneToMany,
					SourceTableId = parentTable.Id,
					SourceColumnId = parentCol.Id,
					TargetTableId = childTable.Id,
					TargetColumnId = childCol.Id
				});
			}
		}
	}
}
