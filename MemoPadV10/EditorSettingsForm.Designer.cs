namespace MemoPadV10;

public partial class EditorSettingsForm
{
    private System.ComponentModel.IContainer components = null!;
    private Panel footerPanel = null!;
    private Button _btnDefault = null!;
    private Button _btnOk = null!;
    private Button _btnCancel = null!;

    /// <summary>
    /// 디자이너 및 개체 목록에서 사용하는 리소스를 정리합니다.
    /// </summary>
    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        footerPanel = new Panel();
        _btnCancel = new Button();
        _btnOk = new Button();
        _btnDefault = new Button();
        hintLabel = new Label();
        scopeGroupBox = new GroupBox();
        _radioSelection = new RadioButton();
        _radioWhole = new RadioButton();
        _btnFont = new Button();
        styleGroupBox = new GroupBox();
        btnStyleBold = new Button();
        btnStyleItalic = new Button();
        btnStyleUnderline = new Button();
        btnStyleStrike = new Button();
        editorBackGroupBox = new GroupBox();
        _previewEditorBack = new Panel();
        _btnEditorBack = new Button();
        _editorBackPalettePanel = new FlowLayoutPanel();
        languageGroupBox = new GroupBox();
        _languageCombo = new ComboBox();
        clientPanel = new Panel();
        footerPanel.SuspendLayout();
        scopeGroupBox.SuspendLayout();
        styleGroupBox.SuspendLayout();
        editorBackGroupBox.SuspendLayout();
        languageGroupBox.SuspendLayout();
        clientPanel.SuspendLayout();
        SuspendLayout();
        // 
        // footerPanel
        // 
        footerPanel.Controls.Add(_btnCancel);
        footerPanel.Controls.Add(_btnOk);
        footerPanel.Controls.Add(_btnDefault);
        footerPanel.Dock = DockStyle.Bottom;
        footerPanel.Location = new Point(10, 330);
        footerPanel.Name = "footerPanel";
        footerPanel.Size = new Size(440, 52);
        footerPanel.TabIndex = 1;
        // 
        // _btnCancel
        // 
        _btnCancel.DialogResult = DialogResult.Cancel;
        _btnCancel.Location = new Point(276, 10);
        _btnCancel.Name = "_btnCancel";
        _btnCancel.Size = new Size(96, 32);
        _btnCancel.TabIndex = 2;
        _btnCancel.Text = "취소";
        _btnCancel.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("✕", Color.Firebrick, Color.Transparent, 22), new Size(20,20));
        _btnCancel.ImageAlign = ContentAlignment.MiddleRight;
        _btnCancel.TextAlign = ContentAlignment.MiddleLeft;
        _btnCancel.TextImageRelation = TextImageRelation.ImageBeforeText;
        _btnCancel.UseVisualStyleBackColor = true;
        // 
        // _btnOk
        // 
        _btnOk.DialogResult = DialogResult.OK;
        _btnOk.Location = new Point(172, 10);
        _btnOk.Name = "_btnOk";
        _btnOk.Size = new Size(96, 32);
        _btnOk.TabIndex = 1;
        _btnOk.Text = "확인";
        _btnOk.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("✓", Color.ForestGreen, Color.Transparent, 22), new Size(20,20));
        _btnOk.ImageAlign = ContentAlignment.MiddleRight;
        _btnOk.TextAlign = ContentAlignment.MiddleLeft;
        _btnOk.TextImageRelation = TextImageRelation.ImageBeforeText;
        _btnOk.UseVisualStyleBackColor = true;
        // 
        // _btnDefault
        // 
        _btnDefault.Location = new Point(68, 10);
        _btnDefault.Name = "_btnDefault";
        _btnDefault.Size = new Size(96, 32);
        _btnDefault.TabIndex = 0;
        _btnDefault.Text = "기본값";
        _btnDefault.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("↺", Color.RoyalBlue, Color.Transparent, 22), new Size(20,20));
        _btnDefault.ImageAlign = ContentAlignment.MiddleRight;
        _btnDefault.TextAlign = ContentAlignment.MiddleLeft;
        _btnDefault.TextImageRelation = TextImageRelation.ImageBeforeText;
        _btnDefault.UseVisualStyleBackColor = true;
        // 
        // hintLabel
        // 
        hintLabel.AutoSize = true;
        hintLabel.Location = new Point(0, 0);
        hintLabel.MaximumSize = new Size(434, 0);
        hintLabel.Name = "hintLabel";
        hintLabel.Size = new Size(290, 15);
        hintLabel.TabIndex = 0;
        hintLabel.Text = "범위 선택 후 서식 적용. (마우스로 텍스트 선택 가능)";
        // 
        // scopeGroupBox
        // 
        scopeGroupBox.Controls.Add(_radioWhole);
        scopeGroupBox.Controls.Add(_radioSelection);
        scopeGroupBox.Location = new Point(3, 44);
        scopeGroupBox.Name = "scopeGroupBox";
        scopeGroupBox.Size = new Size(434, 52);
        scopeGroupBox.TabIndex = 1;
        scopeGroupBox.TabStop = false;
        scopeGroupBox.Text = "적용 범위";
        // 
        // _radioSelection
        // 
        _radioSelection.AutoSize = true;
        _radioSelection.Location = new Point(16, 22);
        _radioSelection.Name = "_radioSelection";
        _radioSelection.Size = new Size(77, 19);
        _radioSelection.TabIndex = 0;
        _radioSelection.TabStop = true;
        _radioSelection.Text = "선택 영역";
        _radioSelection.UseVisualStyleBackColor = true;
        // 
        // _radioWhole
        // 
        _radioWhole.AutoSize = true;
        _radioWhole.Location = new Point(110, 22);
        _radioWhole.Name = "_radioWhole";
        _radioWhole.Size = new Size(77, 19);
        _radioWhole.TabIndex = 1;
        _radioWhole.TabStop = true;
        _radioWhole.Text = "전체 문서";
        _radioWhole.UseVisualStyleBackColor = true;
        // 
        // _btnFont
        // 
        _btnFont.Location = new Point(3, 104);
        _btnFont.Name = "_btnFont";
        _btnFont.Size = new Size(434, 32);
        _btnFont.TabIndex = 2;
        _btnFont.Text = "글꼴·크기·글자 색…";
        _btnFont.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("A", Color.MediumBlue, Color.Transparent, 20), new Size(18,18));
        _btnFont.ImageAlign = ContentAlignment.MiddleLeft;
        _btnFont.TextImageRelation = TextImageRelation.ImageBeforeText;
        _btnFont.UseVisualStyleBackColor = true;
        // 
        // styleGroupBox
        // 
        styleGroupBox.Controls.Add(btnStyleStrike);
        styleGroupBox.Controls.Add(btnStyleUnderline);
        styleGroupBox.Controls.Add(btnStyleItalic);
        styleGroupBox.Controls.Add(btnStyleBold);
        styleGroupBox.Location = new Point(3, 144);
        styleGroupBox.Name = "styleGroupBox";
        styleGroupBox.Size = new Size(434, 108);
        styleGroupBox.TabIndex = 3;
        styleGroupBox.TabStop = false;
        styleGroupBox.Text = "글자 서식";
        // 
        // btnStyleBold
        // 
        btnStyleBold.Location = new Point(12, 26);
        btnStyleBold.Name = "btnStyleBold";
        btnStyleBold.Size = new Size(200, 32);
        btnStyleBold.TabIndex = 0;
        btnStyleBold.Text = "굵게";
        btnStyleBold.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("B", Color.Navy, Color.Transparent, 20), new Size(18,18));
        btnStyleBold.ImageAlign = ContentAlignment.MiddleLeft;
        btnStyleBold.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnStyleBold.UseVisualStyleBackColor = true;
        // 
        // btnStyleItalic
        // 
        btnStyleItalic.Location = new Point(224, 26);
        btnStyleItalic.Name = "btnStyleItalic";
        btnStyleItalic.Size = new Size(200, 32);
        btnStyleItalic.TabIndex = 1;
        btnStyleItalic.Text = "기울임";
        btnStyleItalic.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("I", Color.DarkGreen, Color.Transparent, 20), new Size(18,18));
        btnStyleItalic.ImageAlign = ContentAlignment.MiddleLeft;
        btnStyleItalic.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnStyleItalic.UseVisualStyleBackColor = true;
        // 
        // btnStyleUnderline
        // 
        btnStyleUnderline.Location = new Point(12, 64);
        btnStyleUnderline.Name = "btnStyleUnderline";
        btnStyleUnderline.Size = new Size(200, 32);
        btnStyleUnderline.TabIndex = 2;
        btnStyleUnderline.Text = "밑줄";
        btnStyleUnderline.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("U", Color.DarkMagenta, Color.Transparent, 20), new Size(18,18));
        btnStyleUnderline.ImageAlign = ContentAlignment.MiddleLeft;
        btnStyleUnderline.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnStyleUnderline.UseVisualStyleBackColor = true;
        // 
        // btnStyleStrike
        // 
        btnStyleStrike.Location = new Point(224, 64);
        btnStyleStrike.Name = "btnStyleStrike";
        btnStyleStrike.Size = new Size(200, 32);
        btnStyleStrike.TabIndex = 3;
        btnStyleStrike.Text = "취소선";
        btnStyleStrike.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("S", Color.Sienna, Color.Transparent, 20), new Size(18,18));
        btnStyleStrike.ImageAlign = ContentAlignment.MiddleLeft;
        btnStyleStrike.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnStyleStrike.UseVisualStyleBackColor = true;
        //
        // editorBackGroupBox
        //
        editorBackGroupBox.Controls.Add(_btnEditorBack);
        editorBackGroupBox.Controls.Add(_previewEditorBack);
        editorBackGroupBox.Controls.Add(_editorBackPalettePanel);
        editorBackGroupBox.Location = new Point(3, 260);
        editorBackGroupBox.Name = "editorBackGroupBox";
        editorBackGroupBox.Size = new Size(434, 132);
        editorBackGroupBox.TabIndex = 4;
        editorBackGroupBox.TabStop = false;
        editorBackGroupBox.Text = "배경색";
        //
        // _previewEditorBack
        //
        _previewEditorBack.BorderStyle = BorderStyle.FixedSingle;
        _previewEditorBack.Location = new Point(12, 22);
        _previewEditorBack.Name = "_previewEditorBack";
        _previewEditorBack.Size = new Size(20, 24);
        _previewEditorBack.TabIndex = 0;
        //
        // _btnEditorBack
        //
        _btnEditorBack.Location = new Point(38, 22);
        _btnEditorBack.Name = "_btnEditorBack";
        _btnEditorBack.Size = new Size(160, 24);
        _btnEditorBack.TabIndex = 1;
        _btnEditorBack.Text = "사용자 지정 색…";
        _btnEditorBack.Image = new Bitmap(EditorSettingsForm.MakeGlyphIcon("■", Color.DarkOrange, Color.Transparent, 20), new Size(18,18));
        _btnEditorBack.ImageAlign = ContentAlignment.MiddleLeft;
        _btnEditorBack.TextImageRelation = TextImageRelation.ImageBeforeText;
        _btnEditorBack.UseVisualStyleBackColor = true;
        //
        // _editorBackPalettePanel
        //
        _editorBackPalettePanel.Location = new Point(12, 52);
        _editorBackPalettePanel.Name = "_editorBackPalettePanel";
        _editorBackPalettePanel.Size = new Size(322, 72);
        _editorBackPalettePanel.TabIndex = 2;
        _editorBackPalettePanel.AutoScroll = false;
        //
        // languageGroupBox
        //
        languageGroupBox.Controls.Add(_languageCombo);
        languageGroupBox.Location = new Point(3, 398);
        languageGroupBox.Name = "languageGroupBox";
        languageGroupBox.Size = new Size(434, 56);
        languageGroupBox.TabIndex = 6;
        languageGroupBox.TabStop = false;
        languageGroupBox.Text = "언어 (Language)";
        //
        // _languageCombo
        //
        _languageCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _languageCombo.Location = new Point(12, 22);
        _languageCombo.Name = "_languageCombo";
        _languageCombo.Size = new Size(200, 23);
        _languageCombo.TabIndex = 0;
        //
        // clientPanel
        //
        clientPanel.Controls.Add(languageGroupBox);
        clientPanel.Controls.Add(editorBackGroupBox);
        clientPanel.Controls.Add(styleGroupBox);
        clientPanel.Controls.Add(_btnFont);
        clientPanel.Controls.Add(scopeGroupBox);
        clientPanel.Controls.Add(hintLabel);
        clientPanel.Dock = DockStyle.Fill;
        clientPanel.Location = new Point(10, 10);
        clientPanel.Name = "clientPanel";
        clientPanel.Size = new Size(352, 320);
        clientPanel.TabIndex = 0;
        // 
        // EditorSettingsForm
        // 
        AcceptButton = _btnOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = _btnCancel;
        ClientSize = new Size(460, 548);
        Controls.Add(clientPanel);
        Controls.Add(footerPanel);
        Font = new Font("맑은 고딕", 9F);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "EditorSettingsForm";
        Padding = new Padding(10);
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        Text = "폰트 및 표시 설정";
        footerPanel.ResumeLayout(false);
        scopeGroupBox.ResumeLayout(false);
        scopeGroupBox.PerformLayout();
        styleGroupBox.ResumeLayout(false);
        editorBackGroupBox.ResumeLayout(false);
        languageGroupBox.ResumeLayout(false);
        clientPanel.ResumeLayout(false);
        clientPanel.PerformLayout();
        ResumeLayout(false);
    }

    private Label hintLabel;
    private GroupBox scopeGroupBox;
    private RadioButton _radioWhole;
    private RadioButton _radioSelection;
    private Button _btnFont;
    private GroupBox styleGroupBox;
    private Button btnStyleStrike;
    private Button btnStyleUnderline;
    private Button btnStyleItalic;
    private Button btnStyleBold;
    private GroupBox editorBackGroupBox;
    private Button _btnEditorBack;
    private Panel _previewEditorBack;
    private FlowLayoutPanel _editorBackPalettePanel;
    private GroupBox languageGroupBox;
    private ComboBox _languageCombo;
    private Panel clientPanel;
}
