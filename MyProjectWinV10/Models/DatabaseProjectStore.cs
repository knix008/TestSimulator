using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyProject.Data;

namespace MyProject.Models
{
    /// <summary>
    /// Persists shared schedule content (tasks, dependencies, assignments, notes) in the database.
    /// Project settings and view layout remain local via <see cref="ScheduleLocalStore"/>.
    /// </summary>
    public static class DatabaseProjectStore
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public static IReadOnlyList<DatabaseProjectSummary> ListProjects(DatabaseConnectionProfile profile)
        {
            DatabaseConnectionFactory.EnsureSchema(profile);
            using var context = DatabaseConnectionFactory.CreateContext(profile);
            return context.Projects
                .AsNoTracking()
                .OrderByDescending(p => p.UpdatedUtc)
                .Select(p => new DatabaseProjectSummary
                {
                    Id = p.Id,
                    Name = p.Name,
                    UpdatedUtc = p.UpdatedUtc,
                    Version = p.Version
                })
                .ToList();
        }

        public static DatabaseScheduleRevision? TryGetScheduleRevision(
            DatabaseConnectionProfile profile,
            int projectId)
        {
            DatabaseConnectionFactory.EnsureSchema(profile);
            using var context = DatabaseConnectionFactory.CreateContext(profile);
            var record = context.Projects
                .AsNoTracking()
                .Where(p => p.Id == projectId)
                .Select(p => new { p.Id, p.Version, p.UpdatedUtc, p.UpdatedBy })
                .FirstOrDefault();

            if (record == null)
                return null;

            return new DatabaseScheduleRevision
            {
                ProjectId = record.Id,
                Version = record.Version,
                UpdatedUtc = record.UpdatedUtc,
                UpdatedBy = record.UpdatedBy
            };
        }

        public static int CreateProject(DatabaseConnectionProfile profile, string scheduleName)
        {
            if (string.IsNullOrWhiteSpace(scheduleName))
                throw new ArgumentException("Schedule name is required.", nameof(scheduleName));

            DatabaseConnectionFactory.EnsureSchema(profile);
            var template = ProjectModel.CreateTemplate();
            var scheduleData = ProjectFile.ExportScheduleContentData(template);

            using var context = DatabaseConnectionFactory.CreateContext(profile);
            var now = DateTime.UtcNow;
            string editor = AppSettings.GetDatabaseEditorName();
            var record = new DbProjectRecord
            {
                Name = scheduleName.Trim(),
                ProjectStart = template.ProjectStart,
                WorkingDaysJson = SerializeWorkingDays(template.WorkingWeek.ToDayFlags()),
                UpdatedUtc = now,
                Version = 1,
                UpdatedBy = editor
            };

            context.Projects.Add(record);
            context.SaveChanges();

            ReplaceChildRows(context, record.Id, scheduleData);
            context.SaveChanges();
            return record.Id;
        }

        public static ProjectModel LoadProject(DatabaseConnectionProfile profile, int projectId)
        {
            DatabaseConnectionFactory.EnsureSchema(profile);
            using var context = DatabaseConnectionFactory.CreateContext(profile);
            var record = context.Projects
                .AsNoTracking()
                .Include(p => p.Tasks)
                .Include(p => p.Dependencies)
                .Include(p => p.Assignments)
                .Include(p => p.Notes)
                .FirstOrDefault(p => p.Id == projectId)
                ?? throw new InvalidOperationException($"Shared schedule #{projectId} was not found.");

            var data = ToScheduleFileData(record);
            var model = ProjectFile.ImportData(data, ProjectStorageInfo.ForDatabase(profile.Id, projectId));
            ScheduleLocalStore.ApplyLocalOverlay(model);
            return model;
        }

        internal static ProjectFile.ProjectFileData LoadScheduleData(DatabaseConnectionProfile profile, int projectId)
        {
            DatabaseConnectionFactory.EnsureSchema(profile);
            using var context = DatabaseConnectionFactory.CreateContext(profile);
            var record = context.Projects
                .AsNoTracking()
                .Include(p => p.Tasks)
                .Include(p => p.Dependencies)
                .Include(p => p.Assignments)
                .Include(p => p.Notes)
                .FirstOrDefault(p => p.Id == projectId)
                ?? throw new InvalidOperationException($"Shared schedule #{projectId} was not found.");

            return ToScheduleFileData(record);
        }

        public static void SaveProject(DatabaseConnectionProfile profile, ProjectModel model) =>
            SaveProjectWithResult(profile, model);

        public static DatabaseSaveResult SaveProjectWithResult(DatabaseConnectionProfile profile, ProjectModel model)
        {
            if (!model.IsDatabaseProject || model.DatabaseProjectId <= 0)
                throw new InvalidOperationException("The project is not linked to a shared schedule.");

            var result = SaveScheduleTo(profile, model.DatabaseProjectId, model);
            ScheduleLocalStore.Save(model);
            return result;
        }

        public static DatabaseSaveResult SaveScheduleTo(
            DatabaseConnectionProfile profile,
            int projectId,
            ProjectModel source)
        {
            DatabaseConnectionFactory.EnsureSchema(profile);
            using var context = DatabaseConnectionFactory.CreateContext(profile);
            var record = context.Projects.FirstOrDefault(p => p.Id == projectId)
                ?? throw new InvalidOperationException($"Shared schedule #{projectId} was not found.");

            var scheduleData = ProjectFile.ExportScheduleContentData(source);
            string editor = AppSettings.GetDatabaseEditorName();
            record.UpdatedUtc = DateTime.UtcNow;
            record.Version++;
            record.UpdatedBy = editor;

            ReplaceChildRows(context, record.Id, scheduleData);
            context.SaveChanges();

            return new DatabaseSaveResult
            {
                Version = record.Version,
                UpdatedUtc = record.UpdatedUtc,
                UpdatedBy = editor,
                ScheduleName = record.Name,
                TaskCount = scheduleData.Tasks.Count,
                DependencyCount = scheduleData.Dependencies.Count,
                NoteCount = scheduleData.Notes.Count
            };
        }

