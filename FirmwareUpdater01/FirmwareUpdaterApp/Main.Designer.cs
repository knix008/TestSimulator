namespace FirmwareUpdaterApp;

partial class Main
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
        this.txtDeviceUrl = new System.Windows.Forms.TextBox();
        this.txtFirmwarePath = new System.Windows.Forms.TextBox();
        this.btnBrowse = new System.Windows.Forms.Button();
        this.btnUpload = new System.Windows.Forms.Button();
        this.progressBar = new System.Windows.Forms.ProgressBar();
        this.txtLog = new System.Windows.Forms.TextBox();
        this.lblDeviceUrl = new System.Windows.Forms.Label();
        this.lblFirmwarePath = new System.Windows.Forms.Label();
        this.SuspendLayout();
        //
        // lblDeviceUrl
        //
        this.lblDeviceUrl.AutoSize = true;
        this.lblDeviceUrl.Location = new System.Drawing.Point(20, 20);
        this.lblDeviceUrl.Name = "lblDeviceUrl";
        this.lblDeviceUrl.Size = new System.Drawing.Size(70, 15);
        this.lblDeviceUrl.TabIndex = 0;
        this.lblDeviceUrl.Text = "Device URL:";
        //
        // txtDeviceUrl
        //
        this.txtDeviceUrl.Location = new System.Drawing.Point(120, 17);
        this.txtDeviceUrl.Name = "txtDeviceUrl";
        this.txtDeviceUrl.Size = new System.Drawing.Size(500, 23);
        this.txtDeviceUrl.TabIndex = 1;
        this.txtDeviceUrl.Text = "https://localhost:5001";
        //
        // lblFirmwarePath
        //
        this.lblFirmwarePath.AutoSize = true;
        this.lblFirmwarePath.Location = new System.Drawing.Point(20, 60);
        this.lblFirmwarePath.Name = "lblFirmwarePath";
        this.lblFirmwarePath.Size = new System.Drawing.Size(90, 15);
        this.lblFirmwarePath.TabIndex = 2;
        this.lblFirmwarePath.Text = "Firmware File:";
        //
        // txtFirmwarePath
        //
        this.txtFirmwarePath.Location = new System.Drawing.Point(120, 57);
        this.txtFirmwarePath.Name = "txtFirmwarePath";
        this.txtFirmwarePath.ReadOnly = true;
        this.txtFirmwarePath.Size = new System.Drawing.Size(400, 23);
        this.txtFirmwarePath.TabIndex = 3;
        //
        // btnBrowse
        //
        this.btnBrowse.Location = new System.Drawing.Point(530, 56);
        this.btnBrowse.Name = "btnBrowse";
        this.btnBrowse.Size = new System.Drawing.Size(90, 25);
        this.btnBrowse.TabIndex = 4;
        this.btnBrowse.Text = "Browse...";
        this.btnBrowse.UseVisualStyleBackColor = true;
        this.btnBrowse.Click += new System.EventHandler(this.btnBrowse_Click);
        //
        // btnUpload
        //
        this.btnUpload.Location = new System.Drawing.Point(120, 100);
        this.btnUpload.Name = "btnUpload";
        this.btnUpload.Size = new System.Drawing.Size(120, 30);
        this.btnUpload.TabIndex = 5;
        this.btnUpload.Text = "Upload Firmware";
        this.btnUpload.UseVisualStyleBackColor = true;
        this.btnUpload.Click += new System.EventHandler(this.btnUpload_Click);
        //
        // progressBar
        //
        this.progressBar.Location = new System.Drawing.Point(120, 145);
        this.progressBar.Name = "progressBar";
        this.progressBar.Size = new System.Drawing.Size(500, 23);
        this.progressBar.TabIndex = 6;
        //
        // txtLog
        //
        this.txtLog.Location = new System.Drawing.Point(20, 185);
        this.txtLog.Multiline = true;
        this.txtLog.Name = "txtLog";
        this.txtLog.ReadOnly = true;
        this.txtLog.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
        this.txtLog.Size = new System.Drawing.Size(600, 240);
        this.txtLog.TabIndex = 7;
        //
        // Form1
        //
        this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
        this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        this.ClientSize = new System.Drawing.Size(640, 450);
        this.Controls.Add(this.txtLog);
        this.Controls.Add(this.progressBar);
        this.Controls.Add(this.btnUpload);
        this.Controls.Add(this.btnBrowse);
        this.Controls.Add(this.txtFirmwarePath);
        this.Controls.Add(this.lblFirmwarePath);
        this.Controls.Add(this.txtDeviceUrl);
        this.Controls.Add(this.lblDeviceUrl);
        this.Name = "Form1";
        this.Text = "Firmware Updater";
        this.ResumeLayout(false);
        this.PerformLayout();
    }

    #endregion

    private System.Windows.Forms.TextBox txtDeviceUrl;
    private System.Windows.Forms.TextBox txtFirmwarePath;
    private System.Windows.Forms.Button btnBrowse;
    private System.Windows.Forms.Button btnUpload;
    private System.Windows.Forms.ProgressBar progressBar;
    private System.Windows.Forms.TextBox txtLog;
    private System.Windows.Forms.Label lblDeviceUrl;
    private System.Windows.Forms.Label lblFirmwarePath;
}
