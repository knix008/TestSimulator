namespace EthereumWallet01
{
    partial class Wallet : System.Windows.Forms.Form // Form을 상속받도록 수정
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.btnCreateWallet = new System.Windows.Forms.Button();
            this.btnCreateWallet.Location = new System.Drawing.Point(12, 12);
            this.btnCreateWallet.Name = "btnCreateWallet";
            this.btnCreateWallet.Size = new System.Drawing.Size(200, 30);
            this.btnCreateWallet.Text = "새 이더리움 지갑 생성";
            this.btnCreateWallet.Click += new System.EventHandler(this.btnCreateWallet_Click);

            // 
            // Wallet
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(784, 441);
            Controls.Add(this.btnCreateWallet);
            Name = "Wallet";
            Text = "EthereumWallet";
            ResumeLayout(false);
        }

        #endregion

        private Button btnCreateWallet;

        // btnCreateWallet_Click 이벤트 핸들러 추가
        private void btnCreateWallet_Click(object sender, EventArgs e)
        {
            // TODO: 버튼 클릭 시 실행할 코드 작성
        }
    }
}
