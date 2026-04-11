using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using YOLO26V10.yolo26;

namespace YOLO26V10
{
    /// <summary>
    /// ONNX 변환용 Python·pip 의존성을 점검하고, 부족 시 팝업으로 설치를 제안합니다.
    /// </summary>
    internal static class PythonExportDependencyUi
    {
        /// <summary>다이얼로그·로그용 점검 결과 요약 텍스트.</summary>
        public static string FormatDependencyReport(PythonExportDependencyResult r)
        {
            switch (r.Issue)
            {
                case PythonExportIssue.None:
                    return "상태: 준비됨" + Environment.NewLine + Environment.NewLine +
                           "Python 3와 ONNX 변환에 필요한 패키지(ultralytics, onnx)를 사용할 수 있습니다.";
                case PythonExportIssue.ExportSupportFilesMissing:
                    return "상태: 파일 없음" + Environment.NewLine + Environment.NewLine +
                           (r.DetailMessage ?? "");
                case PythonExportIssue.PythonInterpreterNotFound:
                    return "상태: Python 없음" + Environment.NewLine + Environment.NewLine +
                           "Python 3를 PATH에서 찾을 수 없습니다." + Environment.NewLine + Environment.NewLine +
                           "• python.org 설치 시 PATH 추가" + Environment.NewLine +
                           "• tools\\setup-python.ps1 실행" + Environment.NewLine + Environment.NewLine +
                           "requirements 파일: " + (r.RequirementsFilePath ?? "(없음)");
                case PythonExportIssue.PipPackagesMissing:
                    return "상태: 패키지 부족" + Environment.NewLine + Environment.NewLine +
                           BuildPackageSummary(r.RequirementsFilePath) + Environment.NewLine + Environment.NewLine +
                           "[패키지 설치]로 pip install -r requirements-export.txt 를 실행할 수 있습니다.";
                default:
                    return "알 수 없는 상태입니다.";
            }
        }

        /// <summary>
        /// 변환에 필요한 Python 환경이 갖춰질 때까지 처리합니다. 취소·거부 시 false.
        /// </summary>
        public static async Task<bool> EnsureReadyAsync(
            IWin32Window owner,
            IProgress<string> log,
            CancellationToken cancellationToken)
        {
            var r = await Task.Run(() => Yolo26ModelPreparer.EvaluatePythonExportDependencies(), cancellationToken)
                .ConfigureAwait(true);

            if (r.Issue == PythonExportIssue.None)
                return true;

            if (r.Issue == PythonExportIssue.ExportSupportFilesMissing)
            {
                MessageBox.Show(
                    owner,
                    "ONNX 변환에 필요한 파일이 없습니다.\n\n" + r.DetailMessage,
                    "ONNX 변환",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return false;
            }

            if (r.Issue == PythonExportIssue.PythonInterpreterNotFound)
            {
                MessageBox.Show(
                    owner,
                    "Python 3를 찾을 수 없습니다. ONNX 변환에는 Python이 필요합니다.\n\n" +
                    "• python.org 에서 설치 시 PATH 추가를 선택하거나\n" +
                    "• 출력 폴더의 tools\\setup-python.ps1 을 실행해 보세요.",
                    "Python 필요",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return false;
            }

            if (r.Issue != PythonExportIssue.PipPackagesMissing)
                return false;

            var summary = BuildPackageSummary(r.RequirementsFilePath);
            var ask =
                "다음 Python 패키지가 필요합니다.\n\n" +
                summary +
                "\n\npip으로 지금 설치하시겠습니까?\n(인터넷 연결이 필요하며, 최초에는 수 분 걸릴 수 있습니다.)";

            var dr = MessageBox.Show(
                owner,
                ask,
                "Python 패키지 설치",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question,
                MessageBoxDefaultButton.Button1);

            if (dr != DialogResult.Yes)
                return false;

            log?.Report("pip install -r requirements-export.txt 실행 중...");
            var ok = await Task.Run(
                    () => Yolo26ModelPreparer.InstallPythonExportRequirements(
                        r.PythonExecutable,
                        r.PythonPrefixArguments,
                        r.RequirementsFilePath,
                        log,
                        cancellationToken),
                    cancellationToken)
                .ConfigureAwait(true);

            if (!ok)
            {
                MessageBox.Show(
                    owner,
                    "pip 설치가 실패했습니다.\n\n" +
                    "관리자 권한이 필요한 환경일 수 있습니다. PowerShell에서 tools\\setup-python.ps1 을 실행해 보세요.",
                    "Python 패키지 설치",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return false;
            }

            var again = await Task.Run(() => Yolo26ModelPreparer.EvaluatePythonExportDependencies(), cancellationToken)
                .ConfigureAwait(true);
            if (again.Issue != PythonExportIssue.None)
            {
                MessageBox.Show(
                    owner,
                    "설치 후에도 필요한 패키지를 확인하지 못했습니다. Python 환경(가상환경·PATH)을 확인해 주세요.",
                    "Python 패키지",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return false;
            }

            return true;
        }

        private static string BuildPackageSummary(string requirementsPath)
        {
            var sb = new StringBuilder();
            sb.AppendLine("• requirements-export.txt 기준:");
            try
            {
                if (File.Exists(requirementsPath))
                {
                    foreach (var line in File.ReadAllLines(requirementsPath))
                    {
                        var t = line.Trim();
                        if (t.Length == 0 || t.StartsWith("#", StringComparison.Ordinal))
                            continue;
                        sb.AppendLine("  - " + t);
                    }
                }
                else
                {
                    sb.AppendLine("  (파일을 읽을 수 없음)");
                }
            }
            catch
            {
                sb.AppendLine("  ultralytics, onnx 등");
            }

            return sb.ToString().TrimEnd();
        }
    }
}
