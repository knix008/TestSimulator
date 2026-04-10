using System.Drawing;
using System.Text.Json;

namespace MemoPadV10;

public partial class MemoPadForm : Form
{
    private readonly List<string> _memoItems = [];
    private readonly string _memoFilePath;

    public MemoPadForm()
    {
        InitializeComponent();
        Icon = SystemIcons.Information;
        _memoFilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MemoPadV10",
            "memos.json");
        LoadMemos();
    }

    private void AddMemo()
    {
        string text = memoEditor.Text.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            MessageBox.Show("메모 내용을 입력해 주세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _memoItems.Add(text);
        SaveMemos();
        memoEditor.Clear();
        MessageBox.Show("메모가 추가되었습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void LoadMemos()
    {
        try
        {
            if (!File.Exists(_memoFilePath))
            {
                return;
            }

            string json = File.ReadAllText(_memoFilePath);
            List<string>? loaded = JsonSerializer.Deserialize<List<string>>(json);
            if (loaded is null)
            {
                return;
            }

            _memoItems.Clear();
            _memoItems.AddRange(loaded.Where(m => !string.IsNullOrWhiteSpace(m)));
        }
        catch (Exception)
        {
            MessageBox.Show("메모 목록 파일을 불러오지 못했습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void SaveMemos()
    {
        try
        {
            string? dirPath = Path.GetDirectoryName(_memoFilePath);
            if (!string.IsNullOrWhiteSpace(dirPath))
            {
                Directory.CreateDirectory(dirPath);
            }

            string json = JsonSerializer.Serialize(_memoItems, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_memoFilePath, json);
        }
        catch (Exception)
        {
            MessageBox.Show("메모 저장에 실패했습니다.", "오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void addMemoToolStripMenuItem_Click(object sender, EventArgs e)
    {
        AddMemo();
    }

    private void addMemoButton_Click(object sender, EventArgs e)
    {
        AddMemo();
    }

    private void fontSizeMenuItem_Click(object sender, EventArgs e)
    {
        if (sender is not ToolStripMenuItem menuItem)
        {
            return;
        }

        if (!float.TryParse(menuItem.Text, out float newSize))
        {
            return;
        }

        memoEditor.Font = new Font(memoEditor.Font.FontFamily, newSize, FontStyle.Regular);
    }

    private void showMemoListToolStripMenuItem_Click(object sender, EventArgs e)
    {
        LoadMemos();

        using Form listForm = new()
        {
            Text = "메모 목록",
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(520, 420),
            MinimizeBox = false,
            MaximizeBox = false,
            FormBorderStyle = FormBorderStyle.SizableToolWindow
        };

        TableLayoutPanel layout = new()
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44f));

        ListBox listBox = new()
        {
            Dock = DockStyle.Fill,
            Font = new Font("맑은 고딕", 10f, FontStyle.Regular),
            HorizontalScrollbar = true
        };

        Button loadButton = new()
        {
            Dock = DockStyle.Right,
            Width = 110,
            Text = "불러오기"
        };

        Panel buttonPanel = new()
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(8, 6, 8, 6)
        };
        buttonPanel.Controls.Add(loadButton);

        if (_memoItems.Count == 0)
        {
            listBox.Items.Add("저장된 메모가 없습니다.");
            listBox.Enabled = false;
            loadButton.Enabled = false;
        }
        else
        {
            for (int i = 0; i < _memoItems.Count; i++)
            {
                listBox.Items.Add($"{i + 1}. {_memoItems[i]}");
            }
        }

        void LoadSelectedMemo()
        {
            if (listBox.SelectedIndex < 0 || listBox.SelectedIndex >= _memoItems.Count)
            {
                return;
            }

            memoEditor.Text = _memoItems[listBox.SelectedIndex];
            memoEditor.Focus();
            memoEditor.SelectionStart = memoEditor.TextLength;
            listForm.DialogResult = DialogResult.OK;
            listForm.Close();
        }

        loadButton.Click += (_, _) => LoadSelectedMemo();
        listBox.DoubleClick += (_, _) => LoadSelectedMemo();

        layout.Controls.Add(listBox, 0, 0);
        layout.Controls.Add(buttonPanel, 0, 1);
        listForm.Controls.Add(layout);
        listForm.ShowDialog(this);
    }
}
