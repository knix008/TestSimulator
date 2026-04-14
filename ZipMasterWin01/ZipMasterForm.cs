using System;
using System.Formats.Tar;
using System.IO;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace ZipMasterWin01
{
    public partial class ZipMasterForm : Form
    {
        private readonly NotifyIcon completionNotifyIcon;

        private sealed class CompressionSource
        {
            public string BasePath { get; set; }
            public string[] Files { get; set; }
            public string DisplayName { get; set; }
            public bool IncludeRootDirectory { get; set; }
            public string RootDirectoryName { get; set; }
        }

        public ZipMasterForm()
        {
            InitializeComponent();
            sourceTypeComboBox.SelectedIndex = 0;
            archiveFormatComboBox.SelectedIndex = 0;
            outputFolderTextBox.Text = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            enableSplitCheckBox.Checked = false;
            splitSizeUpDown.Enabled = false;
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Value = 0;

            completionNotifyIcon = new NotifyIcon
            {
                Icon = Icon,
                Visible = true
            };
            FormClosing += ZipMasterForm_FormClosing;
        }

        private void CompressButton_Click(object sender, EventArgs e)
        {
            CompressionSource source = SelectCompressionSource();
            if (source == null) return;
            if (!TryGetOutputFolder(out string outputFolder)) return;
            string archiveName = (archiveNameTextBox.Text ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(archiveName))
            {
                MessageBox.Show("Archive Name is required.", "Input Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string selectedFormat = GetSelectedFormat();
            string extension = selectedFormat == "tar.gz" ? ".tar.gz" : ".zip";
            string outputPath = Path.Combine(outputFolder, archiveName + extension);

            try
            {
                ToggleActionButtons(false);
                SetProgressStatus("Compressing...", 0);
                CreateArchive(source, outputPath, selectedFormat);

                long splitBytes = enableSplitCheckBox.Checked ? Convert.ToInt64(splitSizeUpDown.Value) * 1024L * 1024L : 0;
                if (splitBytes > 0)
                {
                    int partCount = SplitArchiveFile(outputPath, splitBytes);
                    SetProgressStatus("Done", 100);
                    NotifyOperationCompleted($"Compressed and split into {partCount} parts.\nOutput: {outputFolder}");
                }
                else
                {
                    SetProgressStatus("Done", 100);
                    NotifyOperationCompleted($"{source.DisplayName} compressed successfully.\nOutput: {outputPath}");
                }
            }
            catch (Exception ex)
            {
                SetProgressStatus("Failed", 0);
                MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShowDesktopNotification("Compression failed", ex.Message, ToolTipIcon.Error);
            }
            finally
            {
                ToggleActionButtons(true);
            }
        }

        private void ExtractButton_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.Filter = "Archive files (*.zip;*.tar.gz;*.part001)|*.zip;*.tar.gz;*.part001|ZIP files (*.zip)|*.zip|TAR.GZ files (*.tar.gz)|*.tar.gz|Split files (*.part001)|*.part001";
                if (openFileDialog.ShowDialog() != DialogResult.OK) return;
                if (!TryGetOutputFolder(out string extractPath)) return;

                string selectedArchivePath = openFileDialog.FileName;
                string archivePathForExtract = selectedArchivePath;
                string tempArchivePath = null;

                if (IsSplitPartFile(selectedArchivePath))
                {
                    SetProgressStatus("Rebuilding split archive...", 5);
                    archivePathForExtract = RebuildSplitArchive(selectedArchivePath);
                    tempArchivePath = archivePathForExtract;
                }

                try
                {
                    ToggleActionButtons(false);
                    SetProgressStatus("Extracting...", 10);
                    if (archivePathForExtract.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                        ExtractZipArchive(archivePathForExtract, extractPath);
                    else if (archivePathForExtract.EndsWith(".tar.gz", StringComparison.OrdinalIgnoreCase))
                        ExtractTarGzArchive(archivePathForExtract, extractPath);
                    else
                        throw new NotSupportedException("Only .zip and .tar.gz archives are supported.");

                    SetProgressStatus("Done", 100);
                    NotifyOperationCompleted($"Archive extracted successfully.\nOutput: {extractPath}");
                }
                catch (Exception ex)
                {
                    SetProgressStatus("Failed", 0);
                    MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    ShowDesktopNotification("Extraction failed", ex.Message, ToolTipIcon.Error);
                }
                finally
                {
                    ToggleActionButtons(true);
                    if (!string.IsNullOrEmpty(tempArchivePath) && File.Exists(tempArchivePath))
                        File.Delete(tempArchivePath);
                }
            }
        }

        private void BrowseOutputFolderButton_Click(object sender, EventArgs e)
        {
            using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
            {
                if (Directory.Exists(outputFolderTextBox.Text))
                {
                    folderDialog.SelectedPath = outputFolderTextBox.Text;
                }

                if (folderDialog.ShowDialog() == DialogResult.OK)
                {
                    outputFolderTextBox.Text = folderDialog.SelectedPath;
                }
            }
        }

        private void EnableSplitCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            splitSizeUpDown.Enabled = enableSplitCheckBox.Checked;
        }

        private CompressionSource SelectCompressionSource()
        {
            bool selectFolder = sourceTypeComboBox.SelectedItem?.ToString() != "File";
            if (selectFolder)
            {
                using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
                {
                    if (folderDialog.ShowDialog() != DialogResult.OK) return null;
                    return new CompressionSource
                    {
                        BasePath = folderDialog.SelectedPath,
                        Files = Directory.GetFiles(folderDialog.SelectedPath, "*", SearchOption.AllDirectories),
                        DisplayName = "Folder",
                        IncludeRootDirectory = true,
                        RootDirectoryName = Path.GetFileName(folderDialog.SelectedPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
                    };
                }
            }

            using (OpenFileDialog fileDialog = new OpenFileDialog())
            {
                fileDialog.Filter = "All files (*.*)|*.*";
                if (fileDialog.ShowDialog() != DialogResult.OK) return null;
                return new CompressionSource
                {
                    BasePath = Path.GetDirectoryName(fileDialog.FileName),
                    Files = new[] { fileDialog.FileName },
                    DisplayName = "File",
                    IncludeRootDirectory = false,
                    RootDirectoryName = string.Empty
                };
            }
        }

        private string GetSelectedFormat() => archiveFormatComboBox.SelectedItem?.ToString() == "tar.gz" ? "tar.gz" : "zip";

        private void CreateArchive(CompressionSource source, string outputPath, string format)
        {
            if (format == "tar.gz") CreateTarGzArchive(source, outputPath);
            else CreateZipArchive(source, outputPath);
        }

        private void CreateZipArchive(CompressionSource source, string outputPath)
        {
            string fullOutputPath = Path.GetFullPath(outputPath);
            string[] files = source.Files ?? Array.Empty<string>();
            int total = Math.Max(files.Length, 1);
            int processed = 0;

            using (FileStream zipToOpen = new FileStream(outputPath, FileMode.Create))
            using (ZipArchive archive = new ZipArchive(zipToOpen, ZipArchiveMode.Create))
            {
                foreach (string file in files)
                {
                    string fullFilePath = Path.GetFullPath(file);
                    if (string.Equals(fullFilePath, fullOutputPath, StringComparison.OrdinalIgnoreCase)) continue;
                    if (fullFilePath.StartsWith(fullOutputPath + ".part", StringComparison.OrdinalIgnoreCase)) continue;

                    string entryName = BuildEntryName(source, file, forTar: false);
                    archive.CreateEntryFromFile(file, entryName);
                    processed++;
                    UpdateProgress(processed, total, $"Compressing {processed}/{total}");
                }
            }
        }

        private void CreateTarGzArchive(CompressionSource source, string outputPath)
        {
            string fullOutputPath = Path.GetFullPath(outputPath);
            string[] files = source.Files ?? Array.Empty<string>();
            int total = Math.Max(files.Length, 1);
            int processed = 0;

            using (FileStream fileStream = new FileStream(outputPath, FileMode.Create))
            using (GZipStream gzipStream = new GZipStream(fileStream, CompressionLevel.Optimal))
            using (TarWriter tarWriter = new TarWriter(gzipStream, leaveOpen: false))
            {
                foreach (string file in files)
                {
                    string fullFilePath = Path.GetFullPath(file);
                    if (string.Equals(fullFilePath, fullOutputPath, StringComparison.OrdinalIgnoreCase)) continue;
                    if (fullFilePath.StartsWith(fullOutputPath + ".part", StringComparison.OrdinalIgnoreCase)) continue;

                    string entryName = BuildEntryName(source, file, forTar: true);
                    using (FileStream sourceStream = File.OpenRead(file))
                    {
                        PaxTarEntry entry = new PaxTarEntry(TarEntryType.RegularFile, entryName);
                        entry.DataStream = sourceStream;
                        tarWriter.WriteEntry(entry);
                    }
                    processed++;
                    UpdateProgress(processed, total, $"Compressing {processed}/{total}");
                }
            }
        }

        private void ExtractZipArchive(string archivePath, string extractPath)
        {
            using (ZipArchive archive = ZipFile.OpenRead(archivePath))
            {
                int total = Math.Max(archive.Entries.Count, 1);
                int processed = 0;
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string destinationPath = Path.Combine(extractPath, entry.FullName);
                    string fullDestinationPath = Path.GetFullPath(destinationPath);
                    string fullExtractRoot = Path.GetFullPath(extractPath) + Path.DirectorySeparatorChar;
                    if (!fullDestinationPath.StartsWith(fullExtractRoot, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidOperationException("Archive contains an invalid path.");

                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(fullDestinationPath);
                        processed++;
                        UpdateProgress(processed, total, $"Extracting {processed}/{total}");
                        continue;
                    }

                    Directory.CreateDirectory(Path.GetDirectoryName(fullDestinationPath));
                    if (!entry.Name.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase))
                        entry.ExtractToFile(fullDestinationPath, overwrite: true);

                    processed++;
                    UpdateProgress(processed, total, $"Extracting {processed}/{total}");
                }
            }
        }

        private void ExtractTarGzArchive(string archivePath, string extractPath)
        {
            int totalEntries = CountTarEntries(archivePath);
            int processed = 0;
            using (FileStream fileStream = File.OpenRead(archivePath))
            using (GZipStream gzipStream = new GZipStream(fileStream, CompressionMode.Decompress))
            using (TarReader tarReader = new TarReader(gzipStream))
            {
                TarEntry entry;
                while ((entry = tarReader.GetNextEntry()) != null)
                {
                    string entryName = (entry.Name ?? string.Empty).Replace('/', Path.DirectorySeparatorChar);
                    string destinationPath = Path.GetFullPath(Path.Combine(extractPath, entryName));
                    string fullExtractRoot = Path.GetFullPath(extractPath) + Path.DirectorySeparatorChar;
                    if (!destinationPath.StartsWith(fullExtractRoot, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidOperationException("Archive contains an invalid path.");

                    if (entry.EntryType == TarEntryType.Directory)
                    {
                        Directory.CreateDirectory(destinationPath);
                        processed++;
                        UpdateProgress(processed, totalEntries, $"Extracting {processed}/{totalEntries}");
                        continue;
                    }

                    if (!string.IsNullOrEmpty(Path.GetFileName(destinationPath)))
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                        if (entry.DataStream != null)
                        {
                            using (FileStream outputStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write))
                                entry.DataStream.CopyTo(outputStream);
                        }
                    }

                    processed++;
                    UpdateProgress(processed, totalEntries, $"Extracting {processed}/{totalEntries}");
                }
            }
        }

        private int SplitArchiveFile(string archivePath, long splitBytes)
        {
            if (splitBytes <= 0) return 0;
            byte[] buffer = new byte[81920];
            int partNumber = 1;
            long totalBytes = new FileInfo(archivePath).Length;

            using (FileStream sourceStream = new FileStream(archivePath, FileMode.Open, FileAccess.Read))
            {
                while (sourceStream.Position < sourceStream.Length)
                {
                    string partPath = $"{archivePath}.part{partNumber:000}";
                    long writtenBytes = 0;
                    using (FileStream partStream = new FileStream(partPath, FileMode.Create, FileAccess.Write))
                    {
                        while (writtenBytes < splitBytes && sourceStream.Position < sourceStream.Length)
                        {
                            int bytesToRead = (int)Math.Min(buffer.Length, Math.Min(splitBytes - writtenBytes, sourceStream.Length - sourceStream.Position));
                            int bytesRead = sourceStream.Read(buffer, 0, bytesToRead);
                            if (bytesRead <= 0) break;
                            partStream.Write(buffer, 0, bytesRead);
                            writtenBytes += bytesRead;
                            UpdateProgress((int)Math.Min(sourceStream.Position, int.MaxValue), (int)Math.Min(totalBytes, int.MaxValue), "Splitting archive...");
                        }
                    }
                    partNumber++;
                }
            }

            File.Delete(archivePath);
            return partNumber - 1;
        }

        private bool IsSplitPartFile(string archivePath) => Regex.IsMatch(archivePath, @"\.part\d{3}$", RegexOptions.IgnoreCase);

        private string RebuildSplitArchive(string firstPartPath)
        {
            string restoredPath = Path.Combine(Path.GetTempPath(), Path.GetFileNameWithoutExtension(firstPartPath));
            byte[] buffer = new byte[81920];
            long totalBytes = GetTotalSplitBytes(firstPartPath);
            long mergedBytes = 0;

            using (FileStream outputStream = new FileStream(restoredPath, FileMode.Create, FileAccess.Write))
            {
                for (int partNumber = 1; ; partNumber++)
                {
                    string partPath = $"{Path.GetFileNameWithoutExtension(firstPartPath)}.part{partNumber:000}";
                    string fullPartPath = Path.Combine(Path.GetDirectoryName(firstPartPath), partPath);
                    if (!File.Exists(fullPartPath))
                    {
                        if (partNumber == 1) throw new FileNotFoundException("Split archive parts were not found.");
                        break;
                    }

                    using (FileStream inputStream = new FileStream(fullPartPath, FileMode.Open, FileAccess.Read))
                    {
                        int bytesRead;
                        while ((bytesRead = inputStream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            outputStream.Write(buffer, 0, bytesRead);
                            mergedBytes += bytesRead;
                            UpdateProgress((int)Math.Min(mergedBytes, int.MaxValue), (int)Math.Min(totalBytes, int.MaxValue), "Rebuilding split archive...");
                        }
                    }
                }
            }
            return restoredPath;
        }

        private int CountTarEntries(string archivePath)
        {
            int count = 0;
            using (FileStream fileStream = File.OpenRead(archivePath))
            using (GZipStream gzipStream = new GZipStream(fileStream, CompressionMode.Decompress))
            using (TarReader tarReader = new TarReader(gzipStream))
                while (tarReader.GetNextEntry() != null) count++;
            return Math.Max(count, 1);
        }

        private long GetTotalSplitBytes(string firstPartPath)
        {
            long total = 0;
            for (int partNumber = 1; ; partNumber++)
            {
                string partPath = $"{Path.GetFileNameWithoutExtension(firstPartPath)}.part{partNumber:000}";
                string fullPartPath = Path.Combine(Path.GetDirectoryName(firstPartPath), partPath);
                if (!File.Exists(fullPartPath)) break;
                total += new FileInfo(fullPartPath).Length;
            }
            return Math.Max(total, 1);
        }

        private string GetRelativePath(string basePath, string targetPath)
        {
            Uri baseUri = new Uri(basePath.EndsWith("\\") ? basePath : basePath + "\\");
            Uri targetUri = new Uri(targetPath);
            return Uri.UnescapeDataString(baseUri.MakeRelativeUri(targetUri).ToString().Replace('/', Path.DirectorySeparatorChar));
        }

        private string BuildEntryName(CompressionSource source, string filePath, bool forTar)
        {
            string relativePath = GetRelativePath(source.BasePath, filePath);
            string entryName = source.IncludeRootDirectory && !string.IsNullOrWhiteSpace(source.RootDirectoryName)
                ? Path.Combine(source.RootDirectoryName, relativePath)
                : relativePath;

            if (forTar)
            {
                entryName = entryName.Replace('\\', '/');
            }

            return entryName;
        }

        private void UpdateProgress(int current, int total, string message)
        {
            int safeTotal = Math.Max(total, 1);
            int safeCurrent = Math.Min(Math.Max(current, 0), safeTotal);
            int percent = (int)((safeCurrent * 100L) / safeTotal);
            SetProgressStatus(message, percent);
        }

        private void SetProgressStatus(string message, int percent)
        {
            int clampedPercent = Math.Min(Math.Max(percent, 0), 100);
            progressBar.Value = clampedPercent;
            progressPercentLabel.Text = $"{clampedPercent}%";
            statusLabel.Text = message;
            Application.DoEvents();
        }

        private void ToggleActionButtons(bool enabled)
        {
            compressButton.Enabled = enabled;
            extractButton.Enabled = enabled;
            browseOutputFolderButton.Enabled = enabled;
        }

        private bool TryGetOutputFolder(out string outputFolder)
        {
            outputFolder = (outputFolderTextBox.Text ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(outputFolder))
            {
                MessageBox.Show("Output Folder is required.", "Input Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            if (!Directory.Exists(outputFolder))
            {
                try
                {
                    Directory.CreateDirectory(outputFolder);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Cannot create output folder.\n{ex.Message}", "Input Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return false;
                }
            }

            return true;
        }

        private void NotifyOperationCompleted(string message)
        {
            MessageBox.Show(message, "Completed", MessageBoxButtons.OK, MessageBoxIcon.Information);
            ShowDesktopNotification("Completed", message, ToolTipIcon.Info);
        }

        private void ShowDesktopNotification(string title, string message, ToolTipIcon icon)
        {
            completionNotifyIcon.BalloonTipTitle = title;
            completionNotifyIcon.BalloonTipText = message;
            completionNotifyIcon.BalloonTipIcon = icon;
            completionNotifyIcon.ShowBalloonTip(3000);
        }

        private void ZipMasterForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            completionNotifyIcon.Visible = false;
            completionNotifyIcon.Dispose();
        }
    }
}
