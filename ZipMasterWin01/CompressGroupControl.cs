using System;
using System.Windows.Forms;

namespace ZipMasterWin01
{
    public partial class CompressGroupControl : UserControl
    {
        public CompressGroupControl()
        {
            InitializeComponent();
            radioCompressSingle.CheckedChanged += OnSplitModeChanged;
            radioCompressSplit.CheckedChanged += OnSplitModeChanged;
            buttonCompressFiles.Click += (s, e) => CompressFromFilesRequested?.Invoke(this, e);
            buttonCompressFolder.Click += (s, e) => CompressFromFolderRequested?.Invoke(this, e);
            UpdateSplitPanel();
        }

        public event EventHandler CompressFromFilesRequested;

        public event EventHandler CompressFromFolderRequested;

        public bool IsSplitCompress
        {
            get { return radioCompressSplit.Checked; }
        }

        public long SplitPartSizeBytes
        {
            get { return (long)numericSplitMb.Value * 1024L * 1024L; }
        }

        private void OnSplitModeChanged(object sender, EventArgs e)
        {
            UpdateSplitPanel();
        }

        private void UpdateSplitPanel()
        {
            panelSplitSize.Enabled = radioCompressSplit.Checked;
        }
    }
}
