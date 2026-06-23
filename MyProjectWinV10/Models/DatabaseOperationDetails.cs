using System.Text;

namespace MyProject.Models
{
    public sealed class DatabaseSaveResult
    {
        public long Version { get; init; }
        public DateTime UpdatedUtc { get; init; }
        public string? UpdatedBy { get; init; }
        public string ScheduleName { get; init; } = "";
        public int TaskCount { get; init; }
        public int DependencyCount { get; init; }
        public int NoteCount { get; init; }
    }

    public static class DatabaseOperationDetails
    {
        public static string FormatConnectionTarget(DatabaseConnectionProfile profile)
        {
            profile.ApplyDefaultPort();
            if (profile.Provider == DatabaseProviderKind.Sqlite)
                return profile.Database;

            return $"{profile.Server}:{profile.Port}/{profile.Database}";
        }

        public static string FormatConnectionDetails(DatabaseConnectionProfile profile)
        {
            profile.ApplyDefaultPort();
            var sb = new StringBuilder();
            sb.AppendLine($"Profile: {profile.Name}");
            sb.AppendLine($"Provider: {DatabaseProviderInfo.GetDisplayName(profile.Provider)}");

            if (profile.Provider == DatabaseProviderKind.Sqlite)
            {
                sb.AppendLine($"Database file: {profile.Database}");
            }
            else
            {
                sb.AppendLine($"Server: {profile.Server}:{profile.Port}");
                sb.AppendLine($"Database: {profile.Database}");
                if (!string.IsNullOrWhiteSpace(profile.UserName))
                    sb.AppendLine($"User: {profile.UserName}");
            }

            return sb.ToString().TrimEnd();
        }

        public static string FormatConnectionSavedDetails(DatabaseConnectionProfile profile, bool databaseCreated = false)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.AppendLine("The profile was saved to local application settings.");
            if (databaseCreated)
                sb.AppendLine("A new database was created on the server.");
            sb.AppendLine("The MyProject database schema is ready.");
            sb.Append("Tables: mp_projects, mp_tasks, mp_dependencies, mp_assignments, mp_notes");
            return sb.ToString();
        }

