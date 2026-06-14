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
            public HashSet<int> CriticalTaskIds { get; } = new();
            public HashSet<(int PredecessorId, int SuccessorId)> CriticalDependencies { get; } = new();
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
            if (effectiveDeps.Count == 0 && schedulable.Count > 1)
            {
                // Single chain or isolated tasks still get float from backward pass.
            }

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

            int projectFinish = ef.Values.DefaultIfEmpty(0).Max();
            var lf = new Dictionary<int, int>();
            var ls = new Dictionary<int, int>();

            foreach (var task in schedulable)
            {
                bool hasSuccessor = effectiveDeps.Any(d => d.PredecessorId == task.Id);
                lf[task.Id] = hasSuccessor ? projectFinish : ef[task.Id];
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
                    result.CriticalDependencies.Add((dep.PredecessorId, dep.SuccessorId));
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

                int? finishDriver = ResolveFinishDriver(dep.PredecessorId, allTasks, taskById, schedulableIds);
                if (finishDriver == null)
                    continue;

                var startDrivers = ResolveStartDrivers(
                    dep.SuccessorId,
                    allTasks,
                    taskById,
                    schedulableIds,
                    dependencies);

                foreach (int startDriver in startDrivers)
                    AddEffectiveDependency(expanded, seen, finishDriver.Value, startDriver, dep);
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
                LagDays = template.LagDays
            });
        }

        /// <summary>Leaf (or milestone) task whose finish drives the predecessor side.</summary>
        private static int? ResolveFinishDriver(
            int taskId,
            IReadOnlyList<ProjectTask> allTasks,
            Dictionary<int, ProjectTask> taskById,
            HashSet<int> schedulableIds)
        {
            var task = taskById[taskId];
            if (task.TaskType != TaskType.Summary)
                return schedulableIds.Contains(taskId) ? taskId : null;

            var leaves = GetLeafSchedulableTasks(taskId, allTasks, schedulableIds);
            if (leaves.Count == 0)
                return null;

            return leaves
                .OrderByDescending(t => t.EndDate)
                .ThenByDescending(t => t.Id)
                .First()
                .Id;
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
                DependencyType.FS => succLs - 1 - lag,
                DependencyType.SS => succLf - lag,
                DependencyType.FF => succLf - lag,
                DependencyType.SF => succLs - lag,
                _ => succLs - 1 - lag
            };
        }

        private static bool IsDrivingDependency(
            TaskDependency dep,
            Dictionary<int, int> es,
            Dictionary<int, int> ef)
        {
            int predEs = es[dep.PredecessorId];
            int predEf = ef[dep.PredecessorId];
            int succEs = es[dep.SuccessorId];
            int succEf = ef[dep.SuccessorId];
            int lag = dep.LagDays;

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