        private static void ReplaceChildRows(ProjectDbContext context, int projectId, ProjectFile.ProjectFileData data)
        {
            context.Tasks.RemoveRange(context.Tasks.Where(t => t.ProjectId == projectId));
            context.Dependencies.RemoveRange(context.Dependencies.Where(d => d.ProjectId == projectId));
            context.Assignments.RemoveRange(context.Assignments.Where(a => a.ProjectId == projectId));
            context.Notes.RemoveRange(context.Notes.Where(n => n.ProjectId == projectId));

            foreach (var task in data.Tasks)
            {
                context.Tasks.Add(new DbTaskRecord
                {
                    ProjectId = projectId,
                    TaskId = task.Id,
                    ParentId = task.ParentId,
                    Name = task.Name,
                    StartDate = task.StartDate,
                    DurationDays = task.DurationDays,
                    Progress = task.Progress,
                    TaskType = task.TaskType,
                    IndentLevel = task.IndentLevel,
                    IsExpanded = task.IsExpanded,
                    AssignedTo = task.AssignedTo,
                    Notes = task.Notes,
                    BarColorArgb = task.BarColorArgb,
                    ProgressColorArgb = task.ProgressColorArgb,
                    BandColorArgb = task.BandColorArgb,
                    AutoSchedule = task.AutoSchedule,
                    Deliverable = task.Deliverable,
                    IsCritical = task.IsCritical,
                    SummaryBarStyle = task.SummaryBarStyle
                });
            }

            foreach (var dep in data.Dependencies)
            {
                context.Dependencies.Add(new DbDependencyRecord
                {
                    ProjectId = projectId,
                    PredecessorId = dep.PredecessorId,
                    SuccessorId = dep.SuccessorId,
                    Type = dep.Type,
                    LagDays = dep.LagDays,
                    StartLineEnd = dep.StartLineEnd,
                    EndLineEnd = dep.EndLineEnd
                });
            }

            foreach (var assignment in data.Assignments)
            {
                context.Assignments.Add(new DbAssignmentRecord
                {
                    ProjectId = projectId,
                    TaskId = assignment.TaskId,
                    ResourceName = assignment.ResourceName,
                    AllocationPercent = assignment.AllocationPercent
                });
            }

            foreach (var note in data.Notes)
            {
                context.Notes.Add(new DbNoteRecord
                {
                    ProjectId = projectId,
                    NoteId = note.Id,
                    Title = note.Title,
                    Body = note.Body,
                    BodyRtf = note.BodyRtf,
                    TaskId = note.TaskId,
                    OffsetDays = note.OffsetDays,
                    AnchorDate = note.AnchorDate,
                    ContentY = note.ContentY,
                    ContentX = note.ContentX
                });
            }
        }

        private static ProjectFile.ProjectFileData ToScheduleFileData(DbProjectRecord record)
        {
            return new ProjectFile.ProjectFileData
            {
                Version = 1,
                ProjectName = record.Name,
                Settings = null,
                Tasks = record.Tasks.Select(t => new ProjectFile.TaskData
                {
                    Id = t.TaskId,
                    ParentId = t.ParentId,
                    Name = t.Name,
                    StartDate = t.StartDate,
                    DurationDays = t.DurationDays,
                    Progress = t.Progress,
                    TaskType = t.TaskType,
                    IndentLevel = t.IndentLevel,
                    IsExpanded = t.IsExpanded,
                    AssignedTo = t.AssignedTo,
                    Notes = t.Notes,
                    BarColorArgb = t.BarColorArgb,
                    ProgressColorArgb = t.ProgressColorArgb,
                    BandColorArgb = t.BandColorArgb,
                    AutoSchedule = t.AutoSchedule,
                    Deliverable = t.Deliverable,
                    IsCritical = t.IsCritical,
                    SummaryBarStyle = t.SummaryBarStyle
                }).ToList(),
                Dependencies = record.Dependencies.Select(d => new ProjectFile.DependencyData
                {
                    PredecessorId = d.PredecessorId,
                    SuccessorId = d.SuccessorId,
                    Type = d.Type,
                    LagDays = d.LagDays,
                    StartLineEnd = d.StartLineEnd,
                    EndLineEnd = d.EndLineEnd
                }).ToList(),
                Assignments = record.Assignments.Select(a => new ProjectFile.AssignmentData
                {
                    TaskId = a.TaskId,
                    ResourceName = a.ResourceName,
                    AllocationPercent = a.AllocationPercent
                }).ToList(),
                Notes = record.Notes.Select(n => new ProjectFile.NoteData
                {
                    Id = n.NoteId,
                    Title = n.Title,
                    Body = n.Body,
                    BodyRtf = n.BodyRtf,
                    TaskId = n.TaskId,
                    OffsetDays = n.OffsetDays,
                    AnchorDate = n.AnchorDate,
                    ContentY = n.ContentY,
                    ContentX = n.ContentX
                }).ToList()
            };
        }

        private static string SerializeWorkingDays(bool[]? workingDays) =>
            JsonSerializer.Serialize(workingDays ?? Array.Empty<bool>(), JsonOptions);

        private static bool[]? DeserializeWorkingDays(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return null;

            return JsonSerializer.Deserialize<bool[]>(json, JsonOptions);
        }
    }
}
