using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace PandocWin
{
    public partial class PandocWin : Form
    {
        private string selectedFilePath;
        private readonly Dictionary<string, string> pandocFormats = new Dictionary<string, string>
        {
            { "Word (.docx)", "docx" },
            { "PDF (.pdf)", "pdf" },
            { "HTML (.html)", "html" },
            { "ODT (.odt)", "odt" },
            { "LaTeX (.tex)", "tex" },
            { "EPUB (.epub)", "epub" },
            // 필요시 더 추가
        };

        public PandocWin()
        {
            InitializeComponent();
            radioDocx.Checked = true; // 기본값
        }

        private void Form1_Load(object sender, EventArgs e)
        {

        }

        private void File_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.Filter = "Pandoc Supported Input Files|*.md;*.markdown;*.txt;*.rst;*.docx;*.html;*.odt;*.tex;*.epub;*.csv;*.json;*.xml;*.latex;*.pptx;*.rtf;*.org;*.asciidoc;*.jats;*.doc;*.mobi;*.fb2;*.pdf|All Files (*.*)|*.*";
                openFileDialog.FilterIndex = 1;
                openFileDialog.Title = "Select Input File";

                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    selectedFilePath = openFileDialog.FileName;
                    Log.AppendText($"Selected File: {selectedFilePath}\r\n");
                }
            }
        }

        private string GetSelectedFormat()
        {
            if (radioDocx.Checked) return "docx";
            if (radioHtml.Checked) return "html";
            if (radioOdt.Checked) return "odt";
            if (radioTex.Checked) return "tex";
            if (radioEpub.Checked) return "epub";
            if (radioPdf.Checked) return "pdf"; // 추가된 PDF 출력 옵션
            return "docx"; // fallback
        }

        private void Convert_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(selectedFilePath))
            {
                MessageBox.Show("먼저 변환할 파일을 선택하세요.", "파일 선택 필요", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!File.Exists(selectedFilePath))
            {
                MessageBox.Show("선택한 파일이 존재하지 않습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string pandocPath = @"C:\Program Files\Pandoc\pandoc.exe";
            if (!File.Exists(pandocPath))
            {
                MessageBox.Show("Pandoc이 설치되어 있지 않습니다.\nC:\\Program Files\\Pandoc\\pandoc.exe를 찾을 수 없습니다.", "Pandoc 없음", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                string ext = GetSelectedFormat();
                string outputFilePath = Path.ChangeExtension(selectedFilePath, $".{ext}");

                Log.AppendText($"Converting: {selectedFilePath}\r\n");
                Log.AppendText($"Output: {outputFilePath}\r\n");

                string arguments = ext == "pdf"
                    ? $"\"{selectedFilePath}\" -o \"{outputFilePath}\" --pdf-engine=xelatex"
                    : $"\"{selectedFilePath}\" -o \"{outputFilePath}\"";

                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = pandocPath,
                    Arguments = arguments,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using (Process process = Process.Start(startInfo))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    string error = process.StandardError.ReadToEnd();
                    process.WaitForExit();

                    if (process.ExitCode == 0)
                    {
                        Log.AppendText("변환 완료!\r\n");
                        MessageBox.Show($"변환이 완료되었습니다.\n{outputFilePath}", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        Log.AppendText($"오류 발생: {error}\r\n");
                        MessageBox.Show($"변환 중 오류가 발생했습니다.\n{error}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
            catch (Exception ex)
            {
                Log.AppendText($"예외 발생: {ex.Message}\r\n");
                MessageBox.Show($"변환 중 예외가 발생했습니다.\n{ex.Message}", "예외", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void Info_Click(object sender, EventArgs e)
        {

        }

        private void inputFormatsLabel_Click(object sender, EventArgs e)
        {

        }
    }
}
