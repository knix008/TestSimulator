using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class NotePropertiesDialog : Form
    {
        private readonly ProjectNote _note;
        private readonly ProjectModel _model;

        private TextBox _txtTitle = null!;
        private TextBox _txtBody = null!;
        private ComboBox _cboLinkedTask = null!;

        public NotePropertiesDialog(ProjectNote note, ProjectModel model)
        {
            _note = note;
            _model = model;
            Build();
            LoadValues();
        }

        private void Build()
        {
            Text = $"Note Properties — {_note.Title}";
            Size = new Size(520, 420);
            MinimumSize = Size;
            MaximumSize = Size;
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 4,
                Padding = new Padding(12)
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

            _txtTitle = new TextBox { Dock = DockStyle.Fill };
            _cboLinkedTask = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
            _txtBody = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ScrollBars = ScrollBars.Vertical
            };

            layout.Controls.Add(MakeLabel("Title:"), 0, 0);
            layout.Controls.Add(_txtTitle, 1, 0);
            layout.Controls.Add(MakeLabel("Linked:"), 0, 1);
            layout.Controls.Add(_cboLinkedTask, 1, 1);
            layout.Controls.Add(MakeLabel("Content:"), 0, 2);
            layout.Controls.Add(_txtBody, 1, 2);

            var btnOk = MakeButton("OK", true);
            var btnCancel = MakeButton("Cancel", false);
            btnOk.DialogResult = DialogResult.None;
            btnCancel.DialogResult = DialogResult.Cancel;
            btnOk.Click += (_, _) =>
            {
                if (SaveValues())
                    DialogResult = DialogResult.OK;
            };

            var btnPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false
            };
            btnPanel.Controls.Add(btnCancel);
            btnPanel.Controls.Add(btnOk);
            layout.Controls.Add(btnPanel, 0, 3);
            layout.SetColumnSpan(btnPanel, 2);

            Controls.Add(layout);
            AcceptButton = btnOk;
            CancelButton = btnCancel;
        }

        private static Label MakeLabel(string text) =>
            new()
            {
                Text = text,
                TextAlign = ContentAlignment.MiddleLeft,
                Dock = DockStyle.Fill,
                AutoSize = false
            };

        private static Button MakeButton(string text, bool primary) =>
            new()
            {
                Text = text,
                AutoSize = true,
                MinimumSize = new Size(84, 30),
                BackColor = primary ? AppTheme.Accent : AppTheme.SurfaceColor,
                ForeColor = primary ? Color.White : AppTheme.TextPrimary,
                FlatStyle = FlatStyle.Flat,
                Margin = new Padding(6, 0, 0, 0)
            };

        private void LoadValues()
        {
            _txtTitle.Text = _note.Title;
            _txtBody.Text = string.IsNullOrEmpty(_note.BodyRtf) ? _note.Body : _note.Body;

            _cboLinkedTask.Items.Clear();
            _cboLinkedTask.Items.Add(new TaskItem(-1, "(None)"));
            foreach (var task in _model.Tasks.OrderBy(t => t.Id))
                _cboLinkedTask.Items.Add(new TaskItem(task.Id, $"{task.Id}: {task.Name}"));

            SelectLinkedTask(_note.TaskId);
        }

        private void SelectLinkedTask(int taskId)
        {
            for (int i = 0; i < _cboLinkedTask.Items.Count; i++)
            {
                if (_cboLinkedTask.Items[i] is TaskItem item && item.Id == taskId)
                {
                    _cboLinkedTask.SelectedIndex = i;
                    return;
                }
            }

            _cboLinkedTask.SelectedIndex = 0;
        }

        private bool SaveValues()
        {
            string title = _txtTitle.Text.Trim();
            if (string.IsNullOrEmpty(title))
            {
                MessageBox.Show(this, "Title is required.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                _txtTitle.Focus();
                return false;
            }

            _model.UpdateNoteTitle(_note.Id, title);
            _model.UpdateNoteBody(_note.Id, _txtBody.Text);

            int linkedTaskId = (_cboLinkedTask.SelectedItem as TaskItem)?.Id ?? -1;
            if (linkedTaskId != _note.TaskId)
                _model.LinkNoteToTask(_note.Id, linkedTaskId);

            return true;
        }

        private sealed class TaskItem
        {
            public TaskItem(int id, string label)
            {
                Id = id;
                Label = label;
            }

            public int Id { get; }
            public string Label { get; }
            public override string ToString() => Label;
        }
    }
}
