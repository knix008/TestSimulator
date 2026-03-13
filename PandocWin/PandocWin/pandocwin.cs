using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PandocWin
{
    public partial class PandocWin : Form
    {
        private string selectedFilePath;

        public PandocWin()
        {
            InitializeComponent();
        }

        private void Form1_Load(object sender, EventArgs e)
        {

        }

        private void File_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.Filter = "Markdown Files (*.md)|*.md|All Files (*.*)|*.*";
                openFileDialog.FilterIndex = 1;
                openFileDialog.Title = "Select Markdown File";

                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    selectedFilePath = openFileDialog.FileName;
                    Log.AppendText($"Selected File: {selectedFilePath}\r\n");
                }
            }
        }

        private void Convert_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(selectedFilePath))
            {
                MessageBox.Show("먼저 변환할 Markdown 파일을 선택하세요.", "파일 선택 필요", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
                string outputFilePath = Path.ChangeExtension(selectedFilePath, ".docx");
                
                Log.AppendText($"Converting: {selectedFilePath}\r\n");
                Log.AppendText($"Output: {outputFilePath}\r\n");

                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = pandocPath,
                    Arguments = $"\"{selectedFilePath}\" -o \"{outputFilePath}\"",
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
    }
}
