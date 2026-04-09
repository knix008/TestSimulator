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
        private readonly ListView    listView;
        private readonly Label       lblSummary;
        private readonly Label       lblHint;
        private readonly Button      btnRefresh;
        private readonly Button      btnInstallSelected;
        private readonly Button      btnClose;
        private readonly ProgressBar progressBar;

        // ----------------------------------------------------------------
        // 생성자
        // ----------------------------------------------------------------
        public DependencyForm()
        {
            Color shellBack   = Color.FromArgb(241, 245, 249);
            Color headerBack  = Color.FromArgb(30, 58, 95);
            Color sectionText = Color.FromArgb(51, 65, 85);
            Color borderSubtle = Color.FromArgb(226, 232, 240);

            Text            = "의존성 확인";
            Size            = new Size(752, 467);
            MinimumSize     = Size;
            MaximumSize     = Size;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition   = FormStartPosition.CenterParent;
            MaximizeBox     = false;
            MinimizeBox     = false;
            BackColor       = shellBack;
            Font            = new Font("Segoe UI", 9F);
            DoubleBuffered  = true;

            var panelHeader = new Panel
            {
                Dock      = DockStyle.Top,
                Height    = 54,
                BackColor = headerBack,
            };
            var lblHdrTitle = new Label
            {
                Text      = "의존성 확인",
                Font      = new Font("Segoe UI", 11F, FontStyle.Bold),
                ForeColor = Color.White,
                AutoSize  = true,
                Location  = new Point(18, 8),
            };
            var lblHdrSub = new Label
            {
                Text      = "Pandoc과 PDF 변환에 쓰이는 도구 설치 여부를 확인합니다. 미설치 항목은「자동 설치」로 내려받을 수 있습니다.",
                Font      = new Font("Segoe UI", 8.5F),
                ForeColor = Color.FromArgb(184, 197, 214),
                AutoSize  = true,
                Location  = new Point(20, 28),
            };
            panelHeader.Controls.Add(lblHdrTitle);
            panelHeader.Controls.Add(lblHdrSub);

            var panelClient = new Panel
            {
                Dock    = DockStyle.Fill,
                Padding = new Padding(16, 12, 16, 12),
                BackColor = shellBack,
            };

            var layout = new TableLayoutPanel
            {
                Dock               = DockStyle.Fill,
                ColumnCount        = 1,
                RowCount           = 5,
                BackColor          = shellBack,
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 258F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44F));

            var listHost = new Panel
            {
                Dock           = DockStyle.Fill,
                BackColor      = Color.White,
                BorderStyle    = BorderStyle.FixedSingle,
                Padding        = new Padding(0),
            };

            listView = new ListView
            {
                Dock              = DockStyle.Fill,
                View              = View.Details,
                FullRowSelect     = true,
                GridLines         = false,
                HideSelection     = false,
                BorderStyle       = BorderStyle.None,
                BackColor         = Color.White,
                Font              = new Font("Segoe UI", 9F),
                HeaderStyle       = ColumnHeaderStyle.Nonclickable,
            };
            listView.Columns.Add("패키지", 118);
            listView.Columns.Add("필수 여부", 88);
            listView.Columns.Add("상태", 88);
            listView.Columns.Add("버전", 168);
            listView.Columns.Add("용도", 280);
            listView.DoubleClick += ListView_DoubleClick;
            listView.SelectedIndexChanged += (_, _) => UpdateInstallButtonState();
            listHost.Controls.Add(listView);
            layout.Controls.Add(listHost, 0, 0);

            progressBar = new ProgressBar
            {
                Dock  = DockStyle.Fill,
                Style = ProgressBarStyle.Marquee,
                Visible = false,
            };
            layout.Controls.Add(progressBar, 0, 1);

            lblSummary = new Label
            {
                Dock      = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Text      = "확인 중...",
                ForeColor = Color.FromArgb(100, 116, 139),
                AutoSize  = false,
            };
            layout.Controls.Add(lblSummary, 0, 2);

            lblHint = new Label
            {
                Dock      = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Text      = "행을 더블클릭하면 브라우저로 안내 페이지가 열립니다. 미설치 행을 선택한 뒤「자동 설치」를 누르면 공식 설치 파일을 내려받습니다.",
                ForeColor = Color.FromArgb(100, 116, 139),
                Font      = new Font("Segoe UI", 8.25F),
                AutoSize  = false,
            };
            layout.Controls.Add(lblHint, 0, 3);

            var pnlButtons = new FlowLayoutPanel
            {
                Dock             = DockStyle.Fill,
                FlowDirection    = FlowDirection.RightToLeft,
                WrapContents     = false,
                BackColor        = shellBack,
                Padding          = new Padding(0, 6, 0, 0),
                AutoSize         = false,
            };

            btnClose = new Button
            {
                Text         = "닫기",
                Size         = new Size(96, 30),
                DialogResult = DialogResult.OK,
                TabIndex     = 1,
                FlatStyle    = FlatStyle.Flat,
                BackColor    = Color.White,
                ForeColor    = sectionText,
                Cursor       = Cursors.Hand,
                Font         = new Font("Segoe UI", 9F),
                UseVisualStyleBackColor = false,
            };
            btnClose.FlatAppearance.BorderColor = borderSubtle;

            btnRefresh = new Button
            {
                Text     = "새로고침",
                Size     = new Size(96, 30),
                Margin   = new Padding(0, 0, 10, 0),
                TabIndex = 0,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(37, 99, 235),
                ForeColor = Color.White,
                Cursor    = Cursors.Hand,
                Font      = new Font("Segoe UI", 9F),
                UseVisualStyleBackColor = false,
            };
            btnRefresh.FlatAppearance.BorderSize = 0;
            btnRefresh.FlatAppearance.MouseOverBackColor = Color.FromArgb(29, 78, 216);
            btnRefresh.FlatAppearance.MouseDownBackColor = Color.FromArgb(30, 64, 175);
            btnRefresh.Click += async (_, _) => await RunChecksAsync();

            btnInstallSelected = new Button
            {
                Text     = "자동 설치",
                Size     = new Size(108, 30),
                Margin   = new Padding(0, 0, 10, 0),
                TabIndex = 2,
                Enabled  = false,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(5, 122, 85),
                ForeColor = Color.White,
                Cursor    = Cursors.Hand,
                Font      = new Font("Segoe UI", 9F),
                UseVisualStyleBackColor = false,
            };
            btnInstallSelected.FlatAppearance.BorderSize = 0;
            btnInstallSelected.FlatAppearance.MouseOverBackColor = Color.FromArgb(4, 108, 76);
            btnInstallSelected.FlatAppearance.MouseDownBackColor = Color.FromArgb(3, 94, 66);
            btnInstallSelected.Click += BtnInstallSelected_Click;

            pnlButtons.Controls.Add(btnClose);
            pnlButtons.Controls.Add(btnInstallSelected);
            pnlButtons.Controls.Add(btnRefresh);
            layout.Controls.Add(pnlButtons, 0, 4);

            panelClient.Controls.Add(layout);
            Controls.Add(panelClient);
            Controls.Add(panelHeader);
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
            btnRefresh.Enabled         = false;
            btnInstallSelected.Enabled = false;
            progressBar.Style            = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 30;
            progressBar.Visible          = true;
            lblSummary.Text     = "확인 중...";
            lblSummary.ForeColor = Color.FromArgb(100, 116, 139);
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
                        rowColor = Color.FromArgb(236, 253, 245);
                    }
                    else
                    {
                        status   = "✗ 미설치";
                        version  = "-";
                        rowColor = required
                            ? Color.FromArgb(254, 242, 242)
                            : Color.FromArgb(255, 251, 235);

                        if (required) missingRequired++;
                        else          missingOptional++;
                    }
                }
                catch
                {
                    status   = "✗ 미설치";
                    version  = "-";
                    rowColor = required
                        ? Color.FromArgb(254, 242, 242)
                        : Color.FromArgb(255, 251, 235);

                    if (required) missingRequired++;
                    else          missingOptional++;
                }

                var item = new ListViewItem(name);
                item.SubItems.Add(required ? "필수" : "PDF 변환용");
                item.SubItems.Add(status);
                item.SubItems.Add(version);
                item.SubItems.Add(purpose);
                item.BackColor = rowColor;
                item.Tag       = name;
                listView.Items.Add(item);
            }

            progressBar.Visible = false;
            btnRefresh.Enabled  = true;

            UpdateInstallButtonState();

            if (missingRequired > 0)
            {
                lblSummary.Text      = $"필수 패키지 {missingRequired}개 미설치 — 변환을 사용하려면 설치가 필요합니다.";
                lblSummary.ForeColor = Color.Red;
            }
            else if (missingOptional > 0)
            {
                lblSummary.Text      = $"선택 패키지 {missingOptional}개 미설치 — PDF 변환이 제한될 수 있습니다.";
                lblSummary.ForeColor = Color.FromArgb(234, 88, 12);
            }
            else
            {
                lblSummary.Text      = "모든 패키지가 설치되어 있습니다.";
                lblSummary.ForeColor = Color.FromArgb(22, 163, 74);
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

        // ----------------------------------------------------------------
        // 자동 설치 UI
        // ----------------------------------------------------------------

        private void UpdateInstallButtonState()
        {
            if (listView.SelectedItems.Count == 0)
            {
                btnInstallSelected.Enabled = false;
                return;
            }

            ListViewItem item = listView.SelectedItems[0];
            string probeName = item.Tag as string ?? "";
            if (!DependencyInstaller.CanAutoInstall(probeName))
            {
                btnInstallSelected.Enabled = false;
                return;
            }

            bool missing = item.SubItems.Count > 2 && item.SubItems[2].Text.Contains("미설치");
            btnInstallSelected.Enabled = missing;
        }

        private async void BtnInstallSelected_Click(object? sender, EventArgs e)
        {
            if (listView.SelectedItems.Count == 0) return;

            ListViewItem item = listView.SelectedItems[0];
            string probeName = item.Tag as string ?? "";
            DependencyInstallTarget? target = DependencyInstaller.GetInstallTarget(probeName);
            if (target is null)
            {
                MessageBox.Show(this, "이 항목은 자동 설치를 지원하지 않습니다.", "자동 설치",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (item.SubItems.Count <= 2 || !item.SubItems[2].Text.Contains("미설치"))
            {
                MessageBox.Show(this, "이미 설치된 항목입니다.", "자동 설치",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string title = DependencyInstaller.DisplayName(target.Value);
            if (MessageBox.Show(this,
                    $"{title} 설치 파일을 공식 배포처에서 내려받은 뒤, 자동으로 설치를 시도합니다.\n\n" +
                    "• 네트워크 사용량이 클 수 있습니다(MiKTeX Basic 등).\n" +
                    "• UAC(관리자 승인) 창이 열릴 수 있습니다.\n" +
                    "• wkhtmltopdf는 패키징 저장소의 Windows 64비트 빌드(0.12.6-1)를 사용합니다.\n\n" +
                    "계속할까요?",
                    "자동 설치 확인",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2) != DialogResult.Yes)
                return;

            btnRefresh.Enabled         = false;
            btnInstallSelected.Enabled = false;
            btnClose.Enabled           = false;
            listView.Enabled           = false;

            progressBar.Style   = ProgressBarStyle.Continuous;
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Value   = 0;
            progressBar.Visible = true;
            lblSummary.Text     = "다운로드 준비 중…";

            try
            {
                var status = new Progress<string>(s => lblSummary.Text = s);
                var pct = new Progress<int>(p =>
                {
                    int v = Math.Clamp(p, 0, 100);
                    progressBar.Value = v;
                });
                var phase = new Progress<DependencyInstallPhase>(p =>
                {
                    if (p == DependencyInstallPhase.Downloading)
                    {
                        progressBar.Style = ProgressBarStyle.Continuous;
                        progressBar.Value = 0;
                    }
                    else
                    {
                        progressBar.Style = ProgressBarStyle.Marquee;
                        progressBar.MarqueeAnimationSpeed = 30;
                    }
                });

                string? err = await DependencyInstaller.InstallAsync(target.Value, status, pct, phase);
                DependencyInstaller.RefreshProcessPathFromRegistry();

                if (err is null)
                {
                    MessageBox.Show(this,
                        "설치가 완료된 것으로 보입니다.\n" +
                        "상태가 갱신되지 않으면「새로고침」하거나 앱을 다시 시작해 주세요.",
                        "설치 완료",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show(this, err, "설치 실패",
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            finally
            {
                progressBar.Visible = false;
                progressBar.Style   = ProgressBarStyle.Marquee;
                listView.Enabled    = true;
                btnClose.Enabled    = true;
                btnRefresh.Enabled  = true;
                await RunChecksAsync();
            }
        }
    }
}
