namespace VixReaderTest01
{
    public partial class DateRangeSelectionForm : Form
    {
        public DateTime StartDate { get; private set; }
        public DateTime EndDate { get; private set; }

        private DateTimePicker startDatePicker = null!;
        private DateTimePicker endDatePicker = null!;
        private Button okButton = null!;
        private Button cancelButton = null!;
        private Label startDateLabel = null!;
        private Label endDateLabel = null!;

        public DateRangeSelectionForm()
        {
            InitializeComponent();
            InitializeDateRange();
        }

        private void InitializeComponent()
        {
            this.startDateLabel = new Label();
            this.startDatePicker = new DateTimePicker();
            this.endDateLabel = new Label();
            this.endDatePicker = new DateTimePicker();
            this.okButton = new Button();
            this.cancelButton = new Button();
            this.SuspendLayout();

            // startDateLabel
            this.startDateLabel.AutoSize = true;
            this.startDateLabel.Location = new Point(12, 15);
            this.startDateLabel.Name = "startDateLabel";
            this.startDateLabel.Size = new Size(67, 15);
            this.startDateLabel.TabIndex = 0;
            this.startDateLabel.Text = "시작 날짜:";

            // startDatePicker
            this.startDatePicker.Format = DateTimePickerFormat.Short;
            this.startDatePicker.Location = new Point(85, 12);
            this.startDatePicker.Name = "startDatePicker";
            this.startDatePicker.Size = new Size(200, 23);
            this.startDatePicker.TabIndex = 1;

            // endDateLabel
            this.endDateLabel.AutoSize = true;
            this.endDateLabel.Location = new Point(12, 50);
            this.endDateLabel.Name = "endDateLabel";
            this.endDateLabel.Size = new Size(67, 15);
            this.endDateLabel.TabIndex = 2;
            this.endDateLabel.Text = "종료 날짜:";

            // endDatePicker
            this.endDatePicker.Format = DateTimePickerFormat.Short;
            this.endDatePicker.Location = new Point(85, 47);
            this.endDatePicker.Name = "endDatePicker";
            this.endDatePicker.Size = new Size(200, 23);
            this.endDatePicker.TabIndex = 3;

            // okButton
            this.okButton.DialogResult = DialogResult.OK;
            this.okButton.Location = new Point(129, 85);
            this.okButton.Name = "okButton";
            this.okButton.Size = new Size(75, 23);
            this.okButton.TabIndex = 4;
            this.okButton.Text = "확인";
            this.okButton.UseVisualStyleBackColor = true;
            this.okButton.Click += new EventHandler(this.OkButton_Click!);

            // cancelButton
            this.cancelButton.DialogResult = DialogResult.Cancel;
            this.cancelButton.Location = new Point(210, 85);
            this.cancelButton.Name = "cancelButton";
            this.cancelButton.Size = new Size(75, 23);
            this.cancelButton.TabIndex = 5;
            this.cancelButton.Text = "취소";
            this.cancelButton.UseVisualStyleBackColor = true;

            // DateRangeSelectionForm
            this.AcceptButton = this.okButton;
            this.AutoScaleDimensions = new SizeF(7F, 15F);
            this.AutoScaleMode = AutoScaleMode.Font;
            this.CancelButton = this.cancelButton;
            this.ClientSize = new Size(300, 120);
            this.Controls.Add(this.cancelButton);
            this.Controls.Add(this.okButton);
            this.Controls.Add(this.endDatePicker);
            this.Controls.Add(this.endDateLabel);
            this.Controls.Add(this.startDatePicker);
            this.Controls.Add(this.startDateLabel);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "DateRangeSelectionForm";
            this.StartPosition = FormStartPosition.CenterParent;
            this.Text = "날짜 범위 선택";
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private void InitializeDateRange()
        {
            // 기본값: 지난 30일
            EndDate = DateTime.Today;
            StartDate = DateTime.Today.AddDays(-30);
            
            if (startDatePicker != null)
                startDatePicker.Value = StartDate;
            if (endDatePicker != null)
                endDatePicker.Value = EndDate;
        }

        private void OkButton_Click(object? sender, EventArgs e)
        {
            StartDate = startDatePicker.Value.Date;
            EndDate = endDatePicker.Value.Date.AddDays(1).AddTicks(-1); // 종료 날짜의 23:59:59까지 포함

            if (StartDate > EndDate.Date)
            {
                MessageBox.Show("시작 날짜는 종료 날짜보다 늦을 수 없습니다.", 
                              "날짜 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            this.DialogResult = DialogResult.OK;
            this.Close();
        }
    }
}