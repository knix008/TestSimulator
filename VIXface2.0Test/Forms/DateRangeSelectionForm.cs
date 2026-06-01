namespace VIXFaceTest
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
            startDateLabel = new Label();
            startDatePicker = new DateTimePicker();
            endDateLabel = new Label();
            endDatePicker = new DateTimePicker();
            okButton = new Button();
            cancelButton = new Button();
            SuspendLayout();

            startDateLabel.AutoSize = true;
            startDateLabel.Location = new Point(12, 15);
            startDateLabel.Text = "시작 날짜:";

            startDatePicker.Format = DateTimePickerFormat.Short;
            startDatePicker.Location = new Point(85, 12);
            startDatePicker.Size = new Size(200, 23);

            endDateLabel.AutoSize = true;
            endDateLabel.Location = new Point(12, 50);
            endDateLabel.Text = "종료 날짜:";

            endDatePicker.Format = DateTimePickerFormat.Short;
            endDatePicker.Location = new Point(85, 47);
            endDatePicker.Size = new Size(200, 23);

            okButton.DialogResult = DialogResult.OK;
            okButton.Location = new Point(129, 85);
            okButton.Size = new Size(75, 23);
            okButton.Text = "확인";
            okButton.Click += OkButton_Click;

            cancelButton.DialogResult = DialogResult.Cancel;
            cancelButton.Location = new Point(210, 85);
            cancelButton.Size = new Size(75, 23);
            cancelButton.Text = "취소";

            AcceptButton = okButton;
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            CancelButton = cancelButton;
            ClientSize = new Size(300, 120);
            Controls.Add(cancelButton);
            Controls.Add(okButton);
            Controls.Add(endDatePicker);
            Controls.Add(endDateLabel);
            Controls.Add(startDatePicker);
            Controls.Add(startDateLabel);
            Font = new Font("맑은 고딕", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            Text = "날짜 범위 선택";
            ResumeLayout(false);
            PerformLayout();
        }

        private void InitializeDateRange()
        {
            EndDate = DateTime.Today;
            StartDate = DateTime.Today.AddDays(-30);
            startDatePicker.Value = StartDate;
            endDatePicker.Value = EndDate;
        }

        private void OkButton_Click(object? sender, EventArgs e)
        {
            StartDate = startDatePicker.Value.Date;
            EndDate = endDatePicker.Value.Date.AddDays(1).AddTicks(-1);

            if (StartDate > endDatePicker.Value.Date)
            {
                MessageBox.Show("시작 날짜는 종료 날짜보다 늦을 수 없습니다.",
                    "날짜 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            DialogResult = DialogResult.OK;
            Close();
        }
    }
}
