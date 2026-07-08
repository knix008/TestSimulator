import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AiRefineResultDialog from '../components/AiRefineResultDialog.jsx';
import { useLanguage } from './LanguageContext.jsx';
import { useUndoHistory } from './UndoHistoryContext.jsx';
import { useExcelDialogs } from './ExcelDialogContext.jsx';
import { api } from '../api/client.js';
import { mergeRequirementRefined, requirementRefineChanged, mergeTestCaseRefined, testCaseRefineChanged } from '../lib/aiRefineMerge.js';
import { requirementPayload, testCasePayload } from '../lib/requirementUndoActions.js';
import { runBulkAiRefine } from '../lib/runBulkAiRefine.js';

const AiRefineContext = createContext(null);

const ENTITIES = ['requirements', 'testCases'];
const ROW_HIGHLIGHT_MS = 1800;

function createEmptyJob() {
  return {
    refining: false,
    progress: null,
    summary: null,
    error: null,
    refinedRowIds: [],
    projectId: null,
  };
}

function createInitialJobs() {
  return {
    requirements: createEmptyJob(),
    testCases: createEmptyJob(),
  };
}

export function AiRefineProvider({ children }) {
  const { language, t } = useLanguage();
  const { push } = useUndoHistory();
  const { notifyDataChange } = useExcelDialogs();
  const [jobs, setJobs] = useState(createInitialJobs);
  const jobRefs = useRef({
    requirements: { cancelRequested: false, abortController: null },
    testCases: { cancelRequested: false, abortController: null },
  });
  const rowListenersRef = useRef({
    requirements: new Set(),
    testCases: new Set(),
  });
  const runningRef = useRef({
    requirements: false,
    testCases: false,
  });
  const refinedRowTimersRef = useRef({
    requirements: new Map(),
    testCases: new Map(),
  });

  const clearRefinedRowTimer = useCallback((entity, rowId) => {
    const timers = refinedRowTimersRef.current[entity];
    const timer = timers?.get(rowId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(rowId);
    }
  }, []);

  const clearAllRefinedRowTimers = useCallback((entity) => {
    const timers = refinedRowTimersRef.current[entity];
    if (!timers) return;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  }, []);

  const patchJob = useCallback((entity, patch) => {
    setJobs((prev) => ({
      ...prev,
      [entity]: { ...prev[entity], ...patch },
    }));
  }, []);

  const notifyRowListeners = useCallback((entity, item, after, before) => {
    rowListenersRef.current[entity].forEach((listener) => {
      listener(item, after, before);
    });
  }, []);

  const registerRowListener = useCallback((entity, listener) => {
    rowListenersRef.current[entity].add(listener);
    return () => rowListenersRef.current[entity].delete(listener);
  }, []);

  const dismissSummary = useCallback((entity) => {
    patchJob(entity, { summary: null, error: null });
  }, [patchJob]);

  const cancelRefine = useCallback((entity) => {
    const refs = jobRefs.current[entity];
    refs.cancelRequested = true;
    refs.abortController?.abort();
    setJobs((prev) => ({
      ...prev,
      [entity]: {
        ...prev[entity],
        progress: prev[entity].progress
          ? { ...prev[entity].progress, phase: 'stopping' }
          : prev[entity].progress,
      },
    }));
  }, []);

  const runRefineJob = useCallback(async (entity, {
    projectId,
    items,
    requirementsById,
  }) => {
    if (runningRef.current[entity]) return;
    runningRef.current[entity] = true;

    const refs = jobRefs.current[entity];
    refs.cancelRequested = false;
    refs.abortController = new AbortController();
    clearAllRefinedRowTimers(entity);

    patchJob(entity, {
      refining: true,
      progress: null,
      summary: null,
      error: null,
      refinedRowIds: [],
      projectId,
    });

    const isRequirements = entity === 'requirements';

    try {
      const summary = await runBulkAiRefine({
        items,
        shouldCancel: () => refs.cancelRequested,
        refineOne: async (item) => {
          if (isRequirements) {
            const result = await api.refineRequirement({
              title: item.title,
              description: item.description,
              category: item.category,
              classification: item.classification,
              priority: item.priority,
              status: item.status,
              locale: language,
              fillGaps: true,
            }, { signal: refs.abortController?.signal });
            return result.refined;
          }

          const requirement = requirementsById?.get(item.requirementId);
          const result = await api.refineTestCase({
            title: item.title,
            description: item.description,
            steps: item.steps,
            expectedResult: item.expectedResult,
            status: item.status,
            requirementTitle: item.requirementTitle || requirement?.title || '',
            requirementDescription: requirement?.description || '',
            locale: language,
            fillGaps: true,
          }, { signal: refs.abortController?.signal });
          return result.refined;
        },
        mergeRefined: isRequirements ? mergeRequirementRefined : mergeTestCaseRefined,
        payloadFn: isRequirements ? requirementPayload : testCasePayload,
        hasChanged: isRequirements ? requirementRefineChanged : testCaseRefineChanged,
        saveOne: async (item, after, before) => {
          if (isRequirements) {
            await api.updateRequirement(projectId, item.id, after);
            push({
              type: 'requirement.update',
              requirementId: item.id,
              before,
              after,
            });
          } else {
            await api.updateTestCase(item.requirementId, item.id, after);
          }
        },
        onProgress: (progress) => patchJob(entity, { progress }),
        onRowCommitted: (item, after, before) => {
          notifyDataChange();
          notifyRowListeners(entity, item, after, before);
          clearRefinedRowTimer(entity, item.id);
          setJobs((prev) => ({
            ...prev,
            [entity]: {
              ...prev[entity],
              refinedRowIds: prev[entity].refinedRowIds.includes(item.id)
                ? prev[entity].refinedRowIds
                : [...prev[entity].refinedRowIds, item.id],
            },
          }));

          const timer = setTimeout(() => {
            setJobs((prev) => ({
              ...prev,
              [entity]: {
                ...prev[entity],
                refinedRowIds: prev[entity].refinedRowIds.filter((rowId) => rowId !== item.id),
              },
            }));
            refinedRowTimersRef.current[entity]?.delete(item.id);
          }, ROW_HIGHLIGHT_MS);

          refinedRowTimersRef.current[entity]?.set(item.id, timer);
        },
        onRowError: () => {},
      });

      const errorKey = isRequirements ? 'requirements.aiRefineErrors' : 'testCasesPage.aiRefineErrors';
      patchJob(entity, {
        summary,
        error: summary.failed > 0
          ? t(errorKey, {
            details: summary.failures.map((entry) => `${entry.code}: ${entry.message}`).join('; '),
          })
          : null,
      });
    } finally {
      patchJob(entity, { refining: false, progress: null });
      refs.abortController = null;
      refs.cancelRequested = false;
      runningRef.current[entity] = false;
    }
  }, [language, notifyDataChange, notifyRowListeners, patchJob, push, t]);

  const startRequirementsRefine = useCallback(async ({ projectId, items }) => {
    if (!projectId || items.length === 0) return;
    await runRefineJob('requirements', { projectId, items });
  }, [runRefineJob]);

  const startTestCasesRefine = useCallback(async ({ projectId, items, requirements }) => {
    if (!projectId || items.length === 0) return;
    const requirementsById = new Map((requirements || []).map((req) => [req.id, req]));
    await runRefineJob('testCases', { projectId, items, requirementsById });
  }, [runRefineJob]);

  const value = useMemo(() => ({
    jobs,
    getJob: (entity) => jobs[entity] ?? createEmptyJob(),
    isRefining: (entity) => Boolean(jobs[entity]?.refining),
    startRequirementsRefine,
    startTestCasesRefine,
    cancelRefine,
    dismissSummary,
    registerRowListener,
  }), [
    jobs,
    startRequirementsRefine,
    startTestCasesRefine,
    cancelRefine,
    dismissSummary,
    registerRowListener,
  ]);

  useEffect(() => () => {
    ENTITIES.forEach((entity) => clearAllRefinedRowTimers(entity));
  }, [clearAllRefinedRowTimers]);

  return (
    <AiRefineContext.Provider value={value}>
      {children}
      {ENTITIES.map((entity) => (
        <AiRefineResultDialog
          key={entity}
          open={Boolean(jobs[entity].summary)}
          summary={jobs[entity].summary}
          onClose={() => dismissSummary(entity)}
        />
      ))}
    </AiRefineContext.Provider>
  );
}

export function useAiRefine() {
  const ctx = useContext(AiRefineContext);
  if (!ctx) throw new Error('useAiRefine must be used within AiRefineProvider');
  return ctx;
}

export function useAiRefineJob(entity) {
  const {
    getJob,
    isRefining,
    cancelRefine,
    dismissSummary,
    registerRowListener,
    startRequirementsRefine,
    startTestCasesRefine,
  } = useAiRefine();
  const job = getJob(entity);

  return {
    ...job,
    refining: isRefining(entity),
    cancelRefine: () => cancelRefine(entity),
    dismissSummary: () => dismissSummary(entity),
    registerRowListener: (listener) => registerRowListener(entity, listener),
    startRequirementsRefine,
    startTestCasesRefine,
  };
}
