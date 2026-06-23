using System.Diagnostics;

namespace MyProject.Forms
{
    public sealed class LoadingDialog : Form
    {
        private readonly Action _work;
        private volatile bool _closeRequested;

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

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);

            try
            {
                await Task.Run(_work).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"LoadingDialog work failed: {ex}");
            }
            finally
            {
                RequestClose();
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            _closeRequested = true;
            base.OnFormClosing(e);
        }

        private void RequestClose()
        {
            if (_closeRequested)
                return;

            if (IsDisposed)
            {
                _closeRequested = true;
                return;
            }

            try
            {
                if (InvokeRequired)
                {
                    BeginInvoke(RequestClose);
                    return;
                }
            }
            catch (InvalidOperationException)
            {
                _closeRequested = true;
                return;
            }

            _closeRequested = true;
            if (!IsDisposed)
                Close();
        }
    }
}
