using System.Diagnostics;
using System.Text;

namespace YOLO26BrainV20.Services;

internal static class PythonOnnxExportRunner
{
    internal static string? FindPythonLauncher()
    {
        var explicitExe = Environment.GetEnvironmentVariable("YOLO26_PYTHON");
        if (!string.IsNullOrWhiteSpace(explicitExe) && File.Exists(explicitExe))
            return explicitExe;

        foreach (var name in new[] { "py.exe", "python.exe", "python3.exe" })
        {
            var hit = FindOnPath(name);
            if (hit != null)
                return hit;
        }

        return null;
    }

    internal static bool IsWindowsPyLauncher(string path) =>
        string.Equals(Path.GetFileNameWithoutExtension(path), "py", StringComparison.OrdinalIgnoreCase);

    internal static async Task<(bool Ok, string Log)> RunExportAsync(
        string pythonExe,
        string scriptPath,
        string weightsPath,
        string outputOnnxPath,
        int opset,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(scriptPath))
            return (false, $"스크립트를 찾을 수 없습니다: {scriptPath}");

        var args = new StringBuilder();
        if (IsWindowsPyLauncher(pythonExe))
            args.Append("-3 ");

        args.Append('"').Append(scriptPath).Append("\" --weights \"")
            .Append(weightsPath).Append("\" --out \"")
            .Append(outputOnnxPath).Append("\" --opset ").Append(opset);

        var psi = new ProcessStartInfo
        {
            FileName = pythonExe,
            Arguments = args.ToString(),
            WorkingDirectory = Path.GetDirectoryName(scriptPath) ?? ".",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        try
        {
            using var proc = Process.Start(psi);
            if (proc == null)
                return (false, "프로세스를 시작할 수 없습니다.");

            var stdoutTask = proc.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = proc.StandardError.ReadToEndAsync(cancellationToken);
            await proc.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            var stdout = await stdoutTask.ConfigureAwait(false);
            var stderr = await stderrTask.ConfigureAwait(false);

            var log = new StringBuilder();
            if (stdout.Length > 0)
            {
                log.AppendLine("[stdout]");
                log.AppendLine(stdout.TrimEnd());
            }

            if (stderr.Length > 0)
            {
                log.AppendLine("[stderr]");
                log.AppendLine(stderr.TrimEnd());
            }

            if (proc.ExitCode != 0)
                return (false, $"종료 코드 {proc.ExitCode}\n{log}");

            if (!File.Exists(outputOnnxPath))
                return (false, "변환은 끝났으나 출력 ONNX 파일이 없습니다.\n" + log);

            return (true, log.Length > 0 ? log.ToString() : "완료.");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    private static string? FindOnPath(string fileName)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrEmpty(pathEnv))
            return null;

        foreach (var piece in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var full = Path.Combine(piece.Trim(), fileName);
            if (File.Exists(full))
                return full;
        }

        return null;
    }
}
