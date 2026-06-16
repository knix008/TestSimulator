namespace MyProject.Models
{
    /// <summary>
    /// Critical Path Method (CPM) on schedulable tasks (normal + milestone).
    /// Uses working-day indices aligned with the project working-week schedule.
    /// Summary-level dependencies are expanded to the leaf tasks that actually
    /// drive schedule synchronization inside each subtree.
    /// </summary>
    public static class CriticalPathCalculator
    {
        public sealed class Result
        {
            /// <summary>Schedulable tasks with zero total float (LS &lt;= ES).</summary>
            public HashSet<int> CriticalTaskIds { get; } = new();

            /// <summary>Tasks that participate in at least one driving critical dependency link.</summary>
            public HashSet<int> CriticalChainTaskIds { get; } = new();

            public HashSet<(int PredecessorId, int SuccessorId)> CriticalDependencies { get; } = new();

            /// <summary>Expanded schedulable-task links that form the driving critical path chain.</summary>
            public List<TaskDependency> CriticalLinks { get; } = new();
        }

        public static Result Compute(
            IReadOnlyList<ProjectTask> allTasks,
            IReadOnlyList<TaskDependency> dependencies,
            DateTime projectStart,
            WorkingWeekSchedule schedule)
        {
            var result = new Result();
            var taskById = allTasks.ToDictionary(t => t.Id);
            var schedulable = allTasks
                .Where(t => t.TaskType != TaskType.Summary)
                .ToList();

            if (schedulable.Count == 0)
                return result;

            var schedulableIds = schedulable.Select(t => t.Id).ToHashSet();
            var effectiveDeps = ExpandDependencies(allTasks, dependencies, taskById, schedulableIds);

            var origin = GetScheduleOrigin(projectStart, schedule);

            int EarlyStart(ProjectTask t) => GetWorkingDayIndex(origin, t.StartDate, schedule);

            int EarlyFinish(ProjectTask t) =>
                t.TaskType == TaskType.Milestone
                    ? EarlyStart(t)
                    : GetWorkingDayIndex(origin, t.EndDate, schedule);

            var es = schedulable.ToDictionary(t => t.Id, EarlyStart);
            var ef = schedulable.ToDictionary(t => t.Id, EarlyFinish);
            var taskBySchedId = schedulable.ToDictionary(t => t.Id);

            int Duration(ProjectTask t) =>
                t.TaskType == TaskType.Milestone ? 0 : Math.Max(1, ef[t.Id] - es[t.Id] + 1);

            int projectFinish = ef.Values.DefaultIfEmpty(0).Max();
            var lf = new Dictionary<int, int>();
            var ls = new Dictionary<int, int>();

            foreach (var task in schedulable)
            {
                lf[task.Id] = projectFinish;
                int dur = Duration(task);
                ls[task.Id] = task.TaskType == TaskType.Milestone
                    ? lf[task.Id]
                    : lf[task.Id] - dur + 1;
            }

            for (int iteration = 0; iteration < schedulable.Count + 5; iteration++)
            {
                bool changed = false;
                foreach (var task in schedulable)
                {
                    int dur = Duration(task);
                    int newLf = lf[task.Id];
                    foreach (var dep in effectiveDeps.Where(d => d.PredecessorId == task.Id))
                    {
                        int succLs = ls[dep.SuccessorId];
                        int succLf = lf[dep.SuccessorId];
                        int limit = GetBackwardLfLimit(dep, succLs, succLf, dur);
                        if (limit < newLf)
                        {
                            newLf = limit;
                            changed = true;
                        }
                    }

                    if (newLf != lf[task.Id])
                    {
                        lf[task.Id] = newLf;
                        changed = true;
                    }

                    int newLs = task.TaskType == TaskType.Milestone
                        ? newLf
                        : newLf - dur + 1;
                    if (newLs != ls[task.Id])
                    {
                        ls[task.Id] = newLs;
                        changed = true;
                    }
                }

                if (!changed)
                    break;
            }

            foreach (var task in schedulable)
            {
                if (ls[task.Id] <= es[task.Id])
                    result.CriticalTaskIds.Add(task.Id);
            }

            foreach (var dep in effectiveDeps)
            {
                if (!result.CriticalTaskIds.Contains(dep.PredecessorId)
                    || !result.CriticalTaskIds.Contains(dep.SuccessorId))
                    continue;

                if (IsDrivingDependency(dep, es, ef))
                {
                    result.CriticalDependencies.Add((dep.PredecessorId, dep.SuccessorId));
                    result.CriticalLinks.Add(new TaskDependency
                    {
                        PredecessorId = dep.PredecessorId,
                        SuccessorId = dep.SuccessorId,
                        Type = dep.Type,
                        LagDays = dep.LagDays,
                        StartLineEnd = dep.StartLineEnd,
                        EndLineEnd = dep.EndLineEnd
                    });
                }
            }

            foreach (var link in result.CriticalLinks)
            {
                result.CriticalChainTaskIds.Add(link.PredecessorId);
                result.CriticalChainTaskIds.Add(link.SuccessorId);
            }

            // Isolated critical tasks (no driving links) that end at projectFinish
            // are still on the critical path — include them so backward tracing works.
            var tasksInAnyLink = result.CriticalLinks.Select(l => l.PredecessorId)
                .Concat(result.CriticalLinks.Select(l => l.SuccessorId))
                .ToHashSet();
            foreach (var task in schedulable)
            {
                if (result.CriticalTaskIds.Contains(task.Id)
                    && !tasksInAnyLink.Contains(task.Id)
                    && ef[task.Id] == projectFinish)
                    result.CriticalChainTaskIds.Add(task.Id);
            }

            return result;
        }

        /// <summary>
        /// Returns the terminal task IDs on the critical chain — tasks with no outgoing
        /// driving critical link. These are the starting points for backward tracing
        /// (they correspond to the end of the critical path, i.e. the project finish).
        /// </summary>
        public static IReadOnlyList<int> GetCriticalChainTerminals(Result result)
        {
            var hasOutgoingLink = result.CriticalLinks.Select(l => l.PredecessorId).ToHashSet();
            return result.CriticalChainTaskIds
                .Where(id => !hasOutgoingLink.Contains(id))
                .ToList();
        }

        /// <summary>
        /// Traces backward through driving critical links from the given task, returning
        /// all tasks on the chain that lead to it, ordered from earliest to latest.
        /// </summary>
        public static List<int> TraceBackwardFrom(Result result, int targetTaskId)
        {
            var predecessorMap = result.CriticalLinks
                .GroupBy(l => l.SuccessorId)
                .ToDictionary(g => g.Key, g => g.Select(l => l.PredecessorId).ToList());

            var chain = new List<int>();
            var visited = new HashSet<int>();

            void Trace(int id)
            {
                if (!visited.Add(id)) return;
                chain.Add(id);
                if (predecessorMap.TryGetValue(id, out var preds))
                    foreach (var pred in preds)
                        Trace(pred);
            }

            Trace(targetTaskId);
            chain.Reverse();
            return chain;
        }

        /// <summary>
        /// Traces backward from all terminal critical tasks to build complete critical chains.
        /// Each chain is ordered from its earliest task to its terminal (project-end) task.
        /// Isolated critical tasks with no driving links appear as single-element chains.
        /// </summary>
        public static List<List<int>> GetCriticalChainsFromEnd(Result result)
        {
            var terminals = GetCriticalChainTerminals(result);
            var allChains = new List<List<int>>();
            var covered = new HashSet<int>();

            foreach (var terminal in terminals)
            {
                var chain = TraceBackwardFrom(result, terminal);
                if (chain.Count > 0)
                {
                    allChains.Add(chain);
                    foreach (var id in chain) covered.Add(id);
                }
            }

            return allChains;
        }

        private static List<TaskDependency> ExpandDependencies(
            IReadOnlyList<ProjectTask> allTasks,
            IReadOnlyList<TaskDependency> dependencies,
            Dictionary<int, ProjectTask> taskById,
            HashSet<int> schedulableIds)
        {
            var expanded = new List<TaskDependency>();
            var seen = new HashSet<(int Pred, int Succ, DependencyType Type, int Lag)>();

            foreach (var dep in dependencies)
            {
                if (!taskById.ContainsKey(dep.PredecessorId) || !taskById.ContainsKey(dep.SuccessorId))
                    continue;

                var finishDrivers = ResolveFinishDrivers(dep.PredecessorId, allTasks, taskById, schedulableIds);
                if (finishDrivers.Count == 0)
                    continue;

                var startDrivers = ResolveStartDrivers(
                    dep.SuccessorId,
                    allTasks,
                    taskById,
                    schedulableIds,
                    dependencies);

                if (startDrivers.Count == 0)
                    continue;

                foreach (int finishDriver in finishDrivers)
                foreach (int startDriver in startDrivers)
                    AddEffectiveDependency(expanded, seen, finishDriver, startDriver, dep);
            }

            return expanded;
        }

        private static void AddEffectiveDependency(
            List<TaskDependency> expanded,
            HashSet<(int Pred, int Succ, DependencyType Type, int Lag)> seen,
            int predecessorId,
            int successorId,
            TaskDependency template)
        {
            var key = (predecessorId, successorId, template.Type, template.LagDays);
            if (!seen.Add(key))
                return;

            expanded.Add(new TaskDependency
            {
                PredecessorId = predecessorId,
                SuccessorId = successorId,
                Type = template.Type,
                LagDays = template.LagDays,
                StartLineEnd = template.StartLineEnd,
                EndLineEnd = template.EndLineEnd
            });
        }

        /// <summary>Leaf tasks whose finish drives the predecessor side (latest end in subtree).</summary>
        private static List<int> ResolveFinishDrivers(
            int taskId,
            IReadOnlyList<ProjectTask> allTasks,
            Dictionary<int, ProjectTask> taskById,
            HashSet<int> schedulableIds)
        {
            var task = taskById[taskId];
            if (task.TaskType != TaskType.Summary)
                return schedulableIds.Contains(taskId) ? new List<int> { taskId } : new List<int>();

            var leaves = GetLeafSchedulableTasks(taskId, allTasks, schedulableIds);
            if (leaves.Count == 0)
                return new List<int>();

            DateTime maxEnd = leaves.Max(t => t.EndDate);
            return leaves
                .Where(t => t.EndDate == maxEnd)
                .Select(t => t.Id)
                .ToList();
        }

        /// <summary>Leaf tasks whose start is constrained by the dependency on the successor side.</summary>
        private static List<int> ResolveStartDrivers(
            int taskId,
            IReadOnlyList<ProjectTask> allTasks,
            Dictionary<int, ProjectTask> taskById,
            HashSet<int> schedulableIds,
            IReadOnlyList<TaskDependency> dependencies)
        {
            var task = taskById[taskId];
            if (task.TaskType != TaskType.Summary)
                return schedulableIds.Contains(taskId) ? new List<int> { taskId } : new List<int>();

            var leaves = GetLeafSchedulableTasks(taskId, allTasks, schedulableIds);
            if (leaves.Count == 0)
                return new List<int>();

            var leafIds = leaves.Select(t => t.Id).ToHashSet();
            var entryTasks = leaves
                .Where(leaf => !dependencies.Any(d =>
                    d.SuccessorId == leaf.Id
                    && IsInSubtree(d.PredecessorId, taskId, taskById)
                    && leafIds.Contains(d.PredecessorId)))
                .ToList();

            if (entryTasks.Count == 0)
                entryTasks = leaves;

            DateTime minStart = entryTasks.Min(t => t.StartDate);
            return entryTasks
                .Where(t => t.StartDate == minStart)
                .Select(t => t.Id)
                .ToList();
        }

        private static List<ProjectTask> GetLeafSchedulableTasks(
            int summaryRootId,
            IReadOnlyList<ProjectTask> allTasks,
            HashSet<int> schedulableIds)
        {
            var result = new List<ProjectTask>();
            CollectLeafSchedulable(summaryRootId, allTasks, schedulableIds, result);
            return result;
        }

        private static void CollectLeafSchedulable(
            int parentId,
            IReadOnlyList<ProjectTask> allTasks,
            HashSet<int> schedulableIds,
            List<ProjectTask> result)
        {
            foreach (var child in allTasks.Where(t => t.ParentId == parentId))
            {
                if (child.TaskType == TaskType.Summary)
                    CollectLeafSchedulable(child.Id, allTasks, schedulableIds, result);
                else if (schedulableIds.Contains(child.Id))
                    result.Add(child);
            }
        }

        /// <summary>
        /// For each top-level summary task, runs local CPM using only that group's tasks and
        /// internal dependencies. Tasks with zero float relative to the group's own finish date
        /// are returned as locally critical — even when the group ends before the global finish.
        /// </summary>
        public static HashSet<int> ComputeLocalCriticalTaskIds(
            IReadOnlyList<ProjectTask> allTasks,
            IReadOnlyList<TaskDependency> dependencies,
            DateTime projectStart,
            WorkingWeekSchedule schedule)
        {
            var localCritical = new HashSet<int>();
            var taskById = allTasks.ToDictionary(t => t.Id);
            var schedulableIds = allTasks
                .Where(t => t.TaskType != TaskType.Summary)
                .Select(t => t.Id)
                .ToHashSet();

            var origin = GetScheduleOrigin(projectStart, schedule);

            int EarlyStart(ProjectTask t) => GetWorkingDayIndex(origin, t.StartDate, schedule);

            int EarlyFinish(ProjectTask t) =>
                t.TaskType == TaskType.Milestone
                    ? EarlyStart(t)
                    : GetWorkingDayIndex(origin, t.EndDate, schedule);

            foreach (var root in allTasks.Where(t => t.ParentId == -1 && t.TaskType == TaskType.Summary))
            {
                var groupTasks = GetLeafSchedulableTasks(root.Id, allTasks, schedulableIds);
                if (groupTasks.Count == 0) continue;

                var groupIds = groupTasks.Select(t => t.Id).ToHashSet();
                var es = groupTasks.ToDictionary(t => t.Id, EarlyStart);
                var ef = groupTasks.ToDictionary(t => t.Id, EarlyFinish);
                int groupFinish = ef.Values.Max();

                // Only dependencies where both endpoints are within this root subtree
                var groupDeps = dependencies
                    .Where(d => IsInSubtree(d.PredecessorId, root.Id, taskById)
                             && IsInSubtree(d.SuccessorId, root.Id, taskById))
                    .ToList();

                var effectiveDeps = ExpandDependencies(allTasks, groupDeps, taskById, groupIds);

                foreach (var id in ComputeBackwardPassCritical(groupTasks, effectiveDeps, es, ef, groupFinish))
                    localCritical.Add(id);
            }

            return localCritical;
        }

        private static HashSet<int> ComputeBackwardPassCritical(
            List<ProjectTask> tasks,
            List<TaskDependency> effectiveDeps,
            Dictionary<int, int> es,
            Dictionary<int, int> ef,
            int groupFinish)
        {
            int Duration(ProjectTask t) =>
                t.TaskType == TaskType.Milestone ? 0 : Math.Max(1, ef[t.Id] - es[t.Id] + 1);

            var lf = new Dictionary<int, int>();
            var ls = new Dictionary<int, int>();

            foreach (var task in tasks)
            {
                lf[task.Id] = groupFinish;
                int dur = Duration(task);
                ls[task.Id] = task.TaskType == TaskType.Milestone ? groupFinish : groupFinish - dur + 1;
            }

            for (int iteration = 0; iteration < tasks.Count + 5; iteration++)
            {
                bool changed = false;
                foreach (var task in tasks)
                {
                    int dur = Duration(task);
                    int newLf = lf[task.Id];
                    foreach (var dep in effectiveDeps.Where(d => d.PredecessorId == task.Id))
                    {
                        if (!ls.ContainsKey(dep.SuccessorId)) continue;
                        int limit = GetBackwardLfLimit(dep, ls[dep.SuccessorId], lf[dep.SuccessorId], dur);
                        if (limit < newLf) newLf = limit;
                    }

                    if (newLf != lf[task.Id]) { lf[task.Id] = newLf; changed = true; }

                    int newLs = task.TaskType == TaskType.Milestone ? newLf : newLf - dur + 1;
                    if (newLs != ls[task.Id]) { ls[task.Id] = newLs; changed = true; }
                }
                if (!changed) break;
            }

            var result = new HashSet<int>();
            foreach (var task in tasks)
                if (ls[task.Id] <= es[task.Id])
                    result.Add(task.Id);
            return result;
        }

        private static bool IsInSubtree(int taskId, int summaryRootId, Dictionary<int, ProjectTask> taskById)
        {
            if (taskId == summaryRootId)
                return true;

            var task = taskById.GetValueOrDefault(taskId);
            if (task == null || task.ParentId < 0)
                return false;

            return IsInSubtree(task.ParentId, summaryRootId, taskById);
        }

        private static int GetBackwardLfLimit(TaskDependency dep, int succLs, int succLf, int predDuration)
        {
            int lag = dep.LagDays;
            // For milestones predDuration=0, so LF=LS: the SS/SF offset is 0 not -1.
            int durOffset = predDuration > 0 ? predDuration - 1 : 0;
            return dep.Type switch
            {
                // FS: succ.Start >= pred.Finish+1+lag  →  pred.LF <= succ.LS - 1 - lag
                DependencyType.FS => succLs - 1 - lag,
                // SS: succ.Start >= pred.Start+lag  →  pred.LS <= succ.LS - lag
                //     pred.LF = pred.LS + dur - 1  →  pred.LF <= succ.LS + durOffset - lag
                DependencyType.SS => succLs + durOffset - lag,
                // FF: succ.Finish >= pred.Finish+lag  →  pred.LF <= succ.LF - lag
                DependencyType.FF => succLf - lag,
                // SF: succ.Finish >= pred.Start+lag  →  pred.LS <= succ.LF - lag
                //     pred.LF = pred.LS + dur - 1  →  pred.LF <= succ.LF + durOffset - lag
                DependencyType.SF => succLf + durOffset - lag,
                _ => succLs - 1 - lag
            };
        }

        private static bool IsDrivingDependency(
            TaskDependency dep,
            Dictionary<int, int> es,
            Dictionary<int, int> ef)
        {
            if (!es.ContainsKey(dep.PredecessorId) || !es.ContainsKey(dep.SuccessorId))
                return false;

            int lag = dep.LagDays;
            int predEs = es[dep.PredecessorId];
            int predEf = ef[dep.PredecessorId];
            int succEs = es[dep.SuccessorId];
            int succEf = ef[dep.SuccessorId];

            return dep.Type switch
            {
                DependencyType.FS => succEs == predEf + 1 + lag,
                DependencyType.SS => succEs == predEs + lag,
                DependencyType.FF => succEf == predEf + lag,
                DependencyType.SF => succEf == predEs + lag,
                _ => succEs == predEf + 1 + lag
            };
        }

        private static DateTime GetScheduleOrigin(DateTime projectStart, WorkingWeekSchedule schedule) =>
            WorkingDayCalendar.SnapToNextWorkingDay(projectStart.Date, schedule);

        private static int GetWorkingDayIndex(DateTime origin, DateTime date, WorkingWeekSchedule schedule)
        {
            if (date.Date < origin.Date)
                return 0;

            return WorkingDayCalendar.CountWorkingDaysInclusive(origin, date.Date, schedule) - 1;
        }
    }
}
