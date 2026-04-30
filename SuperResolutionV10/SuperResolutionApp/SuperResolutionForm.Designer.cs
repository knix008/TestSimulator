namespace SuperResolutionApp;

partial class SuperResolutionForm
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
        components = new System.ComponentModel.Container();
        tableLayoutPanelMain = new TableLayoutPanel();
        groupBoxSettings = new GroupBox();
        buttonRun = new Button();
        buttonSelectModel = new Button();
        textBoxModelPath = new TextBox();
        labelModelPath = new Label();
        numericScale = new NumericUpDown();
        labelScale = new Label();
        comboAlgorithm = new ComboBox();
        labelAlgorithm = new Label();
        flowLayoutPanelActions = new FlowLayoutPanel();
        buttonSaveResult = new Button();
        buttonLoadImage = new Button();
        splitContainerPreview = new SplitContainer();
        zoomHostInput = new ZoomableImageHost();
        zoomHostOutput = new ZoomableImageHost();
        statusStrip = new StatusStrip();
        toolStripStatusLabel = new ToolStripStatusLabel();
        tableLayoutPanelMain.SuspendLayout();
        groupBoxSettings.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numericScale).BeginInit();
        flowLayoutPanelActions.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerPreview).BeginInit();
        splitContainerPreview.Panel1.SuspendLayout();
        splitContainerPreview.Panel2.SuspendLayout();
        splitContainerPreview.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // tableLayoutPanelMain
        // 
        tableLayoutPanelMain.ColumnCount = 1;
        tableLayoutPanelMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        tableLayoutPanelMain.Controls.Add(groupBoxSettings, 0, 0);
        tableLayoutPanelMain.Controls.Add(flowLayoutPanelActions, 0, 1);
        tableLayoutPanelMain.Controls.Add(splitContainerPreview, 0, 2);
        tableLayoutPanelMain.Controls.Add(statusStrip, 0, 3);
        tableLayoutPanelMain.Dock = DockStyle.Fill;
        tableLayoutPanelMain.Location = new Point(0, 0);
        tableLayoutPanelMain.Name = "tableLayoutPanelMain";
        tableLayoutPanelMain.RowCount = 4;
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Absolute, 140F));
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Absolute, 50F));
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        tableLayoutPanelMain.Size = new Size(1100, 720);
        tableLayoutPanelMain.TabIndex = 0;
        // 
        // groupBoxSettings
        // 
        groupBoxSettings.Controls.Add(buttonRun);
        groupBoxSettings.Controls.Add(buttonSelectModel);
        groupBoxSettings.Controls.Add(textBoxModelPath);
        groupBoxSettings.Controls.Add(labelModelPath);
        groupBoxSettings.Controls.Add(numericScale);
        groupBoxSettings.Controls.Add(labelScale);
        groupBoxSettings.Controls.Add(comboAlgorithm);
        groupBoxSettings.Controls.Add(labelAlgorithm);
        groupBoxSettings.Dock = DockStyle.Fill;
        groupBoxSettings.Location = new Point(12, 8);
        groupBoxSettings.Margin = new Padding(12, 8, 12, 8);
        groupBoxSettings.Name = "groupBoxSettings";
        groupBoxSettings.Size = new Size(1076, 124);
        groupBoxSettings.TabIndex = 0;
        groupBoxSettings.TabStop = false;
        groupBoxSettings.Text = "Super Resolution Settings";
        // 
        // buttonRun
        // 
        buttonRun.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        buttonRun.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        buttonRun.Location = new Point(926, 30);
        buttonRun.Name = "buttonRun";
        buttonRun.Size = new Size(130, 80);
        buttonRun.TabIndex = 7;
        buttonRun.Text = "Run SR";
        buttonRun.UseVisualStyleBackColor = true;
        buttonRun.Click += buttonRun_Click;
        // 
        // buttonSelectModel
        // 
        buttonSelectModel.Location = new Point(845, 75);
        buttonSelectModel.Name = "buttonSelectModel";
        buttonSelectModel.Size = new Size(60, 28);
        buttonSelectModel.TabIndex = 6;
        buttonSelectModel.Text = "...";
        buttonSelectModel.UseVisualStyleBackColor = true;
        buttonSelectModel.Click += buttonSelectModel_Click;
        // 
        // textBoxModelPath
        // 
        textBoxModelPath.Location = new Point(120, 76);
        textBoxModelPath.Name = "textBoxModelPath";
        textBoxModelPath.PlaceholderText = "Optional - ONNX model path";
        textBoxModelPath.Size = new Size(719, 27);
        textBoxModelPath.TabIndex = 5;
        // 
        // labelModelPath
        // 
        labelModelPath.AutoSize = true;
        labelModelPath.Location = new Point(20, 79);
        labelModelPath.Name = "labelModelPath";
        labelModelPath.Size = new Size(86, 20);
        labelModelPath.TabIndex = 4;
        labelModelPath.Text = "Model Path";
        // 
        // numericScale
        // 
        numericScale.Location = new Point(422, 35);
        numericScale.Maximum = new decimal(new int[] { 8, 0, 0, 0 });
        numericScale.Minimum = new decimal(new int[] { 2, 0, 0, 0 });
        numericScale.Name = "numericScale";
        numericScale.Size = new Size(70, 27);
        numericScale.TabIndex = 3;
        numericScale.Value = new decimal(new int[] { 4, 0, 0, 0 });
        // 
        // labelScale
        // 
        labelScale.AutoSize = true;
        labelScale.Location = new Point(362, 38);
        labelScale.Name = "labelScale";
        labelScale.Size = new Size(43, 20);
        labelScale.TabIndex = 2;
        labelScale.Text = "Scale";
        // 
        // comboAlgorithm
        // 
        comboAlgorithm.DropDownStyle = ComboBoxStyle.DropDownList;
        comboAlgorithm.FormattingEnabled = true;
        comboAlgorithm.Location = new Point(120, 35);
        comboAlgorithm.Name = "comboAlgorithm";
        comboAlgorithm.Size = new Size(220, 28);
        comboAlgorithm.TabIndex = 1;
        // 
        // labelAlgorithm
        // 
        labelAlgorithm.AutoSize = true;
        labelAlgorithm.Location = new Point(20, 38);
        labelAlgorithm.Name = "labelAlgorithm";
        labelAlgorithm.Size = new Size(76, 20);
        labelAlgorithm.TabIndex = 0;
        labelAlgorithm.Text = "Algorithm";
        // 
        // flowLayoutPanelActions
        // 
        flowLayoutPanelActions.Controls.Add(buttonLoadImage);
        flowLayoutPanelActions.Controls.Add(buttonSaveResult);
        flowLayoutPanelActions.Dock = DockStyle.Fill;
        flowLayoutPanelActions.FlowDirection = FlowDirection.LeftToRight;
        flowLayoutPanelActions.Location = new Point(12, 148);
        flowLayoutPanelActions.Margin = new Padding(12, 8, 12, 8);
        flowLayoutPanelActions.Name = "flowLayoutPanelActions";
        flowLayoutPanelActions.Padding = new Padding(0, 5, 0, 0);
        flowLayoutPanelActions.Size = new Size(1076, 34);
        flowLayoutPanelActions.TabIndex = 1;
        // 
        // buttonSaveResult
        // 
        buttonSaveResult.Enabled = false;
        buttonSaveResult.Location = new Point(110, 8);
        buttonSaveResult.Name = "buttonSaveResult";
        buttonSaveResult.Size = new Size(145, 29);
        buttonSaveResult.TabIndex = 1;
        buttonSaveResult.Text = "Save Result";
        buttonSaveResult.UseVisualStyleBackColor = true;
        buttonSaveResult.Click += buttonSaveResult_Click;
        // 
        // buttonLoadImage
        // 
        buttonLoadImage.Location = new Point(3, 8);
        buttonLoadImage.Name = "buttonLoadImage";
        buttonLoadImage.Size = new Size(101, 29);
        buttonLoadImage.TabIndex = 0;
        buttonLoadImage.Text = "Load Image";
        buttonLoadImage.UseVisualStyleBackColor = true;
        buttonLoadImage.Click += buttonLoadImage_Click;
        // 
        // splitContainerPreview
        // 
        splitContainerPreview.Dock = DockStyle.Fill;
        splitContainerPreview.Location = new Point(12, 198);
        splitContainerPreview.Margin = new Padding(12, 8, 12, 8);
        splitContainerPreview.Name = "splitContainerPreview";
        // 
        // splitContainerPreview.Panel1
        // 
        splitContainerPreview.Panel1.Controls.Add(zoomHostInput);
        // 
        // splitContainerPreview.Panel2
        // 
        splitContainerPreview.Panel2.Controls.Add(zoomHostOutput);
        splitContainerPreview.Size = new Size(1076, 484);
        splitContainerPreview.SplitterDistance = 535;
        splitContainerPreview.TabIndex = 2;
        // 
        // zoomHostInput
        // 
        zoomHostInput.Dock = DockStyle.Fill;
        zoomHostInput.Location = new Point(0, 0);
        zoomHostInput.Name = "zoomHostInput";
        zoomHostInput.Size = new Size(535, 484);
        zoomHostInput.TabIndex = 0;
        // 
        // zoomHostOutput
        // 
        zoomHostOutput.Dock = DockStyle.Fill;
        zoomHostOutput.Location = new Point(0, 0);
        zoomHostOutput.Name = "zoomHostOutput";
        zoomHostOutput.Size = new Size(537, 484);
        zoomHostOutput.TabIndex = 0;
        // 
        // statusStrip
        // 
        statusStrip.ImageScalingSize = new Size(20, 20);
        statusStrip.Items.AddRange(new ToolStripItem[] { toolStripStatusLabel });
        statusStrip.Location = new Point(0, 694);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1100, 26);
        statusStrip.TabIndex = 3;
        statusStrip.Text = "statusStrip1";
        // 
        // toolStripStatusLabel
        // 
        toolStripStatusLabel.Name = "toolStripStatusLabel";
        toolStripStatusLabel.Size = new Size(78, 20);
        toolStripStatusLabel.Text = "Ready";
        // 
        // SuperResolutionForm
        // 
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1500, 920);
        Controls.Add(tableLayoutPanelMain);
        Name = "SuperResolutionForm";
        Text = "Super Resolution Studio (MVP)";
        tableLayoutPanelMain.ResumeLayout(false);
        tableLayoutPanelMain.PerformLayout();
        groupBoxSettings.ResumeLayout(false);
        groupBoxSettings.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)numericScale).EndInit();
        flowLayoutPanelActions.ResumeLayout(false);
        splitContainerPreview.Panel1.ResumeLayout(false);
        splitContainerPreview.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerPreview).EndInit();
        splitContainerPreview.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private TableLayoutPanel tableLayoutPanelMain;
    private GroupBox groupBoxSettings;
    private Label labelAlgorithm;
    private ComboBox comboAlgorithm;
    private NumericUpDown numericScale;
    private Label labelScale;
    private Label labelModelPath;
    private TextBox textBoxModelPath;
    private Button buttonSelectModel;
    private Button buttonRun;
    private FlowLayoutPanel flowLayoutPanelActions;
    private Button buttonLoadImage;
    private Button buttonSaveResult;
    private SplitContainer splitContainerPreview;
    private ZoomableImageHost zoomHostInput;
    private ZoomableImageHost zoomHostOutput;
    private StatusStrip statusStrip;
    private ToolStripStatusLabel toolStripStatusLabel;
}
