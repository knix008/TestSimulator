using System.Text.Json;

namespace VNCServer.Settings;

public class SettingsProfileManager
{
    private static string ProfilesDirectory => 
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), 
                     "VNCServer", "Profiles");

    public static void SaveProfile(string profileName, ServerSettings settings)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(profileName))
            {
                throw new ArgumentException("프로필 이름을 입력해주세요.");
            }

            if (!Directory.Exists(ProfilesDirectory))
            {
                Directory.CreateDirectory(ProfilesDirectory);
            }

            var profilePath = GetProfilePath(profileName);
            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions 
            { 
                WriteIndented = true 
            });
            File.WriteAllText(profilePath, json);
        }
        catch (Exception ex)
        {
            throw new Exception($"프로필 저장 실패: {ex.Message}");
        }
    }

    public static ServerSettings LoadProfile(string profileName)
    {
        try
        {
            var profilePath = GetProfilePath(profileName);
            if (!File.Exists(profilePath))
            {
                throw new FileNotFoundException($"프로필 '{profileName}'을(를) 찾을 수 없습니다.");
            }

            var json = File.ReadAllText(profilePath);
            return JsonSerializer.Deserialize<ServerSettings>(json) ?? new ServerSettings();
        }
        catch (Exception ex)
        {
            throw new Exception($"프로필 불러오기 실패: {ex.Message}");
        }
    }

    public static void DeleteProfile(string profileName)
    {
        try
        {
            var profilePath = GetProfilePath(profileName);
            if (File.Exists(profilePath))
            {
                File.Delete(profilePath);
            }
        }
        catch (Exception ex)
        {
            throw new Exception($"프로필 삭제 실패: {ex.Message}");
        }
    }

    public static List<string> GetProfileNames()
    {
        try
        {
            if (!Directory.Exists(ProfilesDirectory))
            {
                return new List<string>();
            }

            return Directory.GetFiles(ProfilesDirectory, "*.json")
                .Select(Path.GetFileNameWithoutExtension)
                .Where(name => !string.IsNullOrEmpty(name))
                .Select(name => name!)
                .OrderBy(name => name)
                .ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    public static bool ProfileExists(string profileName)
    {
        return File.Exists(GetProfilePath(profileName));
    }

    private static string GetProfilePath(string profileName)
    {
        // 파일명에 사용할 수 없는 문자 제거
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitizedName = string.Concat(profileName.Select(c => invalidChars.Contains(c) ? '_' : c));
        return Path.Combine(ProfilesDirectory, $"{sanitizedName}.json");
    }
}
