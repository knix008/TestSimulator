using System.Diagnostics;

namespace PandocWinV2._0
{
    public partial class Form1 : Form
    {
        // ----------------------------------------------------------------
        // 데이터: 확장자 → pandoc 형식명
        // ----------------------------------------------------------------
        private static readonly Dictionary<string, string> ExtToFormat =
            new(StringComparer.OrdinalIgnoreCase)
        {
            { ".md",       "markdown"  },
            { ".markdown", "markdown"  },
            { ".txt",      "markdown"  },
            { ".html",     "html"      },
            { ".htm",      "html"      },
            { ".docx",     "docx"      },
            { ".doc",      "docx"      },
            { ".rst",      "rst"       },
            { ".tex",      "latex"     },
            { ".latex",    "latex"     },
            { ".epub",     "epub"      },
            { ".odt",      "odt"       },
            { ".wiki",     "mediawiki" },
            { ".textile",  "textile"   },
            { ".org",      "org"       },
            { ".csv",      "csv"       },
            { ".json",     "json"      },
        };

        // 입력 형식 목록 (표시명, pandoc 키)
        private static readonly (string Display, string Key)[] InputFormats =
        [
            ("자동 감지",  ""         ),
            ("markdown",   "markdown" ),
            ("docx",       "docx"     ),
            ("html",       "html"     ),
            ("rst",        "rst"      ),
            ("latex",      "latex"    ),
            ("epub",       "epub"     ),
            ("odt",        "odt"      ),
            ("mediawiki",  "mediawiki"),
            ("textile",    "textile"  ),
            ("org",        "org"      ),
            ("csv",        "csv"      ),
            ("json",       "json"     ),
        ];

        // 출력 형식 목록 (표시명, pandoc 키, 파일 확장자)
        private static readonly (string Display, string Key, string Ext)[] OutputFormats =
        [
            ("Word (.docx)",         "docx",     ".docx"),
            ("PDF (.pdf)",           "pdf",      ".pdf" ),
            ("HTML (.html)",         "html",     ".html"),
            ("Markdown (.md)",       "markdown", ".md"  ),
            ("LaTeX (.tex)",         "latex",    ".tex" ),
            ("EPUB (.epub)",         "epub",     ".epub"),
            ("ODT (.odt)",           "odt",      ".odt" ),
            ("reStructuredText",     "rst",      ".rst" ),
            ("PowerPoint (.pptx)",   "pptx",     ".pptx"),
            ("RTF (.rtf)",           "rtf",      ".rtf" ),
            ("Plain Text (.txt)",    "plain",    ".txt" ),
        ];

        // ----------------------------------------------------------------
        // 생성자
        // ----------------------------------------------------------------
        public Form1()
        {
            InitializeComponent();

            foreach (var (display, _) in InputFormats)
                cmbInputFormat.Items.Add(display);
            cmbInputFormat.SelectedIndex = 0;

            foreach (var (display, _, _) in OutputFormats)
                cmbOutputFormat.Items.Add(display);
            cmbOutputFormat.SelectedIndex = 0;

            cmbOutputFormat.SelectedIndexChanged += CmbOutputFormat_SelectedIndexChanged;
            cmbInputFormat.SelectedIndexChanged  += CmbInputFormat_SelectedIndexChanged;
        }

        // ----------------------------------------------------------------
        // 폼 로드: pandoc 설치 확인
        // ----------------------------------------------------------------
        private async void Form1_Load(object sender, EventArgs e)
        {
            SetStatus("Pandoc 설치 확인 중...", Color.Gray);
            btnConvert.Enabled = false;

            bool available = await CheckPandocAvailableAsync();
            if (available)
            {
                SetStatus("준비", Color.Green);
                btnConvert.Enabled = true;
            }
            else
            {
                SetStatus("Pandoc 미설치 - 변환 불가", Color.Red);
                ShowPandocInstallGuide();
            }
        }

        // ----------------------------------------------------------------
        // 메뉴: 도움말
        // ----------------------------------------------------------------
        private void MenuCheckDeps_Click(object? sender, EventArgs e)
        {
            using var dlg = new DependencyForm();
            dlg.ShowDialog(this);
        }

