import { api } from '../api/client.js';

const MAX_STACK = 50;

export function requirementPayload(data) {
  return {
    title: data.title,
    description: data.description || '',
    category: data.category || '',
    classification: data.classification || '',
    priority: data.priority,
    status: data.status,
    assigneeUserId: data.assigneeUserId ?? null,
  };
}

export function testCasePayload(data) {
  return {
    code: data.code,
    title: data.title,
    description: data.description || '',
    steps: data.steps || '',
    expectedResult: data.expectedResult || '',
    status: data.status || 'NOT_RUN',
  };
}

async function restoreRequirementSnapshot(projectId, snapshot) {
  const created = await api.createRequirement(projectId, requirementPayload(snapshot));
  for (const tc of snapshot.testCases || []) {
    await api.createTestCase(created.id, testCasePayload(tc));
  }
  return created;
}

export async function applyUndo(action) {
  switch (action.type) {
    case 'requirement.create':
      await api.deleteRequirement(action.projectId, action.requirementId);
      break;
    case 'requirement.update':
      await api.updateRequirement(action.projectId, action.requirementId, action.before);
      break;
    case 'requirements.delete': {
      const restoredIds = [];
      for (const snapshot of action.snapshots) {
        const created = await restoreRequirementSnapshot(action.projectId, snapshot);
        restoredIds.push(created.id);
      }
      await api.renumberRequirements(action.projectId);
      await api.renumberTestCases(restoredIds[0] ?? action.deletedIds[0]);
      action.restoredIds = restoredIds;
      break;
    }
    case 'testCase.create':
      await api.deleteTestCase(action.requirementId, action.testCaseId);
      break;
    case 'testCase.update':
      await api.updateTestCase(action.requirementId, action.testCaseId, action.before);
      break;
    case 'testCase.delete': {
      const created = await api.createTestCase(action.requirementId, action.snapshot);
      await api.renumberTestCases(action.requirementId);
      action.restoredTestCaseId = created.id;
      break;
    }
    default:
      throw new Error(`Unknown undo action: ${action.type}`);
  }
}

export async function applyRedo(action) {
  switch (action.type) {
    case 'requirement.create': {
      const created = await api.createRequirement(action.projectId, action.snapshot);
      action.requirementId = created.id;
      break;
    }
    case 'requirement.update':
      await api.updateRequirement(action.projectId, action.requirementId, action.after);
      break;
    case 'requirements.delete': {
      const ids = action.restoredIds?.length ? action.restoredIds : action.deletedIds;
      if (ids.length === 1) {
        await api.deleteRequirement(action.projectId, ids[0]);
      } else {
        await api.bulkDeleteRequirements(action.projectId, ids);
      }
      break;
    }
    case 'testCase.create': {
      const created = await api.createTestCase(action.requirementId, action.snapshot);
      action.testCaseId = created.id;
      break;
    }
    case 'testCase.update':
      await api.updateTestCase(action.requirementId, action.testCaseId, action.after);
      break;
    case 'testCase.delete':
      await api.deleteTestCase(action.requirementId, action.restoredTestCaseId || action.testCaseId);
      break;
    default:
      throw new Error(`Unknown redo action: ${action.type}`);
  }
}

export function createHistoryStacks() {
  return { undo: [], redo: [] };
}

export function pushHistory(stacks, action) {
  stacks.undo.push(action);
  if (stacks.undo.length > MAX_STACK) stacks.undo.shift();
  stacks.redo.length = 0;
}

export { MAX_STACK };
