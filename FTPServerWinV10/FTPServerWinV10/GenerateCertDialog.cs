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
                ErrorDialog.ShowWarning(this, "입력 오류", "서버 이름 (CN)을 입력하세요.",
                    "인증서의 Common Name입니다. 호스트 이름 또는 도메인을 입력하세요.");
                txtCN.Focus();
                return;
            }
            if (string.IsNullOrWhiteSpace(txtSavePath.Text))
            {
                ErrorDialog.ShowWarning(this, "입력 오류", "저장 경로를 선택하세요.",
                    "생성할 인증서 파일(.pfx)의 전체 경로를 지정해야 합니다.");
                return;
            }
            DialogResult = DialogResult.OK;
            Close();
        }
    }
}
