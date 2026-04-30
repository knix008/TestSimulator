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
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(SuperResolutionForm));
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
        labelRuntime = new Label();
        comboRuntime = new ComboBox();
        labelTileSize = new Label();
        numericTileSize = new NumericUpDown();
        labelTileOverlap = new Label();
        numericTileOverlap = new NumericUpDown();
        flowLayoutPanelActions = new FlowLayoutPanel();
        buttonLoadImage = new Button();
        buttonPrepareModels = new Button();
        buttonSaveResult = new Button();
        checkAutoSave = new CheckBox();
        labelSaveFormat = new Label();
        comboSaveFormat = new ComboBox();
        progressBarProcessing = new ProgressBar();
        labelProgressPercent = new Label();
        splitContainerPreview = new SplitContainer();
        zoomHostInput = new ZoomableImageHost();
        zoomHostOutput = new ZoomableImageHost();
        statusStrip = new StatusStrip();
        toolStripStatusLabel = new ToolStripStatusLabel();
        toolStripStateLabel = new ToolStripStatusLabel();
        tableLayoutPanelMain.SuspendLayout();
        groupBoxSettings.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numericScale).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numericTileSize).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numericTileOverlap).BeginInit();
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
        tableLayoutPanelMain.Margin = new Padding(3, 2, 3, 2);
        tableLayoutPanelMain.Name = "tableLayoutPanelMain";
        tableLayoutPanelMain.RowCount = 4;
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Absolute, 105F));
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Absolute, 38F));
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        tableLayoutPanelMain.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
        tableLayoutPanelMain.Size = new Size(1312, 690);
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
        groupBoxSettings.Controls.Add(labelRuntime);
        groupBoxSettings.Controls.Add(comboRuntime);
        groupBoxSettings.Controls.Add(labelTileSize);
        groupBoxSettings.Controls.Add(numericTileSize);
        groupBoxSettings.Controls.Add(labelTileOverlap);
        groupBoxSettings.Controls.Add(numericTileOverlap);
        groupBoxSettings.Dock = DockStyle.Fill;
        groupBoxSettings.Location = new Point(10, 6);
        groupBoxSettings.Margin = new Padding(10, 6, 10, 6);
        groupBoxSettings.Name = "groupBoxSettings";
        groupBoxSettings.Padding = new Padding(3, 2, 3, 2);
        groupBoxSettings.Size = new Size(1292, 93);
        groupBoxSettings.TabIndex = 0;
        groupBoxSettings.TabStop = false;
        groupBoxSettings.Text = "Super Resolution Settings";
        // 
        // buttonRun
        // 
        buttonRun.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        buttonRun.BackColor = Color.RoyalBlue;
        buttonRun.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        buttonRun.ForeColor = Color.White;
        buttonRun.Location = new Point(1160, 22);
        buttonRun.Margin = new Padding(3, 2, 3, 2);
        buttonRun.Name = "buttonRun";
        buttonRun.Size = new Size(114, 60);
        buttonRun.TabIndex = 7;
        buttonRun.Text = "Run SR";
        buttonRun.UseVisualStyleBackColor = false;
        buttonRun.Click += buttonRun_Click;
        // 
        // buttonSelectModel
        // 
        buttonSelectModel.Location = new Point(739, 56);
        buttonSelectModel.Margin = new Padding(3, 2, 3, 2);
        buttonSelectModel.Name = "buttonSelectModel";
        buttonSelectModel.Size = new Size(52, 21);
        buttonSelectModel.TabIndex = 6;
        buttonSelectModel.Text = "...";
        buttonSelectModel.UseVisualStyleBackColor = true;
        buttonSelectModel.Click += buttonSelectModel_Click;
        // 
        // textBoxModelPath
        // 
        textBoxModelPath.Location = new Point(105, 57);
        textBoxModelPath.Margin = new Padding(3, 2, 3, 2);
        textBoxModelPath.Name = "textBoxModelPath";
        textBoxModelPath.PlaceholderText = "Optional - ONNX model path";
        textBoxModelPath.Size = new Size(630, 23);
        textBoxModelPath.TabIndex = 5;
        // 
        // labelModelPath
        // 
        labelModelPath.Location = new Point(18, 59);
        labelModelPath.Name = "labelModelPath";
        labelModelPath.Size = new Size(79, 15);
        labelModelPath.TabIndex = 4;
        labelModelPath.Text = "Model Path";
        labelModelPath.TextAlign = ContentAlignment.MiddleRight;
        // 
        // numericScale
        // 
        numericScale.Location = new Point(369, 26);
        numericScale.Margin = new Padding(3, 2, 3, 2);
        numericScale.Maximum = new decimal(new int[] { 8, 0, 0, 0 });
        numericScale.Minimum = new decimal(new int[] { 2, 0, 0, 0 });
        numericScale.Name = "numericScale";
        numericScale.Size = new Size(61, 23);
        numericScale.TabIndex = 3;
        numericScale.Value = new decimal(new int[] { 4, 0, 0, 0 });
        // 
        // labelScale
        // 
        labelScale.Location = new Point(284, 28);
        labelScale.Name = "labelScale";
        labelScale.Size = new Size(79, 15);
        labelScale.TabIndex = 2;
        labelScale.Text = "Scale";
        labelScale.TextAlign = ContentAlignment.MiddleRight;
        // 
        // comboAlgorithm
        // 
        comboAlgorithm.DropDownStyle = ComboBoxStyle.DropDownList;
        comboAlgorithm.FormattingEnabled = true;
        comboAlgorithm.Location = new Point(105, 26);
        comboAlgorithm.Margin = new Padding(3, 2, 3, 2);
        comboAlgorithm.Name = "comboAlgorithm";
        comboAlgorithm.Size = new Size(193, 23);
        comboAlgorithm.TabIndex = 1;
        // 
        // labelAlgorithm
        // 
        labelAlgorithm.Location = new Point(18, 28);
        labelAlgorithm.Name = "labelAlgorithm";
        labelAlgorithm.Size = new Size(79, 15);
        labelAlgorithm.TabIndex = 0;
        labelAlgorithm.Text = "Algorithm";
        labelAlgorithm.TextAlign = ContentAlignment.MiddleRight;
        // 
        // labelRuntime
        // 
        labelRuntime.Location = new Point(450, 28);
        labelRuntime.Name = "labelRuntime";
        labelRuntime.Size = new Size(79, 15);
        labelRuntime.TabIndex = 8;
        labelRuntime.Text = "Runtime";
        labelRuntime.TextAlign = ContentAlignment.MiddleRight;
        // 
        // comboRuntime
        // 
        comboRuntime.DropDownStyle = ComboBoxStyle.DropDownList;
        comboRuntime.FormattingEnabled = true;
        comboRuntime.Location = new Point(536, 26);
        comboRuntime.Margin = new Padding(3, 2, 3, 2);
        comboRuntime.Name = "comboRuntime";
        comboRuntime.Size = new Size(90, 23);
        comboRuntime.TabIndex = 9;
        // 
        // labelTileSize
        // 
        labelTileSize.Location = new Point(637, 28);
        labelTileSize.Name = "labelTileSize";
        labelTileSize.Size = new Size(79, 15);
        labelTileSize.TabIndex = 10;
        labelTileSize.Text = "Tile Size";
        labelTileSize.TextAlign = ContentAlignment.MiddleRight;
        // 
        // numericTileSize
        // 
        numericTileSize.Increment = new decimal(new int[] { 32, 0, 0, 0 });
        numericTileSize.Location = new Point(723, 26);
        numericTileSize.Margin = new Padding(3, 2, 3, 2);
        numericTileSize.Maximum = new decimal(new int[] { 2048, 0, 0, 0 });
        numericTileSize.Minimum = new decimal(new int[] { 64, 0, 0, 0 });
        numericTileSize.Name = "numericTileSize";
        numericTileSize.Size = new Size(68, 23);
        numericTileSize.TabIndex = 11;
        numericTileSize.Value = new decimal(new int[] { 512, 0, 0, 0 });
        // 
        // labelTileOverlap
        // 
        labelTileOverlap.Location = new Point(800, 28);
        labelTileOverlap.Name = "labelTileOverlap";
        labelTileOverlap.Size = new Size(79, 15);
        labelTileOverlap.TabIndex = 12;
        labelTileOverlap.Text = "Overlap";
        labelTileOverlap.TextAlign = ContentAlignment.MiddleRight;
        // 
        // numericTileOverlap
        // 
        numericTileOverlap.Location = new Point(887, 26);
        numericTileOverlap.Margin = new Padding(3, 2, 3, 2);
        numericTileOverlap.Maximum = new decimal(new int[] { 256, 0, 0, 0 });
        numericTileOverlap.Name = "numericTileOverlap";
        numericTileOverlap.Size = new Size(68, 23);
        numericTileOverlap.TabIndex = 13;
        numericTileOverlap.Value = new decimal(new int[] { 32, 0, 0, 0 });
        // 
        // flowLayoutPanelActions
        // 
        flowLayoutPanelActions.Controls.Add(buttonLoadImage);
        flowLayoutPanelActions.Controls.Add(buttonPrepareModels);
        flowLayoutPanelActions.Controls.Add(buttonSaveResult);
        flowLayoutPanelActions.Controls.Add(checkAutoSave);
        flowLayoutPanelActions.Controls.Add(labelSaveFormat);
        flowLayoutPanelActions.Controls.Add(comboSaveFormat);
        flowLayoutPanelActions.Controls.Add(progressBarProcessing);
        flowLayoutPanelActions.Controls.Add(labelProgressPercent);
        flowLayoutPanelActions.Dock = DockStyle.Fill;
        flowLayoutPanelActions.Location = new Point(10, 111);
        flowLayoutPanelActions.Margin = new Padding(10, 6, 10, 6);
        flowLayoutPanelActions.Name = "flowLayoutPanelActions";
        flowLayoutPanelActions.Padding = new Padding(0, 4, 0, 0);
        flowLayoutPanelActions.Size = new Size(1292, 26);
        flowLayoutPanelActions.TabIndex = 1;
        // 
        // buttonLoadImage
        // 
        buttonLoadImage.Location = new Point(3, 6);
        buttonLoadImage.Margin = new Padding(3, 2, 3, 2);
        buttonLoadImage.Name = "buttonLoadImage";
        buttonLoadImage.Size = new Size(88, 22);
        buttonLoadImage.TabIndex = 0;
        buttonLoadImage.Text = "Load Image";
        buttonLoadImage.UseVisualStyleBackColor = true;
        buttonLoadImage.Click += buttonLoadImage_Click;
        // 
        // buttonPrepareModels
        // 
        buttonPrepareModels.Location = new Point(97, 6);
        buttonPrepareModels.Margin = new Padding(3, 2, 3, 2);
        buttonPrepareModels.Name = "buttonPrepareModels";
        buttonPrepareModels.Size = new Size(118, 22);
        buttonPrepareModels.TabIndex = 1;
        buttonPrepareModels.Text = "Prepare Models";
        buttonPrepareModels.UseVisualStyleBackColor = true;
        buttonPrepareModels.Click += buttonPrepareModels_Click;
        // 
        // buttonSaveResult
        // 
        buttonSaveResult.Enabled = false;
        buttonSaveResult.Location = new Point(221, 6);
        buttonSaveResult.Margin = new Padding(3, 2, 3, 2);
        buttonSaveResult.Name = "buttonSaveResult";
        buttonSaveResult.Size = new Size(127, 22);
        buttonSaveResult.TabIndex = 2;
        buttonSaveResult.Text = "Save Result";
        buttonSaveResult.UseVisualStyleBackColor = true;
        buttonSaveResult.Click += buttonSaveResult_Click;
        // 
        // checkAutoSave
        // 
        checkAutoSave.AutoSize = true;
        checkAutoSave.Checked = true;
        checkAutoSave.CheckState = CheckState.Checked;
        checkAutoSave.Location = new Point(356, 9);
        checkAutoSave.Margin = new Padding(5, 5, 5, 0);
        checkAutoSave.Name = "checkAutoSave";
        checkAutoSave.Size = new Size(81, 19);
        checkAutoSave.TabIndex = 2;
        checkAutoSave.Text = "Auto Save";
        checkAutoSave.UseVisualStyleBackColor = true;
        // 
        // labelSaveFormat
        // 
        labelSaveFormat.AutoSize = true;
        labelSaveFormat.Location = new Point(447, 10);
        labelSaveFormat.Margin = new Padding(5, 6, 3, 0);
        labelSaveFormat.Name = "labelSaveFormat";
        labelSaveFormat.Size = new Size(74, 15);
        labelSaveFormat.TabIndex = 3;
        labelSaveFormat.Text = "Save Format";
        // 
        // comboSaveFormat
        // 
        comboSaveFormat.DropDownStyle = ComboBoxStyle.DropDownList;
        comboSaveFormat.FormattingEnabled = true;
        comboSaveFormat.Location = new Point(529, 7);
        comboSaveFormat.Margin = new Padding(5, 3, 3, 2);
        comboSaveFormat.Name = "comboSaveFormat";
        comboSaveFormat.Size = new Size(79, 23);
        comboSaveFormat.TabIndex = 4;
        // 
        // progressBarProcessing
        // 
        progressBarProcessing.Location = new Point(614, 6);
        progressBarProcessing.Margin = new Padding(3, 2, 3, 2);
        progressBarProcessing.Name = "progressBarProcessing";
        progressBarProcessing.Size = new Size(192, 22);
        progressBarProcessing.Style = ProgressBarStyle.Continuous;
        progressBarProcessing.TabIndex = 5;
        // 
        // labelProgressPercent
        // 
        labelProgressPercent.AutoSize = true;
        labelProgressPercent.Location = new Point(815, 10);
        labelProgressPercent.Margin = new Padding(6, 6, 3, 2);
        labelProgressPercent.Name = "labelProgressPercent";
        labelProgressPercent.Size = new Size(28, 15);
        labelProgressPercent.TabIndex = 6;
        labelProgressPercent.Text = "0 %";
        // 
        // splitContainerPreview
        // 
        splitContainerPreview.Dock = DockStyle.Fill;
        splitContainerPreview.Location = new Point(10, 149);
        splitContainerPreview.Margin = new Padding(10, 6, 10, 6);
        splitContainerPreview.Name = "splitContainerPreview";
        // 
        // splitContainerPreview.Panel1
        // 
        splitContainerPreview.Panel1.Controls.Add(zoomHostInput);
        // 
        // splitContainerPreview.Panel2
        // 
        splitContainerPreview.Panel2.Controls.Add(zoomHostOutput);
        splitContainerPreview.Size = new Size(1292, 513);
        splitContainerPreview.SplitterDistance = 642;
        splitContainerPreview.TabIndex = 2;
        // 
        // zoomHostInput
        // 
        zoomHostInput.Dock = DockStyle.Fill;
        zoomHostInput.Location = new Point(0, 0);
        zoomHostInput.Margin = new Padding(3, 2, 3, 2);
        zoomHostInput.Name = "zoomHostInput";
        zoomHostInput.PreviewImage = null;
        zoomHostInput.Size = new Size(642, 513);
        zoomHostInput.TabIndex = 0;
        // 
        // zoomHostOutput
        // 
        zoomHostOutput.Dock = DockStyle.Fill;
        zoomHostOutput.Location = new Point(0, 0);
        zoomHostOutput.Margin = new Padding(3, 2, 3, 2);
        zoomHostOutput.Name = "zoomHostOutput";
        zoomHostOutput.PreviewImage = null;
        zoomHostOutput.Size = new Size(646, 513);
        zoomHostOutput.TabIndex = 0;
        // 
        // statusStrip
        // 
        statusStrip.ImageScalingSize = new Size(20, 20);
        statusStrip.Items.AddRange(new ToolStripItem[] { toolStripStatusLabel, toolStripStateLabel });
        statusStrip.Location = new Point(0, 668);
        statusStrip.Name = "statusStrip";
        statusStrip.Padding = new Padding(1, 0, 12, 0);
        statusStrip.Size = new Size(1312, 22);
        statusStrip.TabIndex = 3;
        statusStrip.Text = "statusStrip1";
        // 
        // toolStripStatusLabel
        // 
        toolStripStatusLabel.Name = "toolStripStatusLabel";
        toolStripStatusLabel.Size = new Size(1273, 17);
        toolStripStatusLabel.Spring = true;
        toolStripStatusLabel.Text = "Ready";
        // 
        // toolStripStateLabel
        // 
        toolStripStateLabel.Name = "toolStripStateLabel";
        toolStripStateLabel.Size = new Size(26, 17);
        toolStripStateLabel.Text = "Idle";
        // 
        // SuperResolutionForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1312, 690);
        Controls.Add(tableLayoutPanelMain);
        Icon = (Icon)resources.GetObject("$this.Icon");
        Margin = new Padding(3, 2, 3, 2);
        Name = "SuperResolutionForm";
        Text = "Super Resolution Studio (MVP)";
        tableLayoutPanelMain.ResumeLayout(false);
        tableLayoutPanelMain.PerformLayout();
        groupBoxSettings.ResumeLayout(false);
        groupBoxSettings.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)numericScale).EndInit();
        ((System.ComponentModel.ISupportInitialize)numericTileSize).EndInit();
        ((System.ComponentModel.ISupportInitialize)numericTileOverlap).EndInit();
        flowLayoutPanelActions.ResumeLayout(false);
        flowLayoutPanelActions.PerformLayout();
        splitContainerPreview.Panel1.ResumeLayout(false);
        splitContainerPreview.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerPreview).EndInit();
        splitContainerPreview.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
    }

    #endregion

    private TableLayoutPanel tableLayoutPanelMain;
    private GroupBox groupBoxSettings;
    private Label labelAlgorithm;
    private ComboBox comboAlgorithm;
    private NumericUpDown numericScale;
    private Label labelScale;
    private Label labelRuntime;
    private ComboBox comboRuntime;
    private Label labelTileSize;
    private NumericUpDown numericTileSize;
    private Label labelTileOverlap;
    private NumericUpDown numericTileOverlap;
    private Label labelModelPath;
    private TextBox textBoxModelPath;
    private Button buttonSelectModel;
    private Button buttonRun;
    private FlowLayoutPanel flowLayoutPanelActions;
    private Button buttonLoadImage;
    private Button buttonPrepareModels;
    private Button buttonSaveResult;
    private CheckBox checkAutoSave;
    private Label labelSaveFormat;
    private ComboBox comboSaveFormat;
    private ProgressBar progressBarProcessing;
    private Label labelProgressPercent;
    private SplitContainer splitContainerPreview;
    private ZoomableImageHost zoomHostInput;
    private ZoomableImageHost zoomHostOutput;
    private StatusStrip statusStrip;
    private ToolStripStatusLabel toolStripStatusLabel;
    private ToolStripStatusLabel toolStripStateLabel;
}
