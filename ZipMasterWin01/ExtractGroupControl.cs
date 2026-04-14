using System;
using System.Windows.Forms;

namespace ZipMasterWin01
{
    public partial class ExtractGroupControl : UserControl
    {
        public ExtractGroupControl()
        {
            InitializeComponent();
            buttonExtract.Click += (s, e) => ExtractRequested?.Invoke(this, e);
        }

        public event EventHandler ExtractRequested;
    }
}
