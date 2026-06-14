using System.Text;
using MPXJ.Net;
using MpxjProjectFile = MPXJ.Net.ProjectFile;

namespace MyProject.Models
{
    public static class MsProjectInterop
    {
        public const string ImportFileFilter =
            "All Supported Projects|*.myprj;*.mpp;*.xml;*.mpx;*.mpt|" +
            $"MyProject (*.{ProjectFile.Extension})|*.{ProjectFile.Extension}|" +
            "Microsoft Project (*.mpp;*.mpt)|*.mpp;*.mpt|" +
            "Microsoft Project XML (*.xml)|*.xml|" +
            "Microsoft Project MPX (*.mpx)|*.mpx|" +
            "All Files (*.*)|*.*";

        public const string ExportXmlFilter = "Microsoft Project XML (*.xml)|*.xml";
        public const string ExportMpxFilter = "Microsoft Project MPX (*.mpx)|*.mpx";

        public static bool CanImport(string path)
        {
            var ext = Path.GetExtension(path);
            if (string.IsNullOrEmpty(ext))
                return false;

            return ext.Equals($".{ProjectFile.Extension}", StringComparison.OrdinalIgnoreCase)
                || ext.Equals(".mpp", StringComparison.OrdinalIgnoreCase)
                || ext.Equals(".mpt", StringComparison.OrdinalIgnoreCase)
                || ext.Equals(".xml", StringComparison.OrdinalIgnoreCase)
                || ext.Equals(".mpx", StringComparison.OrdinalIgnoreCase);
        }

        public static ProjectModel Load(string path)
        {
            var ext = Path.GetExtension(path);
            if (ext.Equals($".{ProjectFile.Extension}", StringComparison.OrdinalIgnoreCase))
                return ProjectFile.Load(path);

            if (!File.Exists(path))
                throw new FileNotFoundException("Project file not found.", path);

            var mpxjProject = new UniversalProjectReader().Read(path);
            return FromMpxjProject(mpxjProject, path);
        }

        public static void Export(ProjectModel model, string path, MsProjectExportFormat format)
        {
            var mpxjProject = ToMpxjProject(model);
            var fileFormat = format == MsProjectExportFormat.Mpx ? FileFormat.MPX : FileFormat.MSPDI;
            new UniversalProjectWriter(fileFormat).Write(mpxjProject, path);
        }

