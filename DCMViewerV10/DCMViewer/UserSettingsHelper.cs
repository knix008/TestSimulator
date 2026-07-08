namespace DCMViewer;

internal static class UserSettingsHelper
{
    private static string SettingsDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DCMViewer");

    private static string LastDirectoryFilePath =>
        Path.Combine(SettingsDirectory, "last_directory.txt");

    public static string? LoadLastDirectory()
    {
        try
        {
            if (!File.Exists(LastDirectoryFilePath))
                return null;

            var path = File.ReadAllText(LastDirectoryFilePath).Trim();
            return Directory.Exists(path) ? path : null;
        }
        catch
        {
            return null;
        }
    }

    public static string DefaultDirectory()
    {
        var picturesDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
        if (Directory.Exists(picturesDirectory))
            return picturesDirectory;

        return Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    }

    public static string GetWorkingDirectory() => LoadLastDirectory() ?? DefaultDirectory();

    public static void SaveLastDirectory(string directoryPath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(directoryPath) || !Directory.Exists(directoryPath))
                return;

            Directory.CreateDirectory(SettingsDirectory);
            File.WriteAllText(LastDirectoryFilePath, Path.GetFullPath(directoryPath));
        }
        catch
        {
            // Ignore persistence failures.
        }
    }
}
