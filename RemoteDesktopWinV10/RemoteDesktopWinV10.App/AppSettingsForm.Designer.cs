namespace RemoteDesktopWinV10.App;

#nullable disable
public partial class AppSettingsForm
{
    private System.ComponentModel.IContainer components;

    private GroupBox groupMenu;
    private CheckBox checkShowViewMenu;
    private CheckBox checkShowDataFolderItem;
    private Label labelHint;
    private Button buttonOk;
    private Button buttonCancel;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        groupMenu = new GroupBox();
        checkShowViewMenu = new CheckBox();
        checkShowDataFolderItem = new CheckBox();
        labelHint = new Label();
        buttonOk = new Button();
        buttonCancel = new Button();
        groupMenu.SuspendLayout();
        SuspendLayout();
        //
        // groupMenu
        //
        groupMenu.Controls.Add(checkShowViewMenu);
        groupMenu.Controls.Add(checkShowDataFolderItem);
        groupMenu.Controls.Add(labelHint);
        groupMenu.Location = new Point(12, 12);
        groupMenu.Name = "groupMenu";
        groupMenu.Size = new Size(420, 168);
        groupMenu.TabIndex = 0;
        groupMenu.TabStop = false;
        groupMenu.Text = "메인 창";
        //
        // checkShowViewMenu
        //
        checkShowViewMenu.AutoSize = true;
        checkShowViewMenu.Location = new Point(16, 28);
        checkShowViewMenu.Name = "checkShowViewMenu";
        checkShowViewMenu.Size = new Size(220, 19);
        checkShowViewMenu.TabIndex = 0;
        checkShowViewMenu.Text = "「보기」메뉴 표시 (전체 화면)";
        checkShowViewMenu.UseVisualStyleBackColor = true;
        //
        // checkShowDataFolderItem
        //
        checkShowDataFolderItem.AutoSize = true;
        checkShowDataFolderItem.Location = new Point(16, 56);
        checkShowDataFolderItem.Name = "checkShowDataFolderItem";
        checkShowDataFolderItem.Size = new Size(280, 19);
        checkShowDataFolderItem.TabIndex = 1;
        checkShowDataFolderItem.Text = "「파일」에 '데이터 폴더 열기' 표시";
        checkShowDataFolderItem.UseVisualStyleBackColor = true;
        //
        // labelHint
        //
        labelHint.Location = new Point(16, 88);
        labelHint.Name = "labelHint";
        labelHint.Size = new Size(388, 68);
        labelHint.TabIndex = 2;
        labelHint.Text = "프로필 목록·추가·편집·삭제는 「프로필」메뉴 또는 상단 도구 모음에서 합니다.\r\n전체 화면은 F11으로도 전환됩니다.\r\n이 설정은 사용자별 ui.json 에 저장됩니다.";
        //
        // buttonOk
        //
        buttonOk.Location = new Point(236, 196);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(90, 28);
        buttonOk.TabIndex = 1;
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;
        buttonOk.Click += buttonOk_Click;
        //
        // buttonCancel
        //
        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(332, 196);
        buttonCancel.Name = "buttonCancel";
        buttonCancel.Size = new Size(90, 28);
        buttonCancel.TabIndex = 2;
        buttonCancel.Text = "취소";
        buttonCancel.UseVisualStyleBackColor = true;
        buttonCancel.Click += buttonCancel_Click;
        //
        // AppSettingsForm
        //
        AcceptButton = buttonOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = buttonCancel;
        ClientSize = new Size(444, 240);
        Controls.Add(buttonCancel);
        Controls.Add(buttonOk);
        Controls.Add(groupMenu);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "AppSettingsForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "앱 설정 — 메뉴 표시";
        groupMenu.ResumeLayout(false);
        groupMenu.PerformLayout();
        ResumeLayout(false);
    }
}

#nullable restore
