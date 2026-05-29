using System;
using System.Windows.Forms;

namespace FTPServerWinV10
{
    public partial class GenerateCertDialog : Form
    {
        public string CommonName  => txtCN.Text.Trim();
        public int    ValidityYears => (int)numYears.Value;
        public string PfxPassword => txtPassword.Text;
        public string PfxPath     => txtSavePath.Text;

        public GenerateCertDialog()
        {
            InitializeComponent();
            txtCN.Text = System.Net.Dns.GetHostName();
            txtSavePath.Text = System.IO.Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory, "server_cert.pfx");
        }

        private void btnBrowse_Click(object sender, EventArgs e)
        {
            saveFileDialog1.InitialDirectory = AppDomain.CurrentDomain.BaseDirectory;
            if (saveFileDialog1.ShowDialog() == DialogResult.OK)
                txtSavePath.Text = saveFileDialog1.FileName;
        }

        private void btnGenerate_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtCN.Text))
            {
                MessageBox.Show("서버 이름 (CN)을 입력하세요.", "입력 오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtCN.Focus();
                return;
            }
            if (string.IsNullOrWhiteSpace(txtSavePath.Text))
            {
                MessageBox.Show("저장 경로를 선택하세요.", "입력 오류",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            DialogResult = DialogResult.OK;
            Close();
        }
    }
}
