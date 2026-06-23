namespace MyProject.Models
{
    public sealed class ProjectStorageInfo
    {
        public ProjectStorageKind Kind { get; init; } = ProjectStorageKind.LocalFile;
        public string LocalFilePath { get; init; } = "";
        public string DatabaseProfileId { get; init; } = "";
        public int DatabaseProjectId { get; init; }

        public static ProjectStorageInfo ForLocalFile(string path) => new()
        {
            Kind = ProjectStorageKind.LocalFile,
            LocalFilePath = path
        };

        public static ProjectStorageInfo ForDatabase(string profileId, int projectId) => new()
        {
            Kind = ProjectStorageKind.Database,
            DatabaseProfileId = profileId,
            DatabaseProjectId = projectId
        };

        public string GetDisplayLocation(DatabaseConnectionProfile? profile = null)
        {
            if (Kind == ProjectStorageKind.LocalFile)
                return string.IsNullOrWhiteSpace(LocalFilePath) ? "Local (unsaved)" : LocalFilePath;

            string server = profile?.Name ?? DatabaseProfileId;
            return $"Shared schedule: {server} / #{DatabaseProjectId}";
        }
    }
}