        private void MenuAbout_Click(object? sender, EventArgs e)
        {
            MessageBox.Show(
                "Pandoc 파일 변환기\n\n" +
                "Pandoc을 이용해 다양한 문서 형식을 변환하는 도구입니다.\n\n" +
                "필수 의존성:\n" +
                "  • pandoc — https://pandoc.org\n\n" +
                "PDF 변환용 선택 의존성:\n" +
                "  • MiKTeX (xelatex/lualatex/pdflatex) — https://miktex.org\n" +
                "  • TeX Live — https://tug.org/texlive\n" +
                "  • wkhtmltopdf — https://wkhtmltopdf.org\n\n" +
                "의존성 상태는 '도움말 > 의존성 확인'에서 확인할 수 있습니다.",
                "정보", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        // ----------------------------------------------------------------
        // 입력 파일 찾아보기
        // ----------------------------------------------------------------
        private void BtnBrowseInput_Click(object sender, EventArgs e)
        {
            using var dlg = new OpenFileDialog
            {
                Title  = "변환할 파일 선택",
                Filter = "지원되는 파일|*.md;*.markdown;*.txt;*.html;*.htm;*.docx;*.doc;"
                       + "*.rst;*.tex;*.latex;*.epub;*.odt;*.wiki;*.textile;*.org;"
                       + "*.csv;*.json|모든 파일 (*.*)|*.*",
                FilterIndex = 1,
            };

            if (dlg.ShowDialog() != DialogResult.OK)
                return;

            txtInputPath.Text = dlg.FileName;
            AutoDetectInputFormat(dlg.FileName);
            SuggestOutputPath();
        }

        // ----------------------------------------------------------------
        // 출력 파일 찾아보기
        // ----------------------------------------------------------------
        private void BtnBrowseOutput_Click(object sender, EventArgs e)
        {
            var (display, _, ext) = OutputFormats[cmbOutputFormat.SelectedIndex];

            using var dlg = new SaveFileDialog
            {
                Title      = "저장 위치 선택",
                Filter     = $"{display}|*{ext}|모든 파일 (*.*)|*.*",
                DefaultExt = ext.TrimStart('.'),
                FileName   = Path.GetFileNameWithoutExtension(txtInputPath.Text),
            };

            if (!string.IsNullOrEmpty(txtOutputPath.Text))
                dlg.InitialDirectory = Path.GetDirectoryName(txtOutputPath.Text) ?? "";

            if (dlg.ShowDialog() == DialogResult.OK)
                txtOutputPath.Text = dlg.FileName;
        }

        // ----------------------------------------------------------------
        // 출력 형식 변경 시 경로 확장자 갱신
        // ----------------------------------------------------------------
        private void CmbOutputFormat_SelectedIndexChanged(object? sender, EventArgs e)
        {
            if (!string.IsNullOrEmpty(txtInputPath.Text))
                SuggestOutputPath();
        }

        private void CmbInputFormat_SelectedIndexChanged(object? sender, EventArgs e)
        {
            lblAutoFormat.ForeColor = cmbInputFormat.SelectedIndex == 0
                ? Color.Gray
                : Color.DarkBlue;
        }

        // ----------------------------------------------------------------
        // 변환 시작
        // ----------------------------------------------------------------
        private async void BtnConvert_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtInputPath.Text))
            {
                MessageBox.Show("입력 파일을 선택하세요.", "입력 파일 없음",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!File.Exists(txtInputPath.Text))
            {
                MessageBox.Show("선택한 파일이 존재하지 않습니다.", "파일 오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            if (string.IsNullOrWhiteSpace(txtOutputPath.Text))
            {
                MessageBox.Show("출력 경로를 지정하세요.", "출력 경로 없음",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string inputFormat  = ResolveInputFormat();
            string outputFormat = OutputFormats[cmbOutputFormat.SelectedIndex].Key;
            string inputPath    = txtInputPath.Text;
            string outputPath   = txtOutputPath.Text;

            SetConvertingState(true);

            // PDF 출력 시 LaTeX 엔진 사전 확인
            string? pdfEngine = null;
            if (outputFormat == "pdf")
            {
                SetStatus("PDF 엔진 확인 중...", Color.Gray);
                pdfEngine = await DetectPdfEngineAsync();
                if (pdfEngine is null)
                {
                    SetConvertingState(false);
                    SetStatus("PDF 엔진 미설치 - 변환 불가", Color.Red);
                    ShowPdfInstallGuide();
                    return;
                }
            }

            string args = BuildPandocArguments(inputFormat, outputFormat, inputPath, outputPath, pdfEngine);

            SetStatus($"변환 중: {Path.GetFileName(inputPath)} → {Path.GetFileName(outputPath)}", Color.DarkOrange);

            // 변환 타임아웃: 5분
            var (exitCode, _, stderr) = await RunProcessAsync("pandoc", args, timeoutMs: 300_000);

            SetConvertingState(false);

            if (exitCode == 0)
            {
                SetStatus($"변환 완료: {Path.GetFileName(outputPath)}", Color.Green);
                MessageBox.Show($"변환이 완료되었습니다.\n\n{outputPath}",
                    "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                string errorDetail = string.IsNullOrWhiteSpace(stderr) ? "(오류 메시지 없음)" : stderr;
                SetStatus("변환 실패 - 오류 메시지를 확인하세요.", Color.Red);
                MessageBox.Show($"변환 중 오류가 발생했습니다.\n\n{errorDetail}",
                    "변환 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ----------------------------------------------------------------
        // 헬퍼: 파일 확장자로 입력 형식 자동 감지
        // ----------------------------------------------------------------
        private void AutoDetectInputFormat(string filePath)
        {
            string ext = Path.GetExtension(filePath);
            if (ExtToFormat.TryGetValue(ext, out string? fmt))
            {
                lblAutoFormat.Text      = $"자동 감지: {fmt}";
                lblAutoFormat.ForeColor = Color.DarkGreen;
            }
            else
            {
                lblAutoFormat.Text      = "알 수 없는 형식 (수동 선택 권장)";
                lblAutoFormat.ForeColor = Color.OrangeRed;
            }
            cmbInputFormat.SelectedIndex = 0;
        }

        // ----------------------------------------------------------------
        // 헬퍼: 실제 사용할 입력 형식 결정 (수동 > 자동)
        // ----------------------------------------------------------------
        private string ResolveInputFormat()
        {
            int idx = cmbInputFormat.SelectedIndex;
            if (idx > 0)
                return InputFormats[idx].Key;

            string ext = Path.GetExtension(txtInputPath.Text);
            return ExtToFormat.TryGetValue(ext, out string? fmt) ? fmt : "markdown";
        }

        // ----------------------------------------------------------------
        // 헬퍼: 출력 경로 자동 제안
        // ----------------------------------------------------------------
        private void SuggestOutputPath()
        {
            if (string.IsNullOrEmpty(txtInputPath.Text)) return;
            string ext       = OutputFormats[cmbOutputFormat.SelectedIndex].Ext;
            txtOutputPath.Text = Path.ChangeExtension(txtInputPath.Text, ext);
        }

        // ----------------------------------------------------------------
        // 헬퍼: pandoc 인수 빌드
        // ----------------------------------------------------------------
        private static string BuildPandocArguments(
            string inputFormat, string outputFormat,
            string inputPath,   string outputPath,
            string? pdfEngine = null)
        {
            string args = $"-f {inputFormat} -t {outputFormat} -o \"{outputPath}\" \"{inputPath}\"";
            if (outputFormat == "pdf" && pdfEngine is not null)
            {
                // 경로에 공백이 포함된 경우(설치 디렉토리 직접 지정) 따옴표로 감싼다
                string engineArg = pdfEngine.Contains(' ') ? $"\"{pdfEngine}\"" : pdfEngine;
                args += $" --pdf-engine={engineArg}";
            }
            return args;
        }

        // ----------------------------------------------------------------
        // 헬퍼: 비동기 프로세스 실행 (타임아웃 지원)
        // ----------------------------------------------------------------
        private static async Task<(int ExitCode, string Stdout, string Stderr)>
            RunProcessAsync(string fileName, string arguments, int timeoutMs = -1)
        {
            var psi = new ProcessStartInfo
            {
                FileName               = fileName,
                Arguments              = arguments,
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                CreateNoWindow         = true,
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            // 두 스트림을 동시에 읽어 데드락 방지
            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            using var cts = timeoutMs > 0
                ? new CancellationTokenSource(timeoutMs)
                : new CancellationTokenSource();

            try
            {
                await process.WaitForExitAsync(cts.Token);
            }
            catch (OperationCanceledException) when (timeoutMs > 0)
            {
                try { process.Kill(entireProcessTree: true); } catch { }
                return (-1, "", "타임아웃: 프로세스가 응답하지 않아 강제 종료되었습니다.");
            }

            string stdout = await stdoutTask;
            string stderr = await stderrTask;
            return (process.ExitCode, stdout, stderr);
        }

        // ----------------------------------------------------------------
        // 헬퍼: pandoc 설치 확인
        // ----------------------------------------------------------------
        private static async Task<bool> CheckPandocAvailableAsync()
        {
            try
            {
                var (exitCode, stdout, _) = await RunProcessAsync("pandoc", "--version", timeoutMs: 5_000);
                return exitCode == 0 && stdout.StartsWith("pandoc", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        // ----------------------------------------------------------------
        // pandoc / PDF 엔진 설치 안내
        // ----------------------------------------------------------------

        private static void ShowPandocInstallGuide()
        {
            const string msg =
                "Pandoc이 설치되어 있지 않거나 PATH에서 찾을 수 없습니다.\n\n" +
                "아래 공식 사이트에서 Pandoc을 설치하세요:\n\n" +
                "  https://pandoc.org/installing.html\n\n" +
                "Windows: .msi 설치 파일을 받아 실행하면 PATH가 자동으로 설정됩니다.\n\n" +
                "설치 후 앱을 재시작하세요.\n\n" +
                "지금 Pandoc 다운로드 페이지를 열겠습니까?";

            var result = MessageBox.Show(msg, "Pandoc 미설치",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button1);

            if (result == DialogResult.Yes)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName        = "https://pandoc.org/installing.html",
                    UseShellExecute = true,
                });
            }
        }

        // ----------------------------------------------------------------
        // PDF 엔진 감지 및 설치 안내
        // ----------------------------------------------------------------

        // 우선순위 순 PDF 엔진 목록
        private static readonly string[] PdfEngines = ["xelatex", "lualatex", "pdflatex", "wkhtmltopdf"];

        // wkhtmltopdf Windows 기본 설치 경로
        private static readonly string[] WkhtmltopdfKnownPaths =
        [
            @"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe",
            @"C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe",
        ];

        private static async Task<string?> DetectPdfEngineAsync()
        {
            foreach (string engine in PdfEngines)
            {
                try
                {
                    string? found = engine == "wkhtmltopdf"
                        ? await FindWkhtmltopdfAsync()
                        : (await RunProcessAsync(engine, "--version", timeoutMs: 5_000)).ExitCode == 0
                            ? engine : null;

                    if (found is not null) return found;
                }
                catch { }
            }
            return null;
        }

        // wkhtmltopdf: PATH → 기본 설치 디렉토리 순서로 탐색
        // PATH에 있으면 이름만, 설치 디렉토리에서 찾으면 전체 경로 반환
        private static async Task<string?> FindWkhtmltopdfAsync()
        {
            if (await ExistsInPathAsync("wkhtmltopdf"))
                return "wkhtmltopdf";

            foreach (string path in WkhtmltopdfKnownPaths)
            {
                if (File.Exists(path))
                    return path;
            }
            return null;
        }

        // where 명령으로 PATH 내 실행 파일 존재 여부만 확인
        private static async Task<bool> ExistsInPathAsync(string fileName)
        {
            try
            {
                var (exitCode, _, _) = await RunProcessAsync("where", fileName, timeoutMs: 3_000);
                return exitCode == 0;
            }
            catch { return false; }
        }

        private static void ShowPdfInstallGuide()
        {
            const string msg =
                "PDF 변환에는 LaTeX 엔진이 필요하지만 설치되어 있지 않습니다.\n\n" +
                "아래 중 하나를 설치하세요:\n\n" +
                "① MiKTeX (권장, Windows용, xelatex 포함)\n" +
                "   https://miktex.org/download\n\n" +
                "② TeX Live (전체 LaTeX 배포판)\n" +
                "   https://tug.org/texlive/\n\n" +
                "③ wkhtmltopdf (LaTeX 불필요, HTML 기반)\n" +
                "   https://wkhtmltopdf.org/downloads.html\n\n" +
                "설치 후 앱을 재시작하세요.\n\n" +
                "지금 MiKTeX 다운로드 페이지를 열겠습니까?";

            var result = MessageBox.Show(msg, "PDF 엔진 미설치",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button1);

            if (result == DialogResult.Yes)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName        = "https://miktex.org/download",
                    UseShellExecute = true,
                });
            }
        }

        // ----------------------------------------------------------------
        // UI 상태 헬퍼
        // ----------------------------------------------------------------
        private void SetStatus(string message, Color color)
        {
            lblStatus.Text      = message;
            lblStatus.ForeColor = color;
        }

        private void SetConvertingState(bool isConverting)
        {
            btnConvert.Enabled      = !isConverting;
            btnBrowseInput.Enabled  = !isConverting;
            btnBrowseOutput.Enabled = !isConverting;
            cmbInputFormat.Enabled  = !isConverting;
            cmbOutputFormat.Enabled = !isConverting;
            Cursor = isConverting ? Cursors.WaitCursor : Cursors.Default;
        }
    }
}
