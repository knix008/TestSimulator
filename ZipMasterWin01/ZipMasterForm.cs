using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.RegularExpressions;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ZipMasterWin01
{
    public partial class ZipMasterForm : Form
    {
        public ZipMasterForm()
        {
            InitializeComponent();
            InitializeCustomComponents();
        }

        private void InitializeCustomComponents()
        {
            // Add a button for compression
            Button compressButton = new Button
            {
                Text = "Compress",
                Location = new Point(10, 10),
                Size = new Size(100, 30)
            };
            compressButton.Click += CompressButton_Click;
            Controls.Add(compressButton);

            // Add a button for extraction
            Button extractButton = new Button
            {
                Text = "Extract",
                Location = new Point(120, 10),
                Size = new Size(100, 30)
            };
            extractButton.Click += ExtractButton_Click;
            Controls.Add(extractButton);
        }

        private void CompressButton_Click(object sender, EventArgs e)
        {
            List<string> sources = SelectCompressionSources();
            if (sources == null || sources.Count == 0)
            {
                return;
            }

            using (SaveFileDialog saveFileDialog = new SaveFileDialog())
            {
                saveFileDialog.Filter = "ZIP files (*.zip)|*.zip";
                if (saveFileDialog.ShowDialog() != DialogResult.OK)
                {
                    return;
                }

                string zipPath = saveFileDialog.FileName;
                DialogResult splitChoice = MessageBox.Show(
                    "용량 기준으로 분할 압축하시겠습니까?",
                    "압축 방식 선택",
                    MessageBoxButtons.YesNoCancel,
                    MessageBoxIcon.Question);

                if (splitChoice == DialogResult.Cancel)
                {
                    return;
                }

                try
                {
                    if (splitChoice == DialogResult.No)
                    {
                        CreateZipFromSources(sources, zipPath);
                        MessageBox.Show("압축이 완료되었습니다.", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    long partSizeBytes = PromptSplitSizeBytes();
                    if (partSizeBytes <= 0)
                    {
                        return;
                    }

                    string tempZipPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".zip");
                    try
                    {
                        CreateZipFromSources(sources, tempZipPath);
                        int partCount = SplitFile(tempZipPath, zipPath, partSizeBytes);
                        MessageBox.Show(
                            $"분할 압축이 완료되었습니다. 생성된 파일 수: {partCount}",
                            "Success",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information);
                    }
                    finally
                    {
                        if (File.Exists(tempZipPath))
                        {
                            File.Delete(tempZipPath);
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"압축 중 오류가 발생했습니다.\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void ExtractButton_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.Filter = "ZIP files (*.zip;*.001)|*.zip;*.001";
                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    string zipPath = openFileDialog.FileName;

                    using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
                    {
                        if (folderDialog.ShowDialog() == DialogResult.OK)
                        {
                            string extractPath = folderDialog.SelectedPath;
                            string extractSourcePath = zipPath;
                            string tempCombinedPath = null;

                            try
                            {
                                if (TryCombineSplitArchive(zipPath, out tempCombinedPath))
                                {
                                    extractSourcePath = tempCombinedPath;
                                }

                                using (ZipArchive archive = ZipFile.OpenRead(extractSourcePath))
                                {
                                    foreach (ZipArchiveEntry entry in archive.Entries)
                                    {
                                        string destinationPath = Path.Combine(extractPath, entry.FullName);

                                        // Ensure the directory exists
                                        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));

                                        // Skip system files like desktop.ini
                                        if (!string.IsNullOrEmpty(entry.Name) && !entry.Name.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase))
                                        {
                                            try
                                            {
                                                entry.ExtractToFile(destinationPath, overwrite: true);
                                            }
                                            catch (UnauthorizedAccessException)
                                            {
                                                MessageBox.Show($"Access denied for file: {entry.Name}", "Warning", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                            }
                                        }
                                    }
                                }

                                MessageBox.Show("ZIP file extracted successfully!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                            }
                            catch (Exception ex)
                            {
                                MessageBox.Show($"압축 해제 중 오류가 발생했습니다.\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                            }
                            finally
                            {
                                if (!string.IsNullOrEmpty(tempCombinedPath) && File.Exists(tempCombinedPath))
                                {
                                    File.Delete(tempCombinedPath);
                                }
                            }
                        }
                    }
                }
            }
        }

        private List<string> SelectCompressionSources()
        {
            DialogResult sourceType = MessageBox.Show(
                "압축할 대상을 선택하세요.\nYes: 파일(여러 개 선택 가능)\nNo: 폴더(1개)",
                "압축 대상 선택",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Question);

            if (sourceType == DialogResult.Cancel)
            {
                return null;
            }

            if (sourceType == DialogResult.Yes)
            {
                using (OpenFileDialog fileDialog = new OpenFileDialog())
                {
                    fileDialog.Multiselect = true;
                    fileDialog.Filter = "All files (*.*)|*.*";
                    if (fileDialog.ShowDialog() == DialogResult.OK && fileDialog.FileNames.Length > 0)
                    {
                        return fileDialog.FileNames.ToList();
                    }
                }

                return null;
            }

            using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
            {
                if (folderDialog.ShowDialog() == DialogResult.OK)
                {
                    return new List<string> { folderDialog.SelectedPath };
                }
            }

            return null;
        }

        private long PromptSplitSizeBytes()
        {
            using (Form prompt = new Form())
            {
                prompt.Text = "분할 크기 설정";
                prompt.Width = 280;
                prompt.Height = 150;
                prompt.FormBorderStyle = FormBorderStyle.FixedDialog;
                prompt.StartPosition = FormStartPosition.CenterParent;
                prompt.MinimizeBox = false;
                prompt.MaximizeBox = false;

                Label textLabel = new Label { Left = 15, Top = 15, Width = 230, Text = "분할 크기(MB)를 입력하세요:" };
                NumericUpDown sizeInput = new NumericUpDown
                {
                    Left = 15,
                    Top = 45,
                    Width = 230,
                    Minimum = 1,
                    Maximum = 1024 * 10,
                    Value = 100
                };
                Button confirmation = new Button
                {
                    Text = "OK",
                    Left = 170,
                    Width = 75,
                    Top = 75,
                    DialogResult = DialogResult.OK
                };

                prompt.Controls.Add(textLabel);
                prompt.Controls.Add(sizeInput);
                prompt.Controls.Add(confirmation);
                prompt.AcceptButton = confirmation;

                if (prompt.ShowDialog() == DialogResult.OK)
                {
                    return (long)sizeInput.Value * 1024L * 1024L;
                }
            }

            return 0;
        }

        private void CreateZipFromSources(IEnumerable<string> sources, string zipPath)
        {
            using (FileStream zipToOpen = new FileStream(zipPath, FileMode.Create))
            using (ZipArchive archive = new ZipArchive(zipToOpen, ZipArchiveMode.Create))
            {
                foreach (string source in sources)
                {
                    if (Directory.Exists(source))
                    {
                        string folderName = new DirectoryInfo(source).Name;
                        foreach (string file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
                        {
                            string relativePath = GetRelativePath(source, file);
                            string entryName = Path.Combine(folderName, relativePath).Replace('\\', '/');
                            archive.CreateEntryFromFile(file, entryName);
                        }
                    }
                    else if (File.Exists(source))
                    {
                        archive.CreateEntryFromFile(source, Path.GetFileName(source));
                    }
                }
            }
        }

        private int SplitFile(string sourceFilePath, string outputBaseZipPath, long partSizeBytes)
        {
            int partIndex = 1;
            byte[] buffer = new byte[81920];

            using (FileStream sourceStream = new FileStream(sourceFilePath, FileMode.Open, FileAccess.Read))
            {
                while (sourceStream.Position < sourceStream.Length)
                {
                    string outputPartPath = string.Format("{0}.{1:D3}", outputBaseZipPath, partIndex);
                    using (FileStream partStream = new FileStream(outputPartPath, FileMode.Create, FileAccess.Write))
                    {
                        long bytesToWrite = Math.Min(partSizeBytes, sourceStream.Length - sourceStream.Position);
                        while (bytesToWrite > 0)
                        {
                            int chunkSize = (int)Math.Min(buffer.Length, bytesToWrite);
                            int bytesRead = sourceStream.Read(buffer, 0, chunkSize);
                            if (bytesRead == 0)
                            {
                                break;
                            }

                            partStream.Write(buffer, 0, bytesRead);
                            bytesToWrite -= bytesRead;
                        }
                    }

                    partIndex++;
                }
            }

            return partIndex - 1;
        }

        private bool TryCombineSplitArchive(string selectedPath, out string combinedZipPath)
        {
            combinedZipPath = null;

            Match match = Regex.Match(selectedPath, @"^(.*\.zip)\.(\d{3})$", RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                return false;
            }

            string baseZipPath = match.Groups[1].Value;
            string directory = Path.GetDirectoryName(selectedPath);
            string baseFileName = Path.GetFileName(baseZipPath);
            string pattern = "^" + Regex.Escape(baseFileName) + @"\.(\d{3})$";

            List<string> parts = Directory.GetFiles(directory)
                .Where(path => Regex.IsMatch(Path.GetFileName(path), pattern, RegexOptions.IgnoreCase))
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (parts.Count == 0)
            {
                return false;
            }

            combinedZipPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".zip");
            byte[] buffer = new byte[81920];

            using (FileStream destination = new FileStream(combinedZipPath, FileMode.Create, FileAccess.Write))
            {
                foreach (string part in parts)
                {
                    using (FileStream source = new FileStream(part, FileMode.Open, FileAccess.Read))
                    {
                        int bytesRead;
                        while ((bytesRead = source.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            destination.Write(buffer, 0, bytesRead);
                        }
                    }
                }
            }

            return true;
        }

        private string GetRelativePath(string basePath, string targetPath)
        {
            Uri baseUri = new Uri(basePath.EndsWith("\\") ? basePath : basePath + "\\");
            Uri targetUri = new Uri(targetPath);
            return Uri.UnescapeDataString(baseUri.MakeRelativeUri(targetUri).ToString().Replace('/', Path.DirectorySeparatorChar));
        }
    }
}