        private static ProjectModel FromMpxjProject(MpxjProjectFile mpxjProject, string path)
        {
            var props = mpxjProject.ProjectProperties;
            string projectName = string.IsNullOrWhiteSpace(props.ProjectTitle)
                ? Path.GetFileNameWithoutExtension(path)
                : props.ProjectTitle.Trim();

            DateTime projectStart = props.StartDate ?? DateTime.Today;

            var orderedMpxjTasks = new List<MPXJ.Net.Task>();
            CollectTasksInHierarchy(mpxjProject, orderedMpxjTasks);

            var tasks = new List<ProjectFile.TaskData>();
            var idByUniqueId = new Dictionary<int, int>();
            var indentStack = new List<int>();
            int nextId = 1;

            foreach (var mpxjTask in orderedMpxjTasks)
            {
                int outlineLevel = Math.Max(1, mpxjTask.OutlineLevel ?? 1);
                int indentLevel = outlineLevel - 1;

                while (indentStack.Count > indentLevel)
                    indentStack.RemoveAt(indentStack.Count - 1);

                int ourId = nextId++;
                int parentId = indentLevel > 0 && indentStack.Count > indentLevel - 1
                    ? indentStack[indentLevel - 1]
                    : -1;

                if (indentStack.Count == indentLevel)
                    indentStack.Add(ourId);
                else
                    indentStack[indentLevel] = ourId;

                DateTime startDate = mpxjTask.Start ?? projectStart;
                int durationDays = GetDurationDays(mpxjTask);
                bool isMilestone = mpxjTask.Milestone == true || durationDays <= 0;
                bool isSummary = mpxjTask.Summary == true;

                string taskType = isMilestone ? nameof(TaskType.Milestone)
                    : isSummary ? nameof(TaskType.Summary)
                    : nameof(TaskType.Normal);

                string notes = mpxjTask.Notes ?? "";
                string assignedTo = "";

                idByUniqueId[mpxjTask.UniqueID ?? mpxjTask.ID ?? ourId] = ourId;

                tasks.Add(new ProjectFile.TaskData
                {
                    Id = ourId,
                    ParentId = parentId,
                    Name = string.IsNullOrWhiteSpace(mpxjTask.Name) ? $"Task {ourId}" : mpxjTask.Name.Trim(),
                    StartDate = startDate.Date,
                    DurationDays = isMilestone ? 0 : Math.Max(1, durationDays),
                    Progress = Math.Clamp(mpxjTask.PercentageComplete ?? 0.0, 0.0, 100.0),
                    TaskType = taskType,
                    IndentLevel = indentLevel,
                    IsExpanded = true,
                    AssignedTo = assignedTo,
                    Notes = notes,
                    AutoSchedule = true,
                    Deliverable = GetTaskText(mpxjTask, 1) ?? ""
                });
            }

            var dependencies = new List<ProjectFile.DependencyData>();
            foreach (var mpxjTask in orderedMpxjTasks)
            {
                int? successorUnique = mpxjTask.UniqueID ?? mpxjTask.ID;
                if (successorUnique == null || !idByUniqueId.TryGetValue(successorUnique.Value, out int successorId))
                    continue;

                foreach (var relation in mpxjTask.Predecessors)
                {
                    var predTask = relation.PredecessorTask;
                    if (predTask == null)
                        continue;

                    int? predUnique = predTask.UniqueID ?? predTask.ID;
                    if (predUnique == null || !idByUniqueId.TryGetValue(predUnique.Value, out int predecessorId))
                        continue;

                    dependencies.Add(new ProjectFile.DependencyData
                    {
                        PredecessorId = predecessorId,
                        SuccessorId = successorId,
                        Type = MapRelationType(relation.Type).ToString(),
                        LagDays = GetLagDays(relation)
                    });
                }
            }

            var assignments = new List<ProjectFile.AssignmentData>();
            var resourceNamesByTask = new Dictionary<int, List<string>>();

            foreach (var assignment in mpxjProject.ResourceAssignments)
            {
                var mpxjTask = assignment.Task;
                var resource = assignment.Resource;
                if (mpxjTask == null || resource == null)
                    continue;

                int? taskUnique = mpxjTask.UniqueID ?? mpxjTask.ID;
                if (taskUnique == null || !idByUniqueId.TryGetValue(taskUnique.Value, out int taskId))
                    continue;

                string resourceName = string.IsNullOrWhiteSpace(resource.Name)
                    ? $"Resource {resource.UniqueID}"
                    : resource.Name.Trim();

                double units = assignment.Units ?? 100.0;
                assignments.Add(new ProjectFile.AssignmentData
                {
                    TaskId = taskId,
                    ResourceName = resourceName,
                    AllocationPercent = Math.Clamp(units, 0, 100)
                });

                if (!resourceNamesByTask.TryGetValue(taskId, out var names))
                {
                    names = new List<string>();
                    resourceNamesByTask[taskId] = names;
                }
                names.Add(resourceName);
            }

            foreach (var task in tasks)
            {
                if (resourceNamesByTask.TryGetValue(task.Id, out var names))
                    task.AssignedTo = string.Join(", ", names.Distinct());
            }

            var model = new ProjectModel
            {
                ProjectName = projectName,
                ProjectStart = projectStart.Date,
                ViewSettings = ProjectViewSettings.CreateDefault(),
                FilePath = path,
                IsModified = false
            };

            model.Restore(tasks, dependencies, assignments, notes: null);
            return model;
        }

