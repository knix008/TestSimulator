using System.Diagnostics;

namespace PandocWinV2._0
{
    internal sealed class DependencyForm : Form
    {
        // ----------------------------------------------------------------
        // 의존성 목록
        // (이름, 필수 여부, 용도, 다운로드 URL, 버전 확인 인수)
        // ----------------------------------------------------------------
        private static readonly (string Name, bool Required, string Purpose, string Url, string VersionArg)[] Dependencies =
        [
            ("pandoc",
             true,
             "문서 변환 엔진 (필수)",
             "https://pandoc.org/installing.html",
             "--version"),

            ("xelatex",
             false,
             "PDF 변환용 LaTeX 엔진 · 한글 지원 (MiKTeX / TeX Live 포함)",
             "https://miktex.org/download",
             "--version"),

            ("lualatex",
             false,
             "PDF 변환용 LaTeX 엔진 (MiKTeX / TeX Live 포함)",
             "https://miktex.org/download",
             "--version"),

            ("pdflatex",
             false,
             "PDF 변환용 LaTeX 엔진 (MiKTeX / TeX Live 포함)",
             "https://miktex.org/download",
             "--version"),

            ("wkhtmltopdf",
             false,
             "PDF 변환용 HTML 기반 엔진 (LaTeX 불필요)",
             "https://wkhtmltopdf.org/downloads.html",
             "--version"),
        ];

        // ----------------------------------------------------------------
        // 컨트롤
        // ----------------------------------------------------------------
        private readonly ListView   listView;
        private readonly Label      lblSummary;
        private readonly Label      lblHint;
        private readonly Button     btnRefresh;
        private readonly Button     btnClose;
        private readonly ProgressBar progressBar;

        // ----------------------------------------------------------------
        // 생성자
        // ----------------------------------------------------------------
        public DependencyForm()
        {
            Text            = "의존성 확인";
            Size            = new Size(730, 430);
            MinimumSize     = new Size(730, 430);
            MaximumSize     = new Size(730, 430);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition   = FormStartPosition.CenterParent;
            MaximizeBox     = false;
            MinimizeBox     = false;

            listView = new ListView
            {
                Location      = new Point(12, 12),
                Size          = new Size(694, 265),
                View          = View.Details,
                FullRowSelect = true,
                GridLines     = true,
                HideSelection = false,
            };
            listView.Columns.Add("패키지",    110);
            listView.Columns.Add("필수 여부",  80);
            listView.Columns.Add("상태",       75);
            listView.Columns.Add("버전",       135);
            listView.Columns.Add("용도",       280);
            listView.DoubleClick += ListView_DoubleClick;

            progressBar = new ProgressBar
            {
                Location  = new Point(12, 286),
                Size      = new Size(694, 16),
                Style     = ProgressBarStyle.Marquee,
                Visible   = false,
            };

            lblSummary = new Label
            {
                Location  = new Point(12, 310),
                Size      = new Size(694, 23),
                TextAlign = ContentAlignment.MiddleLeft,
                Text      = "확인 중...",
                ForeColor = Color.Gray,
                AutoSize  = false,
            };

            lblHint = new Label
            {
                Location  = new Point(12, 334),
                Size      = new Size(694, 18),
                TextAlign = ContentAlignment.MiddleLeft,
                Text      = "행을 더블클릭하면 해당 패키지 다운로드 페이지가 열립니다.",
                ForeColor = Color.DimGray,
                Font      = new Font("Segoe UI", 8f),
                AutoSize  = false,
            };

            btnRefresh = new Button
            {
                Text     = "새로고침",
                Location = new Point(514, 360),
                Size     = new Size(90, 28),
                TabIndex = 0,
            };
            btnRefresh.Click += async (_, _) => await RunChecksAsync();

            btnClose = new Button
            {
                Text         = "닫기",
                Location     = new Point(616, 360),
                Size         = new Size(90, 28),
                DialogResult = DialogResult.OK,
                TabIndex     = 1,
            };

            Controls.Add(listView);
            Controls.Add(progressBar);
            Controls.Add(lblSummary);
            Controls.Add(lblHint);
            Controls.Add(btnRefresh);
            Controls.Add(btnClose);
            AcceptButton = btnClose;

            Load += async (_, _) => await RunChecksAsync();
        }

        // ----------------------------------------------------------------
        // 더블클릭: 다운로드 페이지 열기
        // ----------------------------------------------------------------
        private void ListView_DoubleClick(object? sender, EventArgs e)
        {
            if (listView.SelectedItems.Count == 0) return;
            int idx = listView.SelectedItems[0].Index;
            string url = Dependencies[idx].Url;
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
        }

