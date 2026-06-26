namespace HWP2DocWinV10;

partial class LlmSettingsDialog
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        lblTitle = new Label();
        lblEndpointCaption = new Label();
        lblEndpoint = new Label();
        lblModelCaption = new Label();
        cboModel = new ComboBox();
        btnTest = new Button();
        lblTestResult = new Label();
        lblTargetsCaption = new Label();
        flpTargets = new FlowLayoutPanel();
        btnOk = new Button();
        btnCancel = new Button();
        SuspendLayout();
        //
        // lblTitle
        //
        lblTitle.AutoSize = true;
        lblTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
        lblTitle.ForeColor = Color.FromArgb(31, 35, 40);
        lblTitle.Location = new Point(20, 18);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(120, 25);
        lblTitle.TabIndex = 0;
        lblTitle.Text = "LLM 설정";
        //
        // lblEndpointCaption
        //
        lblEndpointCaption.AutoSize = true;
        lblEndpointCaption.Font = new Font("Segoe UI", 9F);
        lblEndpointCaption.ForeColor = Color.FromArgb(71, 85, 105);
        lblEndpointCaption.Location = new Point(20, 60);
        lblEndpointCaption.Name = "lblEndpointCaption";
        lblEndpointCaption.Size = new Size(80, 15);
        lblEndpointCaption.TabIndex = 1;
        lblEndpointCaption.Text = "서버 주소";
        //
        // lblEndpoint
        //
        lblEndpoint.AutoSize = true;
        lblEndpoint.Font = new Font("Segoe UI", 9F);
        lblEndpoint.ForeColor = Color.FromArgb(31, 35, 40);
        lblEndpoint.Location = new Point(110, 60);
        lblEndpoint.Name = "lblEndpoint";
        lblEndpoint.Size = new Size(150, 15);
        lblEndpoint.TabIndex = 2;
        lblEndpoint.Text = "http://localhost:11434";
        //
        // lblModelCaption
        //
        lblModelCaption.AutoSize = true;
        lblModelCaption.Font = new Font("Segoe UI", 9F);
        lblModelCaption.ForeColor = Color.FromArgb(71, 85, 105);
        lblModelCaption.Location = new Point(20, 92);
        lblModelCaption.Name = "lblModelCaption";
        lblModelCaption.Size = new Size(80, 15);
        lblModelCaption.TabIndex = 3;
        lblModelCaption.Text = "모델 이름";
        //
        // cboModel
        //
        cboModel.DropDownStyle = ComboBoxStyle.DropDown;
        cboModel.Font = new Font("Segoe UI", 9F);
        cboModel.Location = new Point(110, 89);
        cboModel.Name = "cboModel";
        cboModel.Size = new Size(300, 23);
        cboModel.TabIndex = 4;
        //
        // btnTest
        //
        btnTest.Font = new Font("Segoe UI", 9F);
        btnTest.Location = new Point(20, 130);
        btnTest.Name = "btnTest";
        btnTest.Size = new Size(100, 28);
        btnTest.TabIndex = 5;
        btnTest.Text = "연결 테스트";
        btnTest.UseVisualStyleBackColor = true;
        btnTest.Click += btnTest_Click;
        //
        // lblTestResult
        //
        lblTestResult.AutoSize = true;
        lblTestResult.Font = new Font("Segoe UI", 9F);
        lblTestResult.ForeColor = Color.FromArgb(100, 116, 139);
        lblTestResult.Location = new Point(130, 137);
        lblTestResult.Name = "lblTestResult";
        lblTestResult.Size = new Size(190, 15);
        lblTestResult.TabIndex = 6;
        //
        // lblTargetsCaption
        //
        lblTargetsCaption.AutoSize = true;
        lblTargetsCaption.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblTargetsCaption.ForeColor = Color.FromArgb(31, 35, 40);
        lblTargetsCaption.Location = new Point(20, 172);
        lblTargetsCaption.Name = "lblTargetsCaption";
        lblTargetsCaption.Size = new Size(200, 15);
        lblTargetsCaption.TabIndex = 7;
        lblTargetsCaption.Text = "처리 대상 (하나 이상 선택)";
        //
        // flpTargets
        //
        flpTargets.AutoScroll = true;
        flpTargets.FlowDirection = FlowDirection.TopDown;
        flpTargets.Location = new Point(20, 194);
        flpTargets.Name = "flpTargets";
        flpTargets.Size = new Size(390, 118);
        flpTargets.TabIndex = 8;
        flpTargets.WrapContents = false;
        //
        // btnOk
        //
        btnOk.BackColor = Color.FromArgb(37, 99, 235);
        btnOk.DialogResult = DialogResult.None;
        btnOk.FlatAppearance.BorderSize = 0;
        btnOk.FlatStyle = FlatStyle.Flat;
        btnOk.Font = new Font("Segoe UI", 9.5F);
        btnOk.ForeColor = Color.White;
        btnOk.Location = new Point(230, 328);
        btnOk.Name = "btnOk";
        btnOk.Size = new Size(90, 32);
        btnOk.TabIndex = 9;
        btnOk.Text = "저장";
        btnOk.UseVisualStyleBackColor = false;
        btnOk.Click += btnOk_Click;
        //
        // btnCancel
        //
        btnCancel.DialogResult = DialogResult.Cancel;
        btnCancel.Font = new Font("Segoe UI", 9.5F);
        btnCancel.Location = new Point(326, 328);
        btnCancel.Name = "btnCancel";
        btnCancel.Size = new Size(84, 32);
        btnCancel.TabIndex = 10;
        btnCancel.Text = "취소";
        btnCancel.UseVisualStyleBackColor = true;
        //
        // LlmSettingsDialog
        //
        AcceptButton = btnOk;
        CancelButton = btnCancel;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.White;
        ClientSize = new Size(430, 378);
        Controls.Add(lblTitle);
        Controls.Add(lblEndpointCaption);
        Controls.Add(lblEndpoint);
        Controls.Add(lblModelCaption);
        Controls.Add(cboModel);
        Controls.Add(btnTest);
        Controls.Add(lblTestResult);
        Controls.Add(lblTargetsCaption);
        Controls.Add(flpTargets);
        Controls.Add(btnOk);
        Controls.Add(btnCancel);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "LlmSettingsDialog";
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "LLM 설정";
        ResumeLayout(false);
        PerformLayout();
    }

    private Label lblTitle;
    private Label lblEndpointCaption;
    private Label lblEndpoint;
    private Label lblModelCaption;
    private ComboBox cboModel;
    private Button btnTest;
    private Label lblTestResult;
    private Label lblTargetsCaption;
    private FlowLayoutPanel flpTargets;
    private Button btnOk;
    private Button btnCancel;
}
