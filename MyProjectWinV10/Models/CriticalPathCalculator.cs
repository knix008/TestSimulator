namespace MyProject.Models
{
    /// <summary>
    /// Critical Path Method (CPM) on schedulable tasks (normal + milestone).
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
            DateTime projectStart)
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

            var projectStartDate = projectStart.Date;

            int Duration(ProjectTask t) =>
                t.TaskType == TaskType.Milestone ? 0 : Math.Max(1, t.DurationDays);

            int EarlyStart(ProjectTask t) =>
                (t.StartDate.Date - projectStartDate).Days;

            int EarlyFinish(ProjectTask t) =>
                t.TaskType == TaskType.Milestone
                    ? EarlyStart(t)
                    : (t.EndDate.Date - projectStartDate).Days;

            var es = schedulable.ToDictionary(t => t.Id, EarlyStart);
            var ef = schedulable.ToDictionary(t => t.Id, EarlyFinish);
            var taskBySchedId = schedulable.ToDictionary(t => t.Id);

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

            return result;
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
            DateTime projectStart)
        {
            var localCritical = new HashSet<int>();
            var taskById = allTasks.ToDictionary(t => t.Id);
            var schedulableIds = allTasks
                .Where(t => t.TaskType != TaskType.Summary)
                .Select(t => t.Id)
                .ToHashSet();

            var projectStartDate = projectStart.Date;

            int EarlyStart(ProjectTask t) =>
                (t.StartDate.Date - projectStartDate).Days;

            int EarlyFinish(ProjectTask t) =>
                t.TaskType == TaskType.Milestone
                    ? EarlyStart(t)
                    : (t.EndDate.Date - projectStartDate).Days;

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
                t.TaskType == TaskType.Milestone ? 0 : Math.Max(1, t.DurationDays);

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
            return dep.Type switch
            {
                // FS: succ.Start >= pred.Finish+1+lag  →  pred.LF <= succ.LS - 1 - lag
                DependencyType.FS => succLs - 1 - lag,
                // SS: succ.Start >= pred.Start+lag  →  pred.LS <= succ.LS - lag
                //     pred.LF = pred.LS + dur - 1  →  pred.LF <= succ.LS + predDuration - 1 - lag
                DependencyType.SS => succLs + predDuration - 1 - lag,
                // FF: succ.Finish >= pred.Finish+lag  →  pred.LF <= succ.LF - lag
                DependencyType.FF => succLf - lag,
                // SF: succ.Finish >= pred.Start+lag  →  pred.LS <= succ.LF - lag
                //     pred.LF = pred.LS + dur - 1  →  pred.LF <= succ.LF + predDuration - 1 - lag
                DependencyType.SF => succLf + predDuration - 1 - lag,
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
    }
}
