export async function deleteProjectRequirements(db, projectId, ids) {
  const uniqueIds = [...new Set(ids.map(Number).filter((id) => !Number.isNaN(id) && id > 0))];
  if (uniqueIds.length === 0) return 0;

  const placeholders = uniqueIds.map(() => '?').join(',');

  let changes = 0;
  await db.transaction(async (tx) => {
    await tx.prepare(
      `DELETE FROM test_cases WHERE requirement_id IN (
        SELECT id FROM requirements WHERE project_id = ? AND id IN (${placeholders})
      )`,
    ).run(projectId, ...uniqueIds);

    const result = await tx.prepare(
      `DELETE FROM requirements WHERE project_id = ? AND id IN (${placeholders})`,
    ).run(projectId, ...uniqueIds);
    changes = result.changes;
  });

  return changes;
}
