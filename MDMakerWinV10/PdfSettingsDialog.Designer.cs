namespace MDMakerWinV10;

partial class PdfSettingsDialog
{
    private System.ComponentModel.IContainer components = null;

    private GroupBox       _grpFormat;
    private Label          _lblFont;
    private ComboBox       _cmbFont;
    private Label          _lblFontSize;
    private NumericUpDown  _nudFontSize;
    private Label          _lblLineHeight;
    private NumericUpDown  _nudLineHeight;
    private Label          _lblParaSpacing;
    private NumericUpDown  _nudParaSpacing;
    private Label          _lblMarginV;
    private NumericUpDown  _nudMarginV;
    private Label          _lblMarginH;
    private NumericUpDown  _nudMarginH;
    private Label          _lblNumberHeadings;
    private CheckBox       _chkNumberHeadings;
    private Label          _lblPageNumbers;
    private ComboBox       _cmbPageNumbers;
    private FlowLayoutPanel _flowButtons;
    private Button         _btnOk;
    private Button         _btnReset;
    private Button         _btnCancel;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        _grpFormat         = new GroupBox();
        _lblFont           = new Label();
        _cmbFont           = new ComboBox();
        _lblFontSize       = new Label();
        _nudFontSize       = new NumericUpDown();
        _lblLineHeight     = new Label();
        _nudLineHeight     = new NumericUpDown();
        _lblParaSpacing    = new Label();
        _nudParaSpacing    = new NumericUpDown();
        _lblMarginV        = new Label();
        _nudMarginV        = new NumericUpDown();
        _lblMarginH        = new Label();
        _nudMarginH        = new NumericUpDown();
        _lblNumberHeadings = new Label();
        _chkNumberHeadings = new CheckBox();
        _lblPageNumbers    = new Label();
        _cmbPageNumbers    = new ComboBox();
        _flowButtons       = new FlowLayoutPanel();
        _btnOk             = new Button();
        _btnReset          = new Button();
        _btnCancel         = new Button();