        // ----------------------------------------------------------------
        // 비동기 의존성 확인
        // ----------------------------------------------------------------
        private async Task RunChecksAsync()
        {
            btnRefresh.Enabled  = false;
            progressBar.Visible = true;
            lblSummary.Text     = "확인 중...";
            lblSummary.ForeColor = Color.Gray;
            listView.Items.Clear();

            int missingRequired = 0;
            int missingOptional = 0;

            foreach (var (name, required, purpose, _, versionArg) in Dependencies)
            {
                string status, version;
                Color  rowColor;

                try
                {
                    var (exitCode, stdout) = await ProbeAsync(name, versionArg);

                    if (exitCode == 0)
                    {
                        string firstLine = stdout.Split('\n',
                            StringSplitOptions.RemoveEmptyEntries)
                            .FirstOrDefault()?.Trim() ?? "설치됨";

                        version  = firstLine.Length > 40 ? firstLine[..40] + "…" : firstLine;
                        status   = "✓ 설치됨";
                        rowColor = Color.FromArgb(235, 255, 235);
                    }
                    else
                    {
                        status   = "✗ 미설치";
                        version  = "-";
                        rowColor = required
                            ? Color.FromArgb(255, 230, 230)
                            : Color.FromArgb(255, 250, 215);

                        if (required) missingRequired++;
                        else          missingOptional++;
                    }
                }
                catch
                {
                    status   = "✗ 미설치";
                    version  = "-";
                    rowColor = required
                        ? Color.FromArgb(255, 230, 230)
                        : Color.FromArgb(255, 250, 215);

                    if (required) missingRequired++;
                    else          missingOptional++;
                }

                var item = new ListViewItem(name);
                item.SubItems.Add(required ? "필수" : "PDF 변환용");
                item.SubItems.Add(status);
                item.SubItems.Add(version);
                item.SubItems.Add(purpose);
                item.BackColor = rowColor;
                listView.Items.Add(item);
            }

            progressBar.Visible = false;
            btnRefresh.Enabled  = true;

            if (missingRequired > 0)
            {
                lblSummary.Text      = $"필수 패키지 {missingRequired}개 미설치 — 변환을 사용하려면 설치가 필요합니다.";
                lblSummary.ForeColor = Color.Red;
            }
            else if (missingOptional > 0)
            {
                lblSummary.Text      = $"선택 패키지 {missingOptional}개 미설치 — PDF 변환이 제한될 수 있습니다.";
                lblSummary.ForeColor = Color.DarkOrange;
            }
            else
            {
                lblSummary.Text      = "모든 패키지가 설치되어 있습니다.";
                lblSummary.ForeColor = Color.DarkGreen;
            }
        }

        // ----------------------------------------------------------------
        // 개별 도구 버전 확인
        // ----------------------------------------------------------------

        // wkhtmltopdf는 --version 실행 시 무한 대기하는 경우가 있으므로
        // PATH 존재 여부 + 기본 설치 디렉토리를 확인하고 경로를 버전란에 표시한다.
        private static readonly HashSet<string> PathOnlyTools =
            new(StringComparer.OrdinalIgnoreCase) { "wkhtmltopdf" };

        private static readonly string[] WkhtmltopdfKnownPaths =
        [
            @"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe",
            @"C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe",
        ];

        private static async Task<(int ExitCode, string Stdout)> ProbeAsync(string fileName, string arg)
        {
            if (PathOnlyTools.Contains(fileName))
                return await ProbeViaWhereAsync(fileName);

            var psi = new ProcessStartInfo
            {
                FileName               = fileName,
                Arguments              = arg,
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                CreateNoWindow         = true,
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            using var cts = new CancellationTokenSource(5_000);
            try
            {
                await process.WaitForExitAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch { }
                // 타임아웃 시 where로 존재 여부만 재확인
                return await ProbeViaWhereAsync(fileName);
            }

            string stdout = await stdoutTask;
            _ = await stderrTask;
            return (process.ExitCode, stdout);
        }

        // where 명령으로 PATH 내 실행 파일 존재 여부 확인 (버전 실행 없이)
        private static async Task<(int ExitCode, string Stdout)> ProbeViaWhereAsync(string fileName)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName               = "where",
                    Arguments              = fileName,
                    UseShellExecute        = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    CreateNoWindow         = true,
                };

                using var proc = new Process { StartInfo = psi };
                proc.Start();

                var stdoutTask = proc.StandardOutput.ReadToEndAsync();
                var stderrTask = proc.StandardError.ReadToEndAsync();

                using var cts = new CancellationTokenSource(3_000);
                await proc.WaitForExitAsync(cts.Token);

                if (proc.ExitCode == 0)
                {
                    string path = (await stdoutTask).Trim().Split('\n')
                                    .FirstOrDefault()?.Trim() ?? fileName;
                    _ = await stderrTask;
                    return (0, $"설치됨 (PATH) · {path}");
                }
            }
            catch { }

            // PATH에 없으면 기본 설치 디렉토리 직접 확인
            if (fileName.Equals("wkhtmltopdf", StringComparison.OrdinalIgnoreCase))
            {
                foreach (string knownPath in WkhtmltopdfKnownPaths)
                {
                    if (File.Exists(knownPath))
                        return (0, $"설치됨 (PATH 미등록) · {knownPath}");
                }
            }

            return (-1, "");
        }
    }
}
