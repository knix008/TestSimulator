using System.ComponentModel;

namespace MyProject.Models
{
    public class ProjectModel
    {
        private int _nextId = 1;
        private readonly List<ProjectTask> _tasks = new();
        private readonly List<TaskDependency> _dependencies = new();
        private readonly List<ResourceAssignment> _assignments = new();
        private bool _isUpdatingHierarchy;

        public string ProjectName { get; set; } = "New Project";
        public DateTime ProjectStart { get; set; } = DateTime.Today;
        public string FilePath { get; set; } = "";
        public bool IsModified { get; set; } = false;

        public IReadOnlyList<ProjectTask> Tasks => _tasks.AsReadOnly();
        public IReadOnlyList<TaskDependency> Dependencies => _dependencies.AsReadOnly();
        public IReadOnlyList<ResourceAssignment> Assignments => _assignments.AsReadOnly();

        public IEnumerable<ResourceAssignment> GetAssignments(int taskId) =>
            _assignments.Where(a => a.TaskId == taskId);

        public bool AddAssignment(int taskId, string resourceName, double percent)
        {
            double existing = _assignments.Where(a => a.TaskId == taskId).Sum(a => a.AllocationPercent);
            if (existing + percent > 100.0) return false;
            _assignments.Add(new ResourceAssignment { TaskId = taskId, ResourceName = resourceName, AllocationPercent = percent });
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        public void RemoveAssignment(int taskId, string resourceName)
        {
            _assignments.RemoveAll(a => a.TaskId == taskId && a.ResourceName == resourceName);
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public double GetTotalAllocation(int taskId) =>
            _assignments.Where(a => a.TaskId == taskId).Sum(a => a.AllocationPercent);

        public string GetTaskAssigneeDisplay(int taskId)
        {
            var assignments = GetAssignments(taskId).ToList();
            if (assignments.Count > 0)
            {
                return string.Join(", ", assignments.Select(a =>
                    assignments.Count == 1 && Math.Abs(a.AllocationPercent - 100) < 0.01
                        ? a.ResourceName
                        : $"{a.ResourceName} ({a.AllocationPercent:0}%)"));
            }

            return GetTask(taskId)?.AssignedTo ?? "";
        }

        public event EventHandler? ModelChanged;

        public ProjectTask AddTask(string name = "New Task", int afterId = -1)
        {
            var task = new ProjectTask { Id = _nextId++, Name = name, StartDate = DateTime.Today };
            task.PropertyChanged += Task_PropertyChanged;

            int insertIdx = afterId >= 0
                ? GetInsertIndexAfterSubtree(afterId)
                : _tasks.Count;

            if (afterId >= 0)
            {
                var after = GetTask(afterId);
                if (after != null)
                    task.IndentLevel = after.IndentLevel;
            }

            _tasks.Insert(Math.Clamp(insertIdx, 0, _tasks.Count), task);

            UpdateHierarchy();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return task;
        }

        public ProjectTask AddSubtask(int parentId, string name = "New Task")
        {
            var parent = GetTask(parentId);
            if (parent == null) return AddTask(name);

            var task = new ProjectTask
            {
                Id = _nextId++,
                Name = name,
                StartDate = parent.StartDate,
                IndentLevel = parent.IndentLevel + 1
            };
            task.PropertyChanged += Task_PropertyChanged;

            int parentIdx = GetTaskIndex(parentId);
            int insertIdx = parentIdx + 1;
            while (insertIdx < _tasks.Count && _tasks[insertIdx].IndentLevel > parent.IndentLevel)
                insertIdx++;

            _tasks.Insert(insertIdx, task);

            if (!parent.IsExpanded)
            {
                parent.IsExpanded = true;
                UpdateVisibility();
            }

            UpdateHierarchy();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return task;
        }

        public void RemoveTask(int taskId)
        {
            int idx = GetTaskIndex(taskId);
            if (idx < 0) return;

            var tasksToRemove = GetSubtreeTasks(taskId).ToList();
            var removedIds = tasksToRemove.Select(t => t.Id).ToHashSet();

            foreach (var task in tasksToRemove)
            {
                _tasks.Remove(task);
                task.PropertyChanged -= Task_PropertyChanged;
            }

            _dependencies.RemoveAll(d => removedIds.Contains(d.PredecessorId) || removedIds.Contains(d.SuccessorId));
            _assignments.RemoveAll(a => removedIds.Contains(a.TaskId));

            UpdateHierarchy();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void MoveTask(int taskId, int targetIndex)
        {
            var block = GetSubtreeTasks(taskId).ToList();
            if (block.Count == 0) return;

            foreach (var task in block)
                _tasks.Remove(task);

            targetIndex = Math.Clamp(targetIndex, 0, _tasks.Count);
            for (int i = 0; i < block.Count; i++)
                _tasks.Insert(targetIndex + i, block[i]);

            UpdateHierarchy();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void IndentTask(int taskId)
        {
            var task = _tasks.FirstOrDefault(t => t.Id == taskId);
            if (task == null) return;

            int idx = _tasks.IndexOf(task);
            if (idx <= 0) return;

            var previous = _tasks[idx - 1];
            int maxIndent = previous.IndentLevel + 1;
            if (task.IndentLevel >= maxIndent) return;

            ApplyIndentDelta(taskId, 1);
            UpdateHierarchy();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void OutdentTask(int taskId)
        {
            var task = _tasks.FirstOrDefault(t => t.Id == taskId);
            if (task == null || task.IndentLevel <= 0) return;

            ApplyIndentDelta(taskId, -1);
            UpdateHierarchy();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        private void ApplyIndentDelta(int taskId, int delta)
        {
            int idx = GetTaskIndex(taskId);
            if (idx < 0) return;

            int rootLevel = _tasks[idx].IndentLevel;
            for (int i = idx; i < _tasks.Count; i++)
            {
                if (i > idx && _tasks[i].IndentLevel <= rootLevel) break;
                _tasks[i].IndentLevel = Math.Max(0, _tasks[i].IndentLevel + delta);
            }
        }

        private int GetInsertIndexAfterSubtree(int taskId)
        {
            int idx = GetTaskIndex(taskId);
            if (idx < 0) return _tasks.Count;

            int level = _tasks[idx].IndentLevel;
            int insertIdx = idx + 1;
            while (insertIdx < _tasks.Count && _tasks[insertIdx].IndentLevel > level)
                insertIdx++;
            return insertIdx;
        }

        public IEnumerable<ProjectTask> GetSubtreeTasks(int taskId)
        {
            int idx = GetTaskIndex(taskId);
            if (idx < 0) yield break;

            int level = _tasks[idx].IndentLevel;
            for (int i = idx; i < _tasks.Count; i++)
            {
                if (i > idx && _tasks[i].IndentLevel <= level) yield break;
                yield return _tasks[i];
            }
        }

        public int GetSubtreeTaskCount(int taskId) => GetSubtreeTasks(taskId).Count();

        public bool AddDependency(int predecessorId, int successorId, DependencyType type = DependencyType.FS)
        {
            if (predecessorId == successorId) return false;
            if (_dependencies.Any(d => d.PredecessorId == predecessorId && d.SuccessorId == successorId)) return false;
            if (WouldCreateCycle(predecessorId, successorId)) return false;

            _dependencies.Add(new TaskDependency
            {
                PredecessorId = predecessorId,
                SuccessorId = successorId,
                Type = type
            });

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        public void RemoveDependency(int predecessorId, int successorId)
        {
            _dependencies.RemoveAll(d => d.PredecessorId == predecessorId && d.SuccessorId == successorId);
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public DateTime GetProjectEnd()
        {
            if (!_tasks.Any()) return ProjectStart.AddDays(30);
            return _tasks.Max(t => t.EndDate);
        }

        public int GetTaskIndex(int taskId) => _tasks.FindIndex(t => t.Id == taskId);

        public ProjectTask? GetParent(int taskId)
        {
            int idx = GetTaskIndex(taskId);
            if (idx <= 0) return null;

            int level = _tasks[idx].IndentLevel;
            for (int i = idx - 1; i >= 0; i--)
            {
                if (_tasks[i].IndentLevel < level)
                    return _tasks[i];
            }

            return null;
        }

        public bool HasChildren(int taskId)
        {
            int idx = GetTaskIndex(taskId);
            if (idx < 0 || idx >= _tasks.Count - 1) return false;
            return _tasks[idx + 1].IndentLevel > _tasks[idx].IndentLevel;
        }

        public IEnumerable<ProjectTask> GetDirectChildren(int taskId)
        {
            int idx = GetTaskIndex(taskId);
            if (idx < 0) yield break;

            int parentLevel = _tasks[idx].IndentLevel;
            for (int i = idx + 1; i < _tasks.Count; i++)
            {
                if (_tasks[i].IndentLevel <= parentLevel) yield break;
                if (_tasks[i].IndentLevel == parentLevel + 1)
                    yield return _tasks[i];
            }
        }

        public IEnumerable<ProjectTask> GetAllDescendants(int taskId)
        {
            int idx = GetTaskIndex(taskId);
            if (idx < 0) yield break;

            int parentLevel = _tasks[idx].IndentLevel;
            for (int i = idx + 1; i < _tasks.Count; i++)
            {
                if (_tasks[i].IndentLevel <= parentLevel) yield break;
                yield return _tasks[i];
            }
        }

        public bool IsSummaryTask(int taskId)
        {
            var task = GetTask(taskId);
            return task != null && (task.TaskType == TaskType.Summary || HasChildren(taskId));
        }

        public void ToggleExpanded(int taskId)
        {
            var task = GetTask(taskId);
            if (task == null || !HasChildren(taskId)) return;

            task.IsExpanded = !task.IsExpanded;
            UpdateVisibility();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void UpdateHierarchy()
        {
            if (_isUpdatingHierarchy) return;

            _isUpdatingHierarchy = true;
            try
            {
                UpdateParentLinks();
                UpdateSummaryTypes();
                UpdateSummaryRollups();
                UpdateVisibility();
            }
            finally
            {
                _isUpdatingHierarchy = false;
            }
        }

        private void UpdateParentLinks()
        {
            foreach (var task in _tasks)
                task.ParentId = GetParent(task.Id)?.Id ?? -1;
        }

        private void UpdateSummaryTypes()
        {
            foreach (var task in _tasks)
            {
                if (task.TaskType == TaskType.Milestone) continue;

                if (HasChildren(task.Id))
                    task.TaskType = TaskType.Summary;
                else if (task.TaskType == TaskType.Summary)
                    task.TaskType = TaskType.Normal;
            }
        }

        private void UpdateSummaryRollups()
        {
            if (_tasks.Count == 0) return;

            int maxLevel = _tasks.Max(t => t.IndentLevel);
            for (int level = maxLevel; level >= 0; level--)
            {
                foreach (var task in _tasks.Where(t => t.IndentLevel == level && HasChildren(t.Id)))
                    RollupSummaryTask(task);
            }
        }

        private void RollupSummaryTask(ProjectTask task)
        {
            var descendants = GetAllDescendants(task.Id).ToList();
            if (descendants.Count == 0) return;

            var minStart = descendants.Min(c => c.StartDate);
            var maxEnd = descendants.Max(c => c.EndDate);

            double totalWeight = 0;
            double weightedProgress = 0;
            foreach (var child in descendants.Where(c => c.TaskType != TaskType.Summary))
            {
                double weight = child.TaskType == TaskType.Milestone ? 1 : Math.Max(1, child.DurationDays);
                totalWeight += weight;
                weightedProgress += child.Progress * weight;
            }

            if (totalWeight == 0)
            {
                foreach (var child in GetDirectChildren(task.Id))
                {
                    double weight = child.TaskType == TaskType.Milestone ? 1 : Math.Max(1, child.DurationDays);
                    totalWeight += weight;
                    weightedProgress += child.Progress * weight;
                }
            }

            task.StartDate = minStart;
            task.DurationDays = Math.Max(1, (maxEnd - minStart).Days + 1);
            task.Progress = totalWeight > 0 ? weightedProgress / totalWeight : 0;
        }

        public void UpdateVisibility()
        {
            foreach (var task in _tasks)
            {
                bool visible = true;
                var ancestor = GetParent(task.Id);
                while (ancestor != null)
                {
                    if (!ancestor.IsExpanded)
                    {
                        visible = false;
                        break;
                    }

                    ancestor = GetParent(ancestor.Id);
                }

                task.IsVisible = visible;
            }
        }

        public IEnumerable<ProjectTask> GetVisibleTasks() =>
            _tasks.Where(t => t.IsVisible);

        public ProjectTask? GetTask(int id) => _tasks.FirstOrDefault(t => t.Id == id);

        public IEnumerable<TaskDependency> GetDependenciesForTask(int taskId) =>
            _dependencies.Where(d => d.PredecessorId == taskId || d.SuccessorId == taskId);

        public void CascadeDependencies(int predecessorId)
        {
            var visited = new HashSet<int>();
            CascadeRecursive(predecessorId, visited);
        }

        private void CascadeRecursive(int taskId, HashSet<int> visited)
        {
            if (!visited.Add(taskId)) return;
            var pred = GetTask(taskId);
            if (pred == null) return;

            foreach (var dep in _dependencies.Where(d => d.PredecessorId == taskId))
            {
                var succ = GetTask(dep.SuccessorId);
                if (succ == null || !succ.AutoSchedule) continue;

                DateTime newStart = dep.Type switch
                {
                    DependencyType.FS => pred.EndDate.AddDays(1 + dep.LagDays),
                    DependencyType.FF => pred.EndDate.AddDays(dep.LagDays).AddDays(1 - succ.DurationDays),
                    DependencyType.SS => pred.StartDate.AddDays(dep.LagDays),
                    DependencyType.SF => pred.StartDate.AddDays(dep.LagDays).AddDays(1 - succ.DurationDays),
                    _                 => pred.EndDate.AddDays(1 + dep.LagDays)
                };

                if (newStart > succ.StartDate)
                {
                    succ.StartDate = newStart;
                    CascadeRecursive(succ.Id, visited);
                }
            }
        }

        public void Clear()
        {
            foreach (var t in _tasks) t.PropertyChanged -= Task_PropertyChanged;
            _tasks.Clear();
            _dependencies.Clear();
            _assignments.Clear();
            _nextId = 1;
            IsModified = false;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        internal void Restore(
            IReadOnlyList<ProjectFile.TaskData> tasks,
            IReadOnlyList<ProjectFile.DependencyData> dependencies,
            IReadOnlyList<ProjectFile.AssignmentData> assignments)
        {
            foreach (var t in _tasks) t.PropertyChanged -= Task_PropertyChanged;
            _tasks.Clear();
            _dependencies.Clear();
            _assignments.Clear();

            foreach (var src in tasks)
            {
                var task = new ProjectTask
                {
                    Id = src.Id,
                    ParentId = src.ParentId,
                    Name = src.Name,
                    StartDate = src.StartDate,
                    DurationDays = src.DurationDays,
                    Progress = src.Progress,
                    TaskType = Enum.TryParse<TaskType>(src.TaskType, out var tt) ? tt : TaskType.Normal,
                    IndentLevel = src.IndentLevel,
                    IsExpanded = src.IsExpanded,
                    AssignedTo = src.AssignedTo,
                    Notes = src.Notes,
                    BarColor = src.BarColorArgb.HasValue ? Color.FromArgb(src.BarColorArgb.Value) : Color.Empty,
                    ProgressColor = src.ProgressColorArgb.HasValue ? Color.FromArgb(src.ProgressColorArgb.Value) : Color.Empty,
                    AutoSchedule = src.AutoSchedule,
                    Deliverable = src.Deliverable,
                    IsCritical = src.IsCritical
                };
                task.PropertyChanged += Task_PropertyChanged;
                _tasks.Add(task);
            }

            _nextId = tasks.Count > 0 ? tasks.Max(t => t.Id) + 1 : 1;

            foreach (var dep in dependencies)
            {
                _dependencies.Add(new TaskDependency
                {
                    PredecessorId = dep.PredecessorId,
                    SuccessorId = dep.SuccessorId,
                    Type = Enum.TryParse<DependencyType>(dep.Type, out var dt) ? dt : DependencyType.FS,
                    LagDays = dep.LagDays
                });
            }

            foreach (var assign in assignments)
            {
                _assignments.Add(new ResourceAssignment
                {
                    TaskId = assign.TaskId,
                    ResourceName = assign.ResourceName,
                    AllocationPercent = assign.AllocationPercent
                });
            }

            UpdateHierarchy();
            IsModified = false;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public static ProjectModel CreateTemplate()
        {
            var model = new ProjectModel { ProjectName = "Template Project" };
            var t1 = model.AddTask("Project Planning");
            t1.DurationDays = 10;

            var t2 = model.AddTask("Requirements Analysis");
            t2.IndentLevel = 1;
            t2.DurationDays = 5;
            t2.Progress = 100;

            var t3 = model.AddTask("System Design");
            t3.IndentLevel = 1;
            t3.DurationDays = 5;
            t3.StartDate = DateTime.Today.AddDays(5);
            t3.Progress = 60;

            var t4 = model.AddTask("Development");
            t4.DurationDays = 20;
            t4.StartDate = DateTime.Today.AddDays(10);

            var t5 = model.AddTask("Frontend Implementation");
            t5.IndentLevel = 1;
            t5.DurationDays = 12;
            t5.StartDate = DateTime.Today.AddDays(10);

            var t5a = model.AddTask("UI Design");
            t5a.IndentLevel = 2;
            t5a.DurationDays = 4;
            t5a.StartDate = DateTime.Today.AddDays(10);
            t5a.Progress = 100;

            var t5b = model.AddTask("UI Development");
            t5b.IndentLevel = 2;
            t5b.DurationDays = 8;
            t5b.StartDate = DateTime.Today.AddDays(14);
            t5b.Progress = 40;

            var t6 = model.AddTask("Backend Implementation");
            t6.IndentLevel = 1;
            t6.DurationDays = 15;
            t6.StartDate = DateTime.Today.AddDays(10);

            var t6a = model.AddTask("API Design");
            t6a.IndentLevel = 2;
            t6a.DurationDays = 5;
            t6a.StartDate = DateTime.Today.AddDays(10);
            t6a.Progress = 80;

            var t6b = model.AddTask("API Implementation");
            t6b.IndentLevel = 2;
            t6b.DurationDays = 10;
            t6b.StartDate = DateTime.Today.AddDays(15);
            t6b.Progress = 25;

            var t6b1 = model.AddTask("Authentication Module");
            t6b1.IndentLevel = 3;
            t6b1.DurationDays = 4;
            t6b1.StartDate = DateTime.Today.AddDays(15);

            var t6b2 = model.AddTask("Data Access Layer");
            t6b2.IndentLevel = 3;
            t6b2.DurationDays = 6;
            t6b2.StartDate = DateTime.Today.AddDays(19);

            var t7 = model.AddTask("Integration & Testing");
            t7.DurationDays = 8;
            t7.StartDate = DateTime.Today.AddDays(30);

            var t8 = model.AddTask("Release");
            t8.TaskType = TaskType.Milestone;
            t8.StartDate = DateTime.Today.AddDays(38);

            model.AddDependency(t2.Id, t3.Id);
            model.AddDependency(t1.Id, t4.Id);
            model.AddDependency(t5a.Id, t5b.Id);
            model.AddDependency(t6a.Id, t6b.Id);
            model.AddDependency(t6b1.Id, t6b2.Id);
            model.AddDependency(t4.Id, t7.Id);
            model.AddDependency(t7.Id, t8.Id);

            model.UpdateHierarchy();
            model.IsModified = false;
            return model;
        }

        private bool WouldCreateCycle(int from, int to)
        {
            var visited = new HashSet<int>();
            var stack = new Queue<int>();
            stack.Enqueue(to);

            while (stack.Count > 0)
            {
                int current = stack.Dequeue();
                if (current == from) return true;
                if (visited.Contains(current)) continue;
                visited.Add(current);

                foreach (var dep in _dependencies.Where(d => d.PredecessorId == current))
                    stack.Enqueue(dep.SuccessorId);
            }
            return false;
        }

        private void Task_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (_isUpdatingHierarchy) return;

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);

            if (e.PropertyName is nameof(ProjectTask.StartDate) or nameof(ProjectTask.DurationDays)
                or nameof(ProjectTask.Progress) or nameof(ProjectTask.IndentLevel)
                or nameof(ProjectTask.TaskType))
            {
                UpdateHierarchy();
            }
        }
    }
}