        public static string FormatConnectionTestSuccess(DatabaseConnectionProfile profile, bool databaseCreated = false)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            if (databaseCreated)
                sb.AppendLine("Result: The database was created and the connection opened successfully.");
            else
                sb.Append("Result: The database connection opened successfully.");
            return sb.ToString();
        }

        public static string FormatSchemaSuccess(DatabaseConnectionProfile profile, bool databaseCreated = false)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            if (databaseCreated)
                sb.AppendLine("Result: The database was created and MyProject tables are ready.");
            else
                sb.AppendLine("Result: MyProject database schema is ready.");
            sb.Append("Tables: mp_projects, mp_tasks, mp_dependencies, mp_assignments, mp_notes");
            return sb.ToString();
        }

        public static string FormatScheduleListDetails(DatabaseConnectionProfile profile, int scheduleCount)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.Append($"Schedules found: {scheduleCount}");
            return sb.ToString();
        }

        public static string FormatOpenDetails(
            DatabaseConnectionProfile profile,
            ProjectModel model,
            bool newlyCreated = false)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.AppendLine($"Schedule ID: #{model.DatabaseProjectId}");
            sb.AppendLine($"Display name: {model.ProjectName}");
            sb.AppendLine($"Tasks: {model.Tasks.Count}");
            sb.AppendLine($"Dependencies: {model.Dependencies.Count}");
            sb.AppendLine($"Notes: {model.Notes.Count}");
            sb.AppendLine($"Project start: {model.ProjectStart:yyyy-MM-dd}");
            if (newlyCreated)
                sb.Append("Status: New shared schedule created and opened.");
            else
                sb.Append("Status: Shared schedule loaded from the database.");
            return sb.ToString();
        }

        public static string FormatEditorDisplayName(string? updatedBy)
        {
            if (string.IsNullOrWhiteSpace(updatedBy))
                return "Unknown user";

            return updatedBy.Trim();
        }

        public static string FormatSyncUpdateSummary(
            string scheduleName,
            DatabaseScheduleRevision? revision,
            bool autoSync)
        {
            string editor = FormatEditorDisplayName(revision?.UpdatedBy);
            string version = revision?.Version.ToString() ?? "?";
            string savedAt = revision == null
                ? "unknown time"
                : revision.UpdatedUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm");

            if (autoSync)
            {
                return $"{editor} updated the shared schedule \"{scheduleName}\" " +
                       $"(version {version}, {savedAt}).\n\n" +
                       "Your view was refreshed with the changes listed below.";
            }

            return $"The shared schedule \"{scheduleName}\" was updated from the database.\n\n" +
                   $"Last saved by {editor} (version {version}, {savedAt}).\n\n" +
                   "These changes were applied:";
        }

        public static string FormatSyncChangeDetails(
            DatabaseConnectionProfile profile,
            DatabaseScheduleRevision? revision,
            ScheduleSyncChangeReport report,
            string scheduleName)
        {
            var sb = new StringBuilder();
            sb.AppendLine(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.AppendLine($"Schedule: {scheduleName}");
            if (revision != null)
            {
                sb.AppendLine($"Schedule ID: #{revision.ProjectId}");
                sb.AppendLine($"Version: {revision.Version}");
                sb.AppendLine($"Saved by: {FormatEditorDisplayName(revision.UpdatedBy)}");
                sb.AppendLine($"Saved (UTC): {revision.UpdatedUtc:yyyy-MM-dd HH:mm:ss}");
            }

            sb.AppendLine();
            sb.AppendLine("--- Changes ---");
            sb.Append(report.FormatDetails());
            return sb.ToString().TrimEnd();
        }

        public static string FormatSaveDetails(
            DatabaseConnectionProfile profile,
            ProjectModel model,
            DatabaseSaveResult result)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.AppendLine($"Schedule ID: #{model.DatabaseProjectId}");
            sb.AppendLine($"Display name: {model.ProjectName}");
            if (!string.Equals(model.ProjectName, result.ScheduleName, StringComparison.Ordinal))
                sb.AppendLine($"Database schedule name: {result.ScheduleName}");
            sb.AppendLine($"Tasks saved: {result.TaskCount}");
            sb.AppendLine($"Dependencies saved: {result.DependencyCount}");
            sb.AppendLine($"Notes saved: {result.NoteCount}");
            sb.AppendLine($"Version: {result.Version}");
            sb.AppendLine($"Saved by: {FormatEditorDisplayName(result.UpdatedBy)}");
            sb.Append($"Saved (UTC): {result.UpdatedUtc:yyyy-MM-dd HH:mm:ss}");
            return sb.ToString();
        }

        public static string FormatCreateDetails(
            DatabaseConnectionProfile profile,
            string scheduleName,
            int scheduleId)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.AppendLine($"Schedule name: {scheduleName}");
            sb.AppendLine($"Schedule ID: #{scheduleId}");
            sb.Append("Status: New shared schedule created in the database.");
            return sb.ToString();
        }

        public static string FormatFetchDetails(
            DatabaseConnectionProfile profile,
            ProjectModel model,
            int scheduleId,
            string scheduleName,
            bool refreshedCurrentSchedule)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.AppendLine($"Schedule ID: #{scheduleId}");
            sb.AppendLine($"Database schedule name: {scheduleName}");
            sb.AppendLine($"Display name kept: {model.ProjectName}");
            sb.AppendLine($"Tasks: {model.Tasks.Count}");
            sb.AppendLine($"Dependencies: {model.Dependencies.Count}");
            sb.AppendLine($"Notes: {model.Notes.Count}");
            sb.AppendLine($"Project start: {model.ProjectStart:yyyy-MM-dd}");
            if (refreshedCurrentSchedule)
                sb.Append("Status: Current shared schedule refreshed from the database.");
            else if (model.IsDatabaseProject)
                sb.Append("Status: Shared schedule data fetched into the current project.");
            else
                sb.Append("Status: Shared schedule data fetched into the local project.");
            return sb.ToString();
        }

        public static string FormatFailureSummary(DatabaseConnectionProfile profile, string action)
        {
            string provider = DatabaseProviderInfo.GetDisplayName(profile.Provider);
            string target = FormatConnectionTarget(profile);
            return $"Could not {action} using profile \"{profile.Name}\" ({provider}) at {target}.";
        }

        public static string FormatFailureDetails(DatabaseConnectionProfile profile, string errorDetails)
        {
            var sb = new StringBuilder(FormatConnectionDetails(profile));
            sb.AppendLine();
            sb.AppendLine("--- Error ---");
            sb.Append(errorDetails);
            return sb.ToString();
        }
    }
}