        private static MpxjProjectFile ToMpxjProject(ProjectModel model)
        {
            var file = new MpxjProjectFile();
            file.AddDefaultBaseCalendar();

            var props = file.ProjectProperties;
            props.StartDate = model.ProjectStart;
            props.ProjectTitle = model.ProjectName;
            props.Name = model.ProjectName;

            var customField = file.CustomFields.GetOrCreate(TaskField.Text1);
            customField.Alias = "Deliverable";

            var mpxjTaskById = new Dictionary<int, MPXJ.Net.Task>();
            var parentStack = new List<MPXJ.Net.Task?>();

            foreach (var task in model.Tasks)
            {
                int level = Math.Max(0, task.IndentLevel);

                while (parentStack.Count > level)
                    parentStack.RemoveAt(parentStack.Count - 1);

                MPXJ.Net.Task mpxjTask;
                if (level == 0)
                {
                    mpxjTask = file.AddTask();
                    parentStack.Clear();
                }
                else
                {
                    var parent = parentStack[level - 1];
                    mpxjTask = parent != null ? parent.AddTask() : file.AddTask();
                }

                while (parentStack.Count <= level)
                    parentStack.Add(null);
                parentStack[level] = mpxjTask;

                mpxjTask.Name = task.Name;
                mpxjTask.Start = task.StartDate;

                if (task.TaskType == TaskType.Milestone)
                {
                    mpxjTask.Duration = Duration.GetInstance(0, TimeUnit.Days);
                    mpxjTask.Milestone = true;
                }
                else
                {
                    int days = Math.Max(1, task.DurationDays);
                    mpxjTask.Duration = Duration.GetInstance(days, TimeUnit.Days);
                }

                mpxjTask.PercentageComplete = Math.Clamp(task.Progress, 0.0, 100.0);
                if (task.Progress > 0)
                    mpxjTask.ActualStart = task.StartDate;

                if (!string.IsNullOrWhiteSpace(task.Notes))
                    mpxjTask.Notes = task.Notes;

                if (!string.IsNullOrWhiteSpace(task.Deliverable))
                    mpxjTask.SetText(1, task.Deliverable);

                mpxjTaskById[task.Id] = mpxjTask;
            }

            foreach (var dep in model.Dependencies)
            {
                var successor = mpxjTaskById.GetValueOrDefault(dep.SuccessorId);
                var predecessor = mpxjTaskById.GetValueOrDefault(dep.PredecessorId);
                if (successor == null || predecessor == null)
                    continue;

                var builder = new Relation.Builder(file)
                    .PredecessorTask(predecessor)
                    .Type(MapDependencyType(dep.Type));

                if (dep.LagDays != 0)
                    builder.Lag(Duration.GetInstance(dep.LagDays, TimeUnit.Days));

                successor.AddPredecessor(builder);
            }

            var resourceByName = new Dictionary<string, Resource>(StringComparer.OrdinalIgnoreCase);
            foreach (var assignment in model.Assignments)
            {
                if (string.IsNullOrWhiteSpace(assignment.ResourceName))
                    continue;

                var mpxjTask = mpxjTaskById.GetValueOrDefault(assignment.TaskId);
                if (mpxjTask == null)
                    continue;

                if (!resourceByName.TryGetValue(assignment.ResourceName, out var resource))
                {
                    resource = file.AddResource();
                    resource.Name = assignment.ResourceName;
                    resourceByName[assignment.ResourceName] = resource;
                }

                var mpxjAssignment = mpxjTask.AddResourceAssignment(resource);
                mpxjAssignment.Units = Math.Clamp(assignment.AllocationPercent, 0, 100);
                mpxjAssignment.Start = mpxjTask.Start;
            }

            return file;
        }

        private static void CollectTasksInHierarchy(MpxjProjectFile project, List<MPXJ.Net.Task> result)
        {
            foreach (var task in project.ChildTasks)
            {
                CollectTaskSubtree(task, result);
            }
        }

        private static void CollectTaskSubtree(MPXJ.Net.Task task, List<MPXJ.Net.Task> result)
        {
            result.Add(task);
            foreach (var child in task.ChildTasks)
                CollectTaskSubtree(child, result);
        }

        private static int GetDurationDays(MPXJ.Net.Task task)
        {
            var duration = task.Duration;
            if (duration == null)
                return task.Milestone == true ? 0 : 1;

            double value = duration.DurationValue;
            var units = duration.Units ?? TimeUnit.Days;
            if (units == TimeUnit.Hours)
                return Math.Max(1, (int)Math.Ceiling(value / 8.0));
            if (units == TimeUnit.Minutes)
                return Math.Max(1, (int)Math.Ceiling(value / 480.0));
            return Math.Max(task.Milestone == true ? 0 : 1, (int)Math.Round(value, MidpointRounding.AwayFromZero));
        }

        private static int GetLagDays(Relation relation)
        {
            var lag = relation.Lag;
            if (lag == null)
                return 0;

            double value = lag.DurationValue;
            var units = lag.Units ?? TimeUnit.Days;
            if (units == TimeUnit.Hours)
                return (int)Math.Round(value / 8.0, MidpointRounding.AwayFromZero);
            if (units == TimeUnit.Minutes)
                return (int)Math.Round(value / 480.0, MidpointRounding.AwayFromZero);
            return (int)Math.Round(value, MidpointRounding.AwayFromZero);
        }

        private static string? GetTaskText(MPXJ.Net.Task task, int textFieldIndex)
        {
            try
            {
                return task.GetText(textFieldIndex);
            }
            catch
            {
                return null;
            }
        }

        private static DependencyType MapRelationType(RelationType? type)
        {
            if (type == null)
                return DependencyType.FS;

            return type switch
            {
                RelationType.FinishFinish => DependencyType.FF,
                RelationType.StartStart => DependencyType.SS,
                RelationType.StartFinish => DependencyType.SF,
                _ => DependencyType.FS
            };
        }

        private static RelationType MapDependencyType(DependencyType type) => type switch
        {
            DependencyType.FF => RelationType.FinishFinish,
            DependencyType.SS => RelationType.StartStart,
            DependencyType.SF => RelationType.StartFinish,
            _ => RelationType.FinishStart
        };
    }

    public enum MsProjectExportFormat
    {
        Xml,
        Mpx
    }
}
