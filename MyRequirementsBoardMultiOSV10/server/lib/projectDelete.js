export async function deleteProjectWithContents(db, projectId) {
  let testCaseCount = 0;
  let requirementCount = 0;

  await db.transaction(async (tx) => {
    const tcResult = await tx.prepare(
      `DELETE FROM test_cases WHERE requirement_id IN (
        SELECT id FROM requirements WHERE project_id = ?
      )`,
    ).run(projectId);
    testCaseCount = tcResult.changes ?? 0;

    const reqResult = await tx.prepare(
      'DELETE FROM requirements WHERE project_id = ?',
    ).run(projectId);
    requirementCount = reqResult.changes ?? 0;

    await tx.prepare('DELETE FROM project_members WHERE project_id = ?').run(projectId);

    const projectResult = await tx.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    if ((projectResult.changes ?? 0) === 0) {
      throw new Error('프로젝트를 찾을 수 없습니다.');
    }
  });

  return { testCaseCount, requirementCount };
}
