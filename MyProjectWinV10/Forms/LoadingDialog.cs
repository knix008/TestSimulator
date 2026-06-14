namespace MyProject.Forms
{
    public sealed class LoadingDialog : Form
    {
        private readonly Action _work;

        public LoadingDialog(string message, Action work)
        {
            _work = work;

            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterParent;
            ControlBox = false;
            ShowInTaskbar = false;
            Text = "Please Wait";
            ClientSize = new Size(360, 90);
            BackColor = Color.White;

            Controls.Add(new Label
            {
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleLeft,
                Bounds = new Rectangle(16, 12, 328, 36),
                Font = new Font("Segoe UI", 9f),
                ForeColor = Color.FromArgb(30, 30, 30),
                Text = message
            });

            Controls.Add(new ProgressBar
            {
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 30,
                Bounds = new Rectangle(16, 56, 328, 18)
            });
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Task.Run(() =>
            {
                _work();
                BeginInvoke(Close);
            });
        }
    }
}
