using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ZipMasterWin01
{
    public partial class Form1 : Form
    {
        public Form1()
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
            using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
            {
                if (folderDialog.ShowDialog() == DialogResult.OK)
                {
                    string sourceFolder = folderDialog.SelectedPath;

                    using (SaveFileDialog saveFileDialog = new SaveFileDialog())
                    {
                        saveFileDialog.Filter = "ZIP files (*.zip)|*.zip";
                        if (saveFileDialog.ShowDialog() == DialogResult.OK)
                        {
                            string zipPath = saveFileDialog.FileName;

                            using (FileStream zipToOpen = new FileStream(zipPath, FileMode.Create))
                            using (ZipArchive archive = new ZipArchive(zipToOpen, ZipArchiveMode.Create))
                            {
                                foreach (string file in Directory.GetFiles(sourceFolder, "*", SearchOption.AllDirectories))
                                {
                                    string entryName = GetRelativePath(sourceFolder, file);
                                    archive.CreateEntryFromFile(file, entryName);
                                }
                            }

                            MessageBox.Show("Folder compressed successfully!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                    }
                }
            }
        }

        private void ExtractButton_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog openFileDialog = new OpenFileDialog())
            {
                openFileDialog.Filter = "ZIP files (*.zip)|*.zip";
                if (openFileDialog.ShowDialog() == DialogResult.OK)
                {
                    string zipPath = openFileDialog.FileName;

                    using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
                    {
                        if (folderDialog.ShowDialog() == DialogResult.OK)
                        {
                            string extractPath = folderDialog.SelectedPath;

                            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
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
                    }
                }
            }
        }

        private string GetRelativePath(string basePath, string targetPath)
        {
            Uri baseUri = new Uri(basePath.EndsWith("\\") ? basePath : basePath + "\\");
            Uri targetUri = new Uri(targetPath);
            return Uri.UnescapeDataString(baseUri.MakeRelativeUri(targetUri).ToString().Replace('/', Path.DirectorySeparatorChar));
        }
    }
}