        _grpFormat.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_nudFontSize).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_nudLineHeight).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_nudParaSpacing).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_nudMarginV).BeginInit();
        ((System.ComponentModel.ISupportInitialize)_nudMarginH).BeginInit();
        _flowButtons.SuspendLayout();
        SuspendLayout();

        // GroupBox — 컨트롤을 세로로 직접 배치 (디자이너에서 드래그 편집)
        _grpFormat.Controls.Add(_cmbPageNumbers);
        _grpFormat.Controls.Add(_lblPageNumbers);
        _grpFormat.Controls.Add(_chkNumberHeadings);
        _grpFormat.Controls.Add(_lblNumberHeadings);
        _grpFormat.Controls.Add(_nudMarginH);
        _grpFormat.Controls.Add(_lblMarginH);
        _grpFormat.Controls.Add(_nudMarginV);
        _grpFormat.Controls.Add(_lblMarginV);
        _grpFormat.Controls.Add(_nudParaSpacing);
        _grpFormat.Controls.Add(_lblParaSpacing);
        _grpFormat.Controls.Add(_nudLineHeight);
        _grpFormat.Controls.Add(_lblLineHeight);
        _grpFormat.Controls.Add(_nudFontSize);
        _grpFormat.Controls.Add(_lblFontSize);
        _grpFormat.Controls.Add(_cmbFont);
        _grpFormat.Controls.Add(_lblFont);
        _grpFormat.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _grpFormat.Location = new Point(0, 0);
        _grpFormat.Name = "_grpFormat";
        _grpFormat.Padding = new Padding(12, 8, 12, 12);
        _grpFormat.Size = new Size(376, 308);
        _grpFormat.TabIndex = 0;
        _grpFormat.TabStop = false;
        _grpFormat.Text = "문서 서식";

        _lblFont.AutoSize = true;
        _lblFont.Location = new Point(16, 28);
        _lblFont.Name = "_lblFont";
        _lblFont.Size = new Size(31, 15);
        _lblFont.TabIndex = 0;
        _lblFont.Text = "글꼴";

        _cmbFont.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbFont.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbFont.Location = new Point(168, 24);
        _cmbFont.Name = "_cmbFont";
        _cmbFont.Size = new Size(192, 23);
        _cmbFont.TabIndex = 1;

        _lblFontSize.AutoSize = true;
        _lblFontSize.Location = new Point(16, 60);
        _lblFontSize.Name = "_lblFontSize";
        _lblFontSize.Size = new Size(83, 15);
        _lblFontSize.TabIndex = 2;
        _lblFontSize.Text = "글꼴 크기 (pt)";

        _nudFontSize.Location = new Point(168, 56);
        _nudFontSize.Name = "_nudFontSize";
        _nudFontSize.Size = new Size(96, 23);
        _nudFontSize.TabIndex = 3;
        _nudFontSize.Value = new decimal(new int[] { 100, 0, 0, 65536 });

        _lblLineHeight.AutoSize = true;
        _lblLineHeight.Location = new Point(16, 92);
        _lblLineHeight.Name = "_lblLineHeight";
        _lblLineHeight.Size = new Size(55, 15);
        _lblLineHeight.TabIndex = 4;
        _lblLineHeight.Text = "줄 간격";

        _nudLineHeight.Location = new Point(168, 88);
        _nudLineHeight.Name = "_nudLineHeight";
        _nudLineHeight.Size = new Size(96, 23);
        _nudLineHeight.TabIndex = 5;
        _nudLineHeight.Value = new decimal(new int[] { 15, 0, 0, 65536 });

        _lblParaSpacing.AutoSize = true;
        _lblParaSpacing.Location = new Point(16, 124);
        _lblParaSpacing.Name = "_lblParaSpacing";
        _lblParaSpacing.Size = new Size(91, 15);
        _lblParaSpacing.TabIndex = 6;
        _lblParaSpacing.Text = "단락 간격 (em)";

        _nudParaSpacing.Location = new Point(168, 120);
        _nudParaSpacing.Name = "_nudParaSpacing";
        _nudParaSpacing.Size = new Size(96, 23);
        _nudParaSpacing.TabIndex = 7;
        _nudParaSpacing.Value = new decimal(new int[] { 5, 0, 0, 65536 });

        _lblMarginV.AutoSize = true;
        _lblMarginV.Location = new Point(16, 156);
        _lblMarginV.Name = "_lblMarginV";
        _lblMarginV.Size = new Size(115, 15);
        _lblMarginV.TabIndex = 8;
        _lblMarginV.Text = "위/아래 여백 (인치)";

        _nudMarginV.Location = new Point(168, 152);
        _nudMarginV.Name = "_nudMarginV";
        _nudMarginV.Size = new Size(96, 23);
        _nudMarginV.TabIndex = 9;
        _nudMarginV.DecimalPlaces = 2;
        _nudMarginV.Increment = new decimal(new int[] { 25, 0, 0, 131072 });
        _nudMarginV.Value = new decimal(new int[] { 75, 0, 0, 131072 });

        _lblMarginH.AutoSize = true;
        _lblMarginH.Location = new Point(16, 188);
        _lblMarginH.Name = "_lblMarginH";
        _lblMarginH.Size = new Size(103, 15);
        _lblMarginH.TabIndex = 10;
        _lblMarginH.Text = "좌/우 여백 (인치)";

        _nudMarginH.Location = new Point(168, 184);
        _nudMarginH.Name = "_nudMarginH";
        _nudMarginH.Size = new Size(96, 23);
        _nudMarginH.TabIndex = 11;
        _nudMarginH.DecimalPlaces = 2;
        _nudMarginH.Increment = new decimal(new int[] { 25, 0, 0, 131072 });
        _nudMarginH.Value = new decimal(new int[] { 100, 0, 0, 131072 });

        _lblNumberHeadings.AutoSize = true;
        _lblNumberHeadings.Location = new Point(16, 220);
        _lblNumberHeadings.Name = "_lblNumberHeadings";
        _lblNumberHeadings.Size = new Size(103, 15);
        _lblNumberHeadings.TabIndex = 12;
        _lblNumberHeadings.Text = "제목 번호 매기기";

        _chkNumberHeadings.AutoSize = true;
        _chkNumberHeadings.Checked = true;
        _chkNumberHeadings.CheckState = CheckState.Checked;
        _chkNumberHeadings.Location = new Point(168, 219);
        _chkNumberHeadings.Name = "_chkNumberHeadings";
        _chkNumberHeadings.Size = new Size(50, 19);
        _chkNumberHeadings.TabIndex = 13;
        _chkNumberHeadings.Text = "사용";
        _chkNumberHeadings.UseVisualStyleBackColor = true;

        _lblPageNumbers.AutoSize = true;
        _lblPageNumbers.Location = new Point(16, 252);
        _lblPageNumbers.Name = "_lblPageNumbers";
        _lblPageNumbers.Size = new Size(67, 15);
        _lblPageNumbers.TabIndex = 14;
        _lblPageNumbers.Text = "페이지 번호";

        _cmbPageNumbers.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbPageNumbers.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbPageNumbers.Items.AddRange(new object[] {
            "없음", "하단 왼쪽", "하단 가운데", "하단 오른쪽", "상단 왼쪽", "상단 가운데", "상단 오른쪽"
        });
        _cmbPageNumbers.Location = new Point(168, 248);
        _cmbPageNumbers.Name = "_cmbPageNumbers";
        _cmbPageNumbers.Size = new Size(192, 23);
        _cmbPageNumbers.TabIndex = 15;
        _cmbPageNumbers.SelectedIndex = 2;

        // Buttons
        _flowButtons.Controls.Add(_btnCancel);
        _flowButtons.Controls.Add(_btnReset);
        _flowButtons.Controls.Add(_btnOk);
        _flowButtons.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _flowButtons.FlowDirection = FlowDirection.RightToLeft;
        _flowButtons.Location = new Point(0, 316);
        _flowButtons.Name = "_flowButtons";
        _flowButtons.Padding = new Padding(0, 8, 0, 0);
        _flowButtons.Size = new Size(376, 40);
        _flowButtons.TabIndex = 1;
        _flowButtons.WrapContents = false;

        _btnOk.DialogResult = DialogResult.OK;
        _btnOk.Name = "_btnOk";
        _btnOk.Size = new Size(84, 30);
        _btnOk.TabIndex = 0;
        _btnOk.Text = "확인";
        _btnOk.UseVisualStyleBackColor = true;

        _btnReset.Margin = new Padding(0, 0, 8, 0);
        _btnReset.Name = "_btnReset";
        _btnReset.Size = new Size(84, 30);
        _btnReset.TabIndex = 1;
        _btnReset.Text = "기본값";
        _btnReset.UseVisualStyleBackColor = true;
        _btnReset.Click += (_, _) => ApplyDefaults();

        _btnCancel.DialogResult = DialogResult.Cancel;
        _btnCancel.Margin = new Padding(0, 0, 8, 0);
        _btnCancel.Name = "_btnCancel";
        _btnCancel.Size = new Size(84, 30);
        _btnCancel.TabIndex = 2;
        _btnCancel.Text = "취소";
        _btnCancel.UseVisualStyleBackColor = true;

        // PdfSettingsDialog
        AcceptButton = _btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = _btnCancel;
        ClientSize = new Size(400, 364);
        Controls.Add(_grpFormat);
        Controls.Add(_flowButtons);
        Font = new Font("Segoe UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "PdfSettingsDialog";
        Padding = new Padding(12, 12, 12, 8);
        StartPosition = FormStartPosition.CenterParent;
        Text = "보내기 서식";

        _grpFormat.ResumeLayout(false);
        _grpFormat.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)_nudFontSize).EndInit();
        ((System.ComponentModel.ISupportInitialize)_nudLineHeight).EndInit();
        ((System.ComponentModel.ISupportInitialize)_nudParaSpacing).EndInit();
        ((System.ComponentModel.ISupportInitialize)_nudMarginV).EndInit();
        ((System.ComponentModel.ISupportInitialize)_nudMarginH).EndInit();
        _flowButtons.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }
}
