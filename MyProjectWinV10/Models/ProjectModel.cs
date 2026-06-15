using MyProject.Theme;
using MyProject.Rendering;
using System.ComponentModel;
using System.Text;
using System.Text.RegularExpressions;

namespace MyProject.Models
{
    public class ProjectModel
    {
        private int _nextId = 1;
        private readonly List<ProjectTask> _tasks = new();
        private readonly List<TaskDependency> _dependencies = new();
        private readonly List<ResourceAssignment> _assignments = new();
        private readonly Dictionary<int, string> _pendingResourceAllocEdits = new();
        private readonly List<ProjectNote> _notes = new();
        private int _nextNoteId = 1;
        private bool _isUpdatingHierarchy;
        private bool _isCascadingSchedule;
        private bool _suppressModificationTracking;
        private HashSet<int> _criticalTaskIds = new();
        private HashSet<(int PredecessorId, int SuccessorId)> _criticalDependencies = new();
        private List<TaskDependency> _criticalPathLinks = new();

        public string ProjectName { get; set; } = "New Project";

        public void SetProjectName(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return;

            name = name.Trim();
            if (ProjectName == name)
                return;

            ProjectName = name;
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public DateTime ProjectStart { get; set; } = DateTime.Today;
        public ProjectViewSettings ViewSettings { get; set; } = ProjectViewSettings.CreateDefault();
        public string FilePath { get; set; } = "";
        public bool IsModified { get; set; } = false;

        public IReadOnlyList<ProjectTask> Tasks => _tasks.AsReadOnly();
        public IReadOnlyList<TaskDependency> Dependencies => _dependencies.AsReadOnly();
        public IReadOnlyList<ResourceAssignment> Assignments => _assignments.AsReadOnly();
        public IReadOnlyList<ProjectNote> Notes => _notes.AsReadOnly();

        public ProjectNote? GetNote(int noteId) => _notes.FirstOrDefault(n => n.Id == noteId);

        public IEnumerable<ProjectNote> GetNotesForTask(int taskId) =>
            _notes.Where(n => n.TaskId == taskId);

        public ProjectNote AddNote(int taskId = -1, string title = "New Note", string? body = null)
        {
            var task = taskId >= 0 ? GetTask(taskId) : null;
            DateTime anchor = task != null ? task.EndDate.AddDays(1) : DateTime.Today;
            int contentY = task != null ? GetDefaultContentYForTask(taskId) : AppTheme.TimescaleHeaderHeight;
            return AddNoteAt(taskId, anchor, contentY, title, body);
        }

        public ProjectNote AddNoteAt(
            int taskId,
            DateTime anchorDate,
            int contentY,
            string title = "New Note",
            string? body = null)
        {
            var note = new ProjectNote
            {
                Id = _nextNoteId++,
                Title = title,
                TaskId = taskId,
                AnchorDate = anchorDate.Date,
                ContentY = contentY
            };
            if (body != null)
                note.Body = body;

            _notes.Add(note);

            if (taskId >= 0)
                SyncTaskNotesFromLinkedNote(taskId);

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return note;
        }

        public void RemoveNote(int noteId)
        {
            var note = GetNote(noteId);
            if (note == null)
                return;

            int taskId = note.TaskId;
            _notes.Remove(note);

            if (taskId >= 0)
            {
                var task = GetTask(taskId);
                if (task != null)
                    task.Notes = GetNotesForTask(taskId).FirstOrDefault()?.Body ?? "";
            }

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void SetNotePosition(int noteId, DateTime anchorDate, int contentY)
        {
            var note = GetNote(noteId);
            if (note == null)
                return;

            note.AnchorDate = anchorDate.Date;
            note.ContentY = contentY;
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void UpdateNoteBody(int noteId, string body)
        {
            var note = GetNote(noteId);
            if (note == null)
                return;

            note.Body = body ?? "";
            note.BodyRtf = "";

            if (note.TaskId >= 0)
                SyncTaskNotesFromLinkedNote(note.TaskId);

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void UpdateNoteRtf(int noteId, string rtf)
        {
            var note = GetNote(noteId);
            if (note == null)
                return;

            note.BodyRtf = rtf ?? "";
            note.Body = NoteRtfHelper.GetPlainText(note.BodyRtf, note.Body);

            if (note.TaskId >= 0)
                SyncTaskNotesFromLinkedNote(note.TaskId);

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void UpdateNoteTitle(int noteId, string title)
        {
            var note = GetNote(noteId);
            if (note == null)
                return;

            note.Title = title ?? "";
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public void LinkNoteToTask(int noteId, int taskId)
        {
            var note = GetNote(noteId);
            if (note == null)
                return;

            int previousTaskId = note.TaskId;
            note.TaskId = taskId;

            if (previousTaskId >= 0 && previousTaskId != taskId)
            {
                var prevTask = GetTask(previousTaskId);
                if (prevTask != null)
                    prevTask.Notes = GetNotesForTask(previousTaskId).FirstOrDefault()?.Body ?? "";
            }

            if (taskId >= 0)
                SyncTaskNotesFromLinkedNote(taskId);

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        private void SyncTaskNotesFromLinkedNote(int taskId)
        {
            var task = GetTask(taskId);
            if (task == null)
                return;

            var linked = GetNotesForTask(taskId).FirstOrDefault();
            if (linked != null)
                task.Notes = linked.Body;
        }

        private void MigrateLegacyTaskNotes()
        {
            foreach (var task in _tasks)
            {
                if (string.IsNullOrWhiteSpace(task.Notes))
                    continue;

                if (GetNotesForTask(task.Id).Any())
                    continue;

                var note = new ProjectNote
                {
                    Id = _nextNoteId++,
                    Title = task.Name,
                    Body = task.Notes,
                    TaskId = task.Id,
                    AnchorDate = task.EndDate.AddDays(1),
                    ContentY = GetDefaultContentYForTask(task.Id)
                };
                _notes.Add(note);
            }
        }

        private int GetDefaultContentYForTask(int taskId)
        {
            var visible = GetVisibleTasks().ToList();
            int idx = visible.FindIndex(t => t.Id == taskId);
            if (idx < 0)
                return AppTheme.TimescaleHeaderHeight;

            return AppTheme.TimescaleHeaderHeight + idx * AppTheme.RowHeight;
        }

        public bool IsDependencyOnCriticalPath(int predecessorId, int successorId) =>
            _criticalDependencies.Contains((predecessorId, successorId))
            || _criticalPathLinks.Any(d => d.PredecessorId == predecessorId && d.SuccessorId == successorId);

        public bool IsDependencyOnCriticalPath(TaskDependency dependency)
        {
            if (IsDependencyOnCriticalPath(dependency.PredecessorId, dependency.SuccessorId))
                return true;

            foreach (var link in _criticalPathLinks)
            {
                if (IsTaskInSubtree(link.PredecessorId, dependency.PredecessorId)
                    && IsTaskInSubtree(link.SuccessorId, dependency.SuccessorId))
                    return true;
            }

            return false;
        }

        public IReadOnlyList<TaskDependency> CriticalPathLinks => _criticalPathLinks;

        private bool IsTaskInSubtree(int taskId, int ancestorId)
        {
            if (taskId == ancestorId)
                return true;

            var task = GetTask(taskId);
            while (task != null)
            {
                if (task.Id == ancestorId)
                    return true;
                if (task.ParentId < 0)
                    break;
                task = GetTask(task.ParentId);
            }

            return false;
        }

        public bool SetDependencyLag(int predecessorId, int successorId, int lagDays)
        {
            var dep = _dependencies.FirstOrDefault(d =>
                d.PredecessorId == predecessorId && d.SuccessorId == successorId);
            if (dep == null)
                return false;

            if (dep.LagDays == lagDays)
                return true;

            dep.LagDays = lagDays;
            ApplyDependencyScheduling(predecessorId);
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        public bool SetDependencyLineEnds(int predecessorId, int successorId, DependencyLineEnd startLineEnd, DependencyLineEnd endLineEnd)
        {
            var dep = _dependencies.FirstOrDefault(d =>
                d.PredecessorId == predecessorId && d.SuccessorId == successorId);
            if (dep == null)
                return false;

            if (dep.StartLineEnd == startLineEnd && dep.EndLineEnd == endLineEnd)
                return true;

            dep.StartLineEnd = startLineEnd;
            dep.EndLineEnd = endLineEnd;
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        public IEnumerable<ResourceAssignment> GetAssignments(int taskId) =>
            _assignments.Where(a => a.TaskId == taskId);

        public bool AddAssignment(int taskId, string resourceName, double percent) =>
            TryAddAssignment(taskId, resourceName, percent, out _);

        public bool TryAddAssignment(int taskId, string resourceName, double percent, out string? errorMessage)
        {
            errorMessage = null;
            if (percent <= 0)
            {
                errorMessage = "Allocation must be greater than 0%.";
                return false;
            }

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
                    FormatResourceEditLine(a.ResourceName, a.AllocationPercent)));
            }

            return GetTask(taskId)?.AssignedTo ?? "";
        }

        public string GetTaskResourceEditText(int taskId)
        {
            var assignments = GetAssignments(taskId).ToList();
            if (assignments.Count > 0)
                return string.Join(Environment.NewLine, assignments.Select(a =>
                    FormatResourceEditLine(a.ResourceName, a.AllocationPercent)));

            return GetTask(taskId)?.AssignedTo ?? "";
        }

        public string GetTaskResourceNamesEditText(int taskId)
        {
            var assignments = GetAssignments(taskId).ToList();
            if (assignments.Count > 0)
                return string.Join(Environment.NewLine, assignments.Select(a => a.ResourceName));

            return GetLegacyResourceNameLines(taskId);
        }

        public string GetTaskResourceAllocEditText(int taskId)
        {
            var assignments = GetAssignments(taskId).ToList();
            if (assignments.Count > 0)
                return string.Join(Environment.NewLine, assignments.Select(a => a.AllocationPercent.ToString("0")));

            if (_pendingResourceAllocEdits.TryGetValue(taskId, out string? pending))
                return pending;

            int nameCount = GetLegacyResourceNameLines(taskId)
                .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Length;
            if (nameCount == 0)
                return "";

            return string.Join(Environment.NewLine, Enumerable.Repeat("100", nameCount));
        }

        public IReadOnlyList<string> GetPendingResourceAllocDisplayLines(int taskId)
        {
            if (!_pendingResourceAllocEdits.TryGetValue(taskId, out string? pending))
                return Array.Empty<string>();

            return SplitNonEmptyLines(pending)
                .Select(line => TryParseAllocationNumber(line, out double pct)
                    ? FormatResourceAllocationDisplay(pct)
                    : line)
                .ToList();
        }

        public bool TrySetTaskResourcesFromColumns(int taskId, string namesText, string allocsText, out string? errorMessage)
        {
            errorMessage = null;
            var nameLines = SplitNonEmptyLines(namesText);
            var allocLines = SplitNonEmptyLines(allocsText);
            if (nameLines.Count == 0)
            {
                if (allocLines.Count > 0)
                {
                    _pendingResourceAllocEdits[taskId] = allocsText.TrimEnd();
                    IsModified = true;
                    ModelChanged?.Invoke(this, EventArgs.Empty);
                    return true;
                }

                _pendingResourceAllocEdits.Remove(taskId);
                return TrySetTaskResourcesFromText(taskId, "", out errorMessage);
            }

            var effectiveAllocLines = allocLines;
            if (effectiveAllocLines.Count == 0
                && _pendingResourceAllocEdits.TryGetValue(taskId, out string? pending))
            {
                effectiveAllocLines = SplitNonEmptyLines(pending);
            }

            var combined = new StringBuilder();
            for (int i = 0; i < nameLines.Count; i++)
            {
                double percent = 100;
                if (i < effectiveAllocLines.Count && TryParseAllocationNumber(effectiveAllocLines[i], out double parsed))
                    percent = parsed;

                if (combined.Length > 0)
                    combined.AppendLine();
                combined.Append($"{nameLines[i]} {percent:0}");
            }

            _pendingResourceAllocEdits.Remove(taskId);
            return TrySetTaskResourcesFromText(taskId, combined.ToString(), out errorMessage);
        }

        public void SetTaskResourcesFromColumns(int taskId, string namesText, string allocsText)
        {
            TrySetTaskResourcesFromColumns(taskId, namesText, allocsText, out _);
        }

        public bool TrySetTaskResourcesFromText(int taskId, string text, out string? errorMessage)
        {
            errorMessage = null;
            var task = GetTask(taskId);
            if (task == null)
                return true;

            var lines = text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim())
                .Where(l => l.Length > 0)
                .ToList();

            var parsed = ParseTaskResourceAssignmentLines(lines);
            ApplyTaskResourceAssignments(taskId, lines, parsed);
            return true;
        }

        public void SetTaskResourcesFromText(int taskId, string text)
        {
            TrySetTaskResourcesFromText(taskId, text, out _);
        }

        private void ApplyTaskResourceAssignments(int taskId, List<string> lines, List<(string Name, double Percent)> parsed)
        {
            var task = GetTask(taskId);
            if (task == null)
                return;

            _assignments.RemoveAll(a => a.TaskId == taskId);

            if (parsed.Count > 0)
            {
                foreach (var (name, percent) in parsed)
                {
                    _assignments.Add(new ResourceAssignment
                    {
                        TaskId = taskId,
                        ResourceName = name,
                        AllocationPercent = percent
                    });
                }

                task.AssignedTo = GetTaskAssigneeDisplay(taskId);
            }
            else
            {
                task.AssignedTo = lines.Count == 0 ? "" : string.Join(Environment.NewLine, lines).Trim();
            }

            _pendingResourceAllocEdits.Remove(taskId);

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        private static List<(string Name, double Percent)> ParseTaskResourceAssignmentLines(IEnumerable<string> lines)
        {
            var assignments = new List<(string Name, double Percent)>();
            foreach (var line in lines)
            {
                if (!TryParseResourceLine(line, out string name, out double percent))
                    continue;

                percent = Math.Max(0, percent);
                if (percent <= 0)
                    continue;

                assignments.Add((name, percent));
            }

            return assignments;
        }

        internal static bool TryParseResourceLine(string line, out string name, out double percent)
        {
            name = "";
            percent = 100;

            if (string.IsNullOrWhiteSpace(line))
                return false;

            var parensMatch = Regex.Match(line, @"^(.*?)\s*\((\d+(?:\.\d+)?)%\)\s*$");
            if (parensMatch.Success)
            {
                name = parensMatch.Groups[1].Value.Trim();
                percent = double.Parse(parensMatch.Groups[2].Value);
                return name.Length > 0;
            }

            var suffixMatch = Regex.Match(line, @"^(.*?)\s+(\d+(?:\.\d+)?)%\s*$");
            if (suffixMatch.Success)
            {
                name = suffixMatch.Groups[1].Value.Trim();
                percent = double.Parse(suffixMatch.Groups[2].Value);
                return name.Length > 0;
            }

            var plainNumberMatch = Regex.Match(line, @"^(.*?)\s+(\d+(?:\.\d+)?)\s*$");
            if (plainNumberMatch.Success)
            {
                name = plainNumberMatch.Groups[1].Value.Trim();
                percent = double.Parse(plainNumberMatch.Groups[2].Value);
                return name.Length > 0;
            }

            name = line.Trim();
            return name.Length > 0;
        }

        internal static string FormatResourceEditLine(string name, double percent)
        {
            if (Math.Abs(percent - 100) < 0.01)
                return name;

            return $"{name} ({percent:0}%)";
        }

        internal static string FormatResourceAllocationDisplay(double percent) => $"{percent:0}%";

        internal static string FormatResourceAllocationEditDisplay(double percent) =>
            Math.Abs(percent - 100) < 0.01 ? "" : percent.ToString("0");

        internal static bool TryParseAllocationNumber(string text, out double percent)
        {
            percent = 100;
            if (string.IsNullOrWhiteSpace(text))
                return false;

            text = text.Trim().TrimEnd('%').Trim();
            return double.TryParse(text, out percent);
        }

        private string GetLegacyResourceNameLines(int taskId)
        {
            string assigned = GetTask(taskId)?.AssignedTo ?? "";
            if (string.IsNullOrWhiteSpace(assigned))
                return "";

            var names = new List<string>();
            foreach (var part in assigned.Split(new[] { '\r', '\n', ',' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (TryParseResourceLine(part, out string name, out _))
                    names.Add(name);
            }

            return string.Join(Environment.NewLine, names);
        }

        private static List<string> SplitNonEmptyLines(string text) =>
            text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim())
                .Where(l => l.Length > 0)
                .ToList();

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
            foreach (int id in removedIds)
                _pendingResourceAllocEdits.Remove(id);
            _notes.RemoveAll(n => removedIds.Contains(n.TaskId));

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
            if (WouldCreateCycle(predecessorId, successorId)) return false;

            var existing = _dependencies.FirstOrDefault(d =>
                d.PredecessorId == predecessorId && d.SuccessorId == successorId);
            if (existing != null)
                return SetDependencyType(predecessorId, successorId, type);

            _dependencies.Add(new TaskDependency
            {
                PredecessorId = predecessorId,
                SuccessorId = successorId,
                Type = type,
                StartLineEnd = ViewSettings.DefaultDependencyStartLineEnd,
                EndLineEnd = ViewSettings.DefaultDependencyEndLineEnd
            });

            ApplyDependencyScheduling(predecessorId);
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        public bool SetDependencyType(int predecessorId, int successorId, DependencyType type)
        {
            var dep = _dependencies.FirstOrDefault(d =>
                d.PredecessorId == predecessorId && d.SuccessorId == successorId);
            if (dep == null) return false;
            if (dep.Type == type) return true;

            dep.Type = type;
            ApplyDependencyScheduling(predecessorId);
            ModelChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }

        public void NotifyViewsChanged() => ModelChanged?.Invoke(this, EventArgs.Empty);

        public void RemoveDependency(int predecessorId, int successorId)
        {
            if (_dependencies.RemoveAll(d => d.PredecessorId == predecessorId && d.SuccessorId == successorId) == 0)
                return;

            UpdateHierarchy();
            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        public DateTime GetProjectEnd()
        {
            if (!_tasks.Any()) return ProjectStart.AddDays(30);
            return _tasks.Max(t => t.EndDate);
        }

        /// <summary>Gantt horizontal scroll origin: one day before the earliest-starting task.</summary>
        public DateTime GetTimelineScrollOrigin()
        {
            if (_tasks.Count == 0)
                return ProjectStart.Date.AddDays(-1);

            return _tasks.Min(t => t.StartDate.Date).AddDays(-1);
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
                UpdateCriticalPath();
            }
            finally
            {
                _isUpdatingHierarchy = false;
            }
        }

        private void UpdateCriticalPath()
        {
            var result = CriticalPathCalculator.Compute(_tasks, _dependencies, ProjectStart);
            _criticalTaskIds = result.CriticalTaskIds;
            _criticalDependencies = result.CriticalDependencies;
            _criticalPathLinks = result.CriticalLinks;

            // Each top-level summary group gets its own local critical path so that
            // tasks driving their group's completion are highlighted even when their
            // group ends before the global project finish and has no cross-group links.
            foreach (var id in CriticalPathCalculator.ComputeLocalCriticalTaskIds(
                _tasks, _dependencies, ProjectStart))
                _criticalTaskIds.Add(id);

            foreach (var task in _tasks)
            {
                if (task.TaskType == TaskType.Summary)
                    task.IsCritical = GetAllDescendants(task.Id).Any(d => _criticalTaskIds.Contains(d.Id));
                else
                    task.IsCritical = _criticalTaskIds.Contains(task.Id);
            }
        }

        public bool IsTaskOnCriticalPath(int taskId) => _criticalTaskIds.Contains(taskId);

        private static readonly Color[] BandColorPalette =
        {
            Color.FromArgb(226, 240, 255),  // blue
            Color.FromArgb(225, 247, 225),  // green
            Color.FromArgb(255, 249, 215),  // yellow
            Color.FromArgb(242, 228, 255),  // purple
            Color.FromArgb(255, 233, 215),  // peach
            Color.FromArgb(255, 228, 238),  // pink
            Color.FromArgb(218, 245, 242),  // teal
            Color.FromArgb(243, 238, 255),  // lavender
        };

        /// <summary>
        /// Returns the row-band color for a task's top-level group. Uses the root task's explicit
        /// BandColor if set, otherwise picks from the pastel palette by root-task position.
        /// </summary>
        public Color GetTaskBandColor(int taskId)
        {
            var task = GetTask(taskId);
            if (task == null) return Color.Empty;

            // Walk up to root
            var root = task;
            while (root.ParentId >= 0)
            {
                var parent = GetTask(root.ParentId);
                if (parent == null) break;
                root = parent;
            }

            if (!root.BandColor.IsEmpty)
                return root.BandColor;

            // Auto-assign from palette by position among root tasks
            var rootTasks = _tasks.Where(t => t.ParentId == -1).ToList();
            int idx = rootTasks.IndexOf(root);
            return idx < 0 ? Color.Empty : BandColorPalette[idx % BandColorPalette.Length];
        }

        private void ApplyDependencyScheduling(int predecessorId)
        {
            if (_isCascadingSchedule)
                return;

            _isCascadingSchedule = true;
            try
            {
                CascadeDependencies(predecessorId);
                UpdateHierarchy();
            }
            finally
            {
                _isCascadingSchedule = false;
            }
        }

        private void ApplySchedulingOnLoad()
        {
            foreach (var dep in _dependencies)
                CascadeDependencies(dep.PredecessorId);
            UpdateHierarchy();
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
            _pendingResourceAllocEdits.Clear();
            _notes.Clear();
            _nextNoteId = 1;
            _nextId = 1;
            _criticalTaskIds.Clear();
            _criticalDependencies.Clear();
            _criticalPathLinks.Clear();
            IsModified = false;
            ModelChanged?.Invoke(this, EventArgs.Empty);
        }

        internal void Restore(
            IReadOnlyList<ProjectFile.TaskData> tasks,
            IReadOnlyList<ProjectFile.DependencyData> dependencies,
            IReadOnlyList<ProjectFile.AssignmentData> assignments,
            IReadOnlyList<ProjectFile.NoteData>? notes = null)
        {
            _suppressModificationTracking = true;
            try
            {
            foreach (var t in _tasks) t.PropertyChanged -= Task_PropertyChanged;
            _tasks.Clear();
            _dependencies.Clear();
            _assignments.Clear();
            _pendingResourceAllocEdits.Clear();
            _notes.Clear();

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
                    BandColor = src.BandColorArgb.HasValue ? Color.FromArgb(src.BandColorArgb.Value) : Color.Empty,
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
                    LagDays = dep.LagDays,
                    StartLineEnd = DependencyLineEndInfo.Parse(dep.StartLineEnd, DependencyLineEnd.None),
                    EndLineEnd = DependencyLineEndInfo.Parse(dep.EndLineEnd, DependencyLineEnd.Arrow)
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

            if (notes != null)
            {
                foreach (var nd in notes)
                {
                    _notes.Add(new ProjectNote
                    {
                        Id = nd.Id,
                        Title = nd.Title,
                        Body = nd.Body,
                        BodyRtf = nd.BodyRtf ?? "",
                        TaskId = nd.TaskId,
                        OffsetDays = nd.OffsetDays,
                        AnchorDate = nd.AnchorDate == default ? DateTime.Today : nd.AnchorDate,
                        ContentY = nd.ContentY
                    });
                }

                _nextNoteId = _notes.Count > 0 ? _notes.Max(n => n.Id) + 1 : 1;
            }

            MigrateLegacyTaskNotes();
            ApplySchedulingOnLoad();
            IsModified = false;
            ModelChanged?.Invoke(this, EventArgs.Empty);
            }
            finally
            {
                _suppressModificationTracking = false;
            }
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

            model.AddNoteAt(
                -1,
                DateTime.Today,
                AppTheme.TimescaleHeaderHeight + 8,
                "Getting started",
                "This template shows tasks, dependencies, and notes on the Gantt chart. Select a note to edit it in the properties panel.");

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
            if (_isUpdatingHierarchy || _suppressModificationTracking)
                return;

            if (e.PropertyName is nameof(ProjectTask.IsCritical) or nameof(ProjectTask.IsVisible))
                return;

            IsModified = true;
            ModelChanged?.Invoke(this, EventArgs.Empty);

            if (e.PropertyName is nameof(ProjectTask.StartDate) or nameof(ProjectTask.DurationDays))
            {
                if (sender is ProjectTask task && !_isCascadingSchedule)
                    ApplyDependencyScheduling(task.Id);
                else
                    UpdateHierarchy();
            }
            else if (e.PropertyName is nameof(ProjectTask.Progress) or nameof(ProjectTask.IndentLevel)
                or nameof(ProjectTask.TaskType) or nameof(ProjectTask.BarColor)
                or nameof(ProjectTask.ProgressColor))
            {
                UpdateHierarchy();
            }
            else if (e.PropertyName == nameof(ProjectTask.Notes) && sender is ProjectTask task)
            {
                SyncProjectNoteFromTaskNotes(task);
            }
        }

        private void SyncProjectNoteFromTaskNotes(ProjectTask task)
        {
            var linked = GetNotesForTask(task.Id).FirstOrDefault();
            if (linked != null)
            {
                linked.Body = task.Notes;
                linked.BodyRtf = "";
            }
            else if (!string.IsNullOrWhiteSpace(task.Notes))
                AddNote(task.Id, task.Name, task.Notes);
        }
    }
}
