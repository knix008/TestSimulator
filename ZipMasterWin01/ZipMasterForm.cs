using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ZipMasterWin01
{
    public partial class ZipMasterForm : Form
    {
        private readonly Progress<ProgressSnapshot> _progressReporter;

        public ZipMasterForm()
        {
            InitializeComponent();
            TryLoadWindowIcon();
            _progressReporter = new Progress<ProgressSnapshot>(ApplyProgressSnapshot);
            WireEvents();
            UpdateSplitPanelEnabled();
            toolStripStatusLabelMain.Text = "준비";
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyTitleBarColors();
        }

        private const int DwmwaUseImmersiveDarkMode = 20;
        private const int DwmwaCaptionColor = 35;
        private const int DwmwaCaptionTextColor = 36;

        [DllImport("dwmapi.dll", PreserveSig = true)]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int dwAttribute, ref int pvAttribute, int cbAttribute);

        private static int ColorToColorRef(Color color)
        {
            return (color.B << 16) | (color.G << 8) | color.R;
        }

        /// <summary>
        /// Windows 11+: 사용자 지정 캡션 색. 그 이전 OS는 어두운 타이틀만 시도합니다.
        /// WinForms는 기본적으로 시스템 타이틀만 그리므로 DWM 속성이 필요합니다.
        /// </summary>
        private void ApplyTitleBarColors()
        {
            if (LicenseManager.UsageMode == LicenseUsageMode.Designtime || !IsHandleCreated)
            {
                return;
            }

            try
            {
                int useDark = 1;
                DwmSetWindowAttribute(Handle, DwmwaUseImmersiveDarkMode, ref useDark, Marshal.SizeOf(typeof(int)));
            }
            catch
            {
            }

            try
            {
                Color caption = Color.FromArgb(33, 33, 33);
                Color captionText = Color.White;
                int captionRef = ColorToColorRef(caption);
                int textRef = ColorToColorRef(captionText);
                DwmSetWindowAttribute(Handle, DwmwaCaptionColor, ref captionRef, Marshal.SizeOf(typeof(int)));
                DwmSetWindowAttribute(Handle, DwmwaCaptionTextColor, ref textRef, Marshal.SizeOf(typeof(int)));
            }
            catch
            {
            }
        }

        private void WireEvents()
        {
            radioCompressSingle.CheckedChanged += OnCompressModeChanged;
            radioCompressSplit.CheckedChanged += OnCompressModeChanged;
            buttonCompressFiles.Click += ButtonCompressFiles_Click;
            buttonCompressFolder.Click += ButtonCompressFolder_Click;
            buttonExtract.Click += ButtonExtract_Click;
        }

        private void OnCompressModeChanged(object sender, EventArgs e)
        {
            UpdateSplitPanelEnabled();
        }

        private void UpdateSplitPanelEnabled()
        {
            panelSplitSize.Enabled = radioCompressSplit.Checked;
        }

        private void ApplyProgressSnapshot(ProgressSnapshot snapshot)
        {
            if (snapshot.UseMarquee)
            {
                toolStripStatusLabelMain.Text = snapshot.StatusText;
                SetProgressMarquee();
                return;
            }

            if (snapshot.UseByteRatio)
            {
                ReportBytesProgress(snapshot.StatusText, snapshot.BytesCurrent, snapshot.BytesTotal);
                return;
            }

            ReportCountProgress(snapshot.StatusText, snapshot.Current, snapshot.Total);
        }

        private void SetStatus(string message)
        {
            toolStripStatusLabelMain.Text = message;
        }

        private void BeginDeterminateProgress(int maximum)
        {
            toolStripProgressBarMain.Visible = true;
            toolStripProgressBarMain.Style = ProgressBarStyle.Continuous;
            toolStripProgressBarMain.Minimum = 0;
            toolStripProgressBarMain.Maximum = Math.Max(1, maximum);
            toolStripProgressBarMain.Value = 0;
        }

        private void SetProgressValue(int value)
        {
            int max = toolStripProgressBarMain.Maximum;
            if (value < 0)
            {
                value = 0;
            }

            if (value > max)
            {
                value = max;
            }

            toolStripProgressBarMain.Value = value;
        }

        private void SetProgressMarquee()
        {
            toolStripProgressBarMain.Visible = true;
            toolStripProgressBarMain.Style = ProgressBarStyle.Marquee;
            toolStripProgressBarMain.MarqueeAnimationSpeed = 30;
        }

        private void EndProgress()
        {
            toolStripProgressBarMain.Visible = false;
            toolStripProgressBarMain.Style = ProgressBarStyle.Continuous;
            toolStripProgressBarMain.Value = 0;
        }

        private void ReportCountProgress(string message, int current, int total)
        {
            toolStripStatusLabelMain.Text = message;
            if (total <= 0)
            {
                EndProgress();
                return;
            }

            if (!toolStripProgressBarMain.Visible || toolStripProgressBarMain.Style == ProgressBarStyle.Marquee)
            {
                BeginDeterminateProgress(total);
            }
            else if (toolStripProgressBarMain.Maximum != total)
            {
                toolStripProgressBarMain.Maximum = Math.Max(1, total);
            }

            SetProgressValue(Math.Min(current, toolStripProgressBarMain.Maximum));
        }

        private void ReportBytesProgress(string message, long current, long total)
        {
            if (total <= 0)
            {
                toolStripStatusLabelMain.Text = message;
                return;
            }

            int percent = (int)Math.Min(100, Math.Floor((double)current / total * 100.0));
            toolStripStatusLabelMain.Text = string.Format("{0} {1}%", message, percent);

            if (!toolStripProgressBarMain.Visible || toolStripProgressBarMain.Style == ProgressBarStyle.Marquee)
            {
                BeginDeterminateProgress(100);
            }

            SetProgressValue(percent);
        }

        private void TryLoadWindowIcon()
        {
            if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            {
                return;
            }

            try
            {
                string path = Path.Combine(Application.StartupPath, "daemon_hammer.ico");
                if (!File.Exists(path))
                {
                    path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "daemon_hammer.ico");
                }

                if (File.Exists(path))
                {
                    Icon = new Icon(path);
                }
            }
            catch
            {
            }
        }

        private void SetOperationUiLocked(bool locked)
        {
            panelMain.Enabled = !locked;
            Cursor = locked ? Cursors.WaitCursor : Cursors.Default;
        }

        private async void ButtonCompressFiles_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog fileDialog = new OpenFileDialog())
            {
                fileDialog.Multiselect = true;
                fileDialog.Filter = "모든 파일 (*.*)|*.*";
                fileDialog.Title = "압축할 파일 선택";
                if (fileDialog.ShowDialog() != DialogResult.OK || fileDialog.FileNames.Length == 0)
                {
                    return;
                }

                await RunCompressionAsync(fileDialog.FileNames.ToList()).ConfigureAwait(true);
            }
        }

        private async void ButtonCompressFolder_Click(object sender, EventArgs e)
        {
            using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
            {
                folderDialog.Description = "압축할 폴더를 선택하세요.";
                if (folderDialog.ShowDialog() != DialogResult.OK)
                {
                    return;
                }

                await RunCompressionAsync(new List<string> { folderDialog.SelectedPath }).ConfigureAwait(true);
            }
        }

        private async Task RunCompressionAsync(List<string> sources)
        {
            if (sources == null || sources.Count == 0)
            {
                return;
            }

            using (SaveFileDialog saveFileDialog = new SaveFileDialog())
            {
                saveFileDialog.Filter = "ZIP 파일 (*.zip)|*.zip";
                saveFileDialog.Title = "저장할 ZIP 파일 이름";
                if (saveFileDialog.ShowDialog() != DialogResult.OK)
                {
                    return;
                }

                string zipPath = saveFileDialog.FileName;
                bool split = radioCompressSplit.Checked;

                SetOperationUiLocked(true);
                EndProgress();
                try
                {
                    if (!split)
                    {
                        await Task.Run(() =>
                        {
                            CreateZipFromSources(sources, zipPath, _progressReporter);
                        }).ConfigureAwait(true);

                        SetStatus("압축 완료 (단일 ZIP)");
                        MessageBox.Show(this, "압축이 완료되었습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    long partSizeBytes = (long)numericSplitMb.Value * 1024L * 1024L;
                    string tempZipPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".zip");
                    try
                    {
                        int partCount = 0;
                        await Task.Run(() =>
                        {
                            CreateZipFromSources(sources, tempZipPath, _progressReporter);
                            partCount = SplitFile(tempZipPath, zipPath, partSizeBytes, _progressReporter);
                        }).ConfigureAwait(true);

                        SetStatus(string.Format("분할 압축 완료 ({0}개 파일)", partCount));
                        MessageBox.Show(
                            this,
                            string.Format("분할 압축이 완료되었습니다.\n생성된 조각 수: {0}", partCount),
                            "완료",
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
                    SetStatus("오류");
                    MessageBox.Show(this, string.Format("압축 중 오류가 발생했습니다.\n{0}", ex.Message), "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                finally
                {
                    EndProgress();
                    SetOperationUiLocked(false);
                }
            }
        }

        private async void ButtonExtract_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.Filter = "ZIP (*.zip;*.001)|*.zip;*.001";
                openFileDialog.Title = "풀 ZIP 파일 선택";
                if (openFileDialog.ShowDialog() != DialogResult.OK)
                {
                    return;
                }

                string zipPath = openFileDialog.FileName;

                using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
                {
                    folderDialog.Description = "압축을 풀 폴더를 선택하세요.";
                    if (folderDialog.ShowDialog() != DialogResult.OK)
                    {
                        return;
                    }

                    string extractPath = folderDialog.SelectedPath;
                    SetOperationUiLocked(true);
                    EndProgress();
                    try
                    {
                        List<string> accessWarnings = await Task.Run(() =>
                        {
                            string extractSourcePath = zipPath;
                            string tempCombinedPath = null;
                            try
                            {
                                if (TryCombineSplitArchive(zipPath, out tempCombinedPath, _progressReporter))
                                {
                                    extractSourcePath = tempCombinedPath;
                                }

                                return ExtractZipToFolder(extractSourcePath, extractPath, _progressReporter);
                            }
                            finally
                            {
                                if (!string.IsNullOrEmpty(tempCombinedPath) && File.Exists(tempCombinedPath))
                                {
                                    File.Delete(tempCombinedPath);
                                }
                            }
                        }).ConfigureAwait(true);

                        foreach (string line in accessWarnings)
                        {
                            MessageBox.Show(this, line, "경고", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        }

                        SetStatus("압축 해제 완료");
                        MessageBox.Show(this, "압축 해제가 완료되었습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    catch (Exception ex)
                    {
                        SetStatus("오류");
                        MessageBox.Show(this, string.Format("압축 해제 중 오류가 발생했습니다.\n{0}", ex.Message), "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                    finally
                    {
                        EndProgress();
                        SetOperationUiLocked(false);
                    }
                }
            }
        }

        private static List<string> ExtractZipToFolder(string zipPath, string extractPath, IProgress<ProgressSnapshot> progress)
        {
            List<string> warnings = new List<string>();
            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                List<ZipArchiveEntry> entries = archive.Entries.ToList();
                int total = entries.Count;
                for (int i = 0; i < total; i++)
                {
                    ZipArchiveEntry entry = entries[i];
                    progress.Report(ProgressSnapshot.Count(string.Format("압축 해제 중… ({0}/{1})", i + 1, total), i + 1, total));

                    string destinationPath = Path.Combine(extractPath, entry.FullName);
                    Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));

                    if (!string.IsNullOrEmpty(entry.Name) && !entry.Name.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            entry.ExtractToFile(destinationPath, overwrite: true);
                        }
                        catch (UnauthorizedAccessException)
                        {
                            warnings.Add(string.Format("파일에 접근할 수 없습니다: {0}", entry.Name));
                        }
                    }
                }
            }

            return warnings;
        }

        private static List<KeyValuePair<string, string>> CollectZipEntries(IEnumerable<string> sources, Func<string, string, string> getRelativePath)
        {
            List<KeyValuePair<string, string>> list = new List<KeyValuePair<string, string>>();
            foreach (string source in sources)
            {
                if (Directory.Exists(source))
                {
                    string folderName = new DirectoryInfo(source).Name;
                    foreach (string file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
                    {
                        string relativePath = getRelativePath(source, file);
                        string entryName = Path.Combine(folderName, relativePath).Replace('\\', '/');
                        list.Add(new KeyValuePair<string, string>(file, entryName));
                    }
                }
                else if (File.Exists(source))
                {
                    list.Add(new KeyValuePair<string, string>(source, Path.GetFileName(source)));
                }
            }

            return list;
        }

        private void CreateZipFromSources(IEnumerable<string> sources, string zipPath, IProgress<ProgressSnapshot> progress)
        {
            List<KeyValuePair<string, string>> entries = CollectZipEntries(sources, GetRelativePath);
            int total = entries.Count;
            if (total == 0)
            {
                using (FileStream zipToOpen = new FileStream(zipPath, FileMode.Create))
                {
                }

                progress.Report(ProgressSnapshot.Count("압축할 파일이 없습니다.", 0, 0));
                return;
            }

            progress.Report(ProgressSnapshot.Count("압축 중… (0/" + total + ")", 0, total));

            using (FileStream zipToOpen = new FileStream(zipPath, FileMode.Create))
            using (ZipArchive archive = new ZipArchive(zipToOpen, ZipArchiveMode.Create))
            {
                for (int i = 0; i < total; i++)
                {
                    KeyValuePair<string, string> pair = entries[i];
                    archive.CreateEntryFromFile(pair.Key, pair.Value);
                    progress.Report(ProgressSnapshot.Count(string.Format("압축 중… ({0}/{1})", i + 1, total), i + 1, total));
                }
            }
        }

        private static int SplitFile(string sourceFilePath, string outputBaseZipPath, long partSizeBytes, IProgress<ProgressSnapshot> progress)
        {
            int partIndex = 1;
            byte[] buffer = new byte[81920];
            long len = new FileInfo(sourceFilePath).Length;

            using (FileStream sourceStream = new FileStream(sourceFilePath, FileMode.Open, FileAccess.Read))
            {
                while (sourceStream.Position < len)
                {
                    string outputPartPath = string.Format("{0}.{1:D3}", outputBaseZipPath, partIndex);
                    using (FileStream partStream = new FileStream(outputPartPath, FileMode.Create, FileAccess.Write))
                    {
                        long bytesToWrite = Math.Min(partSizeBytes, len - sourceStream.Position);
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
                            progress.Report(ProgressSnapshot.Bytes("분할 압축 중…", sourceStream.Position, len));
                        }
                    }

                    partIndex++;
                }
            }

            progress.Report(ProgressSnapshot.Bytes("분할 압축 중…", len, len));
            return partIndex - 1;
        }

        private static bool TryCombineSplitArchive(string selectedPath, out string combinedZipPath, IProgress<ProgressSnapshot> progress)
        {
            combinedZipPath = null;

            Match match = Regex.Match(selectedPath, @"^(.*\.zip)\.(\d{3})$", RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                return false;
            }

            progress.Report(ProgressSnapshot.Marquee("분할 ZIP 병합 중…"));

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

            long totalBytes = parts.Sum(p => new FileInfo(p).Length);
            combinedZipPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".zip");
            byte[] buffer = new byte[81920];
            long written = 0;

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
                            written += bytesRead;
                            if (totalBytes > 0)
                            {
                                progress.Report(ProgressSnapshot.Bytes("분할 ZIP 병합 중…", written, totalBytes));
                            }
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

    internal struct ProgressSnapshot
    {
        public string StatusText;
        public int Current;
        public int Total;
        public long BytesCurrent;
        public long BytesTotal;
        public bool UseByteRatio;
        public bool UseMarquee;

        public static ProgressSnapshot Count(string message, int current, int total)
        {
            return new ProgressSnapshot
            {
                StatusText = message,
                Current = current,
                Total = total,
                UseByteRatio = false,
                UseMarquee = false
            };
        }

        public static ProgressSnapshot Bytes(string message, long current, long total)
        {
            return new ProgressSnapshot
            {
                StatusText = message,
                BytesCurrent = current,
                BytesTotal = total,
                UseByteRatio = true,
                UseMarquee = false
            };
        }

        public static ProgressSnapshot Marquee(string message)
        {
            return new ProgressSnapshot
            {
                StatusText = message,
                UseMarquee = true
            };
        }
    }
}
