using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>코드 메트릭 검사 항목(분석·경고·표시) 설정.</summary>
public sealed class AnalysisScopeOptionsDialog : Form
{
    private readonly CheckedListBox _inspectionList = new()
    {
        CheckOnClick = true,
        Dock = DockStyle.Fill,
        IntegralHeight = false
    };

    public MetricInspectionKind SelectedInspectionScope { get; private set; } = MetricInspectionKind.All;

    public AnalysisScopeOptionsDialog(MetricInspectionKind inspectionScope)
    {
        Text = "분석 포함·제외";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(420, 480);
        MinimumSize = new Size(360, 360);
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ApplicationDialogIcons.ApplyAppTitleBar(this);

        SelectedInspectionScope = MetricInspectionCatalog.NormalizeScope(inspectionScope);
        var normalized = SelectedInspectionScope;

        foreach (var option in MetricInspectionCatalog.Options)
        {
            _inspectionList.Items.Add($"{option.Group} · {option.Label}");
        }

        for (var i = 0; i < MetricInspectionCatalog.Options.Count; i++)
        {
            _inspectionList.SetItemChecked(
                i,
                MetricInspectionCatalog.IsEnabled(normalized, MetricInspectionCatalog.Options[i].Kind));
        }

        var topPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            Padding = new Padding(8, 8, 8, 4),
            WrapContents = false
        };

        var selectAllButton = new Button
        {
            Text = "검사 항목 모두 선택",
            AutoSize = true,
            Margin = new Padding(0, 0, 8, 0),
            Image = MenuIconFactory.CreateSelectAllIcon(),
            ImageAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText
        };
        selectAllButton.Click += (_, _) => SetAllChecked(true);

        var clearAllButton = new Button
        {
            Text = "검사 항목 모두 해제",
            AutoSize = true,
            Margin = new Padding(0, 0, 8, 0),
            Image = MenuIconFactory.CreateClearAllIcon(),
            ImageAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText
        };
        clearAllButton.Click += (_, _) => SetAllChecked(false);

        topPanel.Controls.Add(selectAllButton);
        topPanel.Controls.Add(clearAllButton);

        var hintLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(12, 0, 12, 8),
            ForeColor = Color.DimGray,
            Text = "체크된 항목만 분석·경고·탭 표시에 사용합니다. 폴더 범위는 왼쪽 「하위 디렉터리」에서 설정하세요."
        };

        var listHost = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8, 0, 8, 0) };
        listHost.Controls.Add(_inspectionList);

        var headerPanel = ApplicationDialogIcons.CreateHeaderPanel("분석 포함·제외");

        var buttonPanel = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 48,
            Padding = new Padding(12, 8, 12, 8)
        };

        var okButton = new Button { Text = "확인", DialogResult = DialogResult.OK, Size = new Size(88, 30), Margin = new Padding(6, 0, 0, 0) };
        var cancelButton = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Size = new Size(88, 30) };
        okButton.Click += (_, _) =>
        {
            if (!TryCommitSelection())
            {
                DialogResult = DialogResult.None;
            }
        };

        var buttonBar = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Anchor = AnchorStyles.None
        };
        buttonBar.Controls.Add(cancelButton);
        buttonBar.Controls.Add(okButton);
        buttonPanel.Controls.Add(buttonBar);
        buttonPanel.Resize += (_, _) =>
        {
            buttonBar.Location = new Point(
                Math.Max(0, (buttonPanel.ClientSize.Width - buttonBar.Width) / 2),
                Math.Max(0, (buttonPanel.ClientSize.Height - buttonBar.Height) / 2));
        };

        Controls.Add(listHost);
        Controls.Add(buttonPanel);
        Controls.Add(hintLabel);
        Controls.Add(topPanel);
        Controls.Add(headerPanel);

        AcceptButton = okButton;
        CancelButton = cancelButton;
    }

    private void SetAllChecked(bool check)
    {
        for (var i = 0; i < _inspectionList.Items.Count; i++)
        {
            _inspectionList.SetItemChecked(i, check);
        }
    }

    private bool TryCommitSelection()
    {
        var kinds = new List<MetricInspectionKind>();
        for (var i = 0; i < MetricInspectionCatalog.Options.Count; i++)
        {
            if (_inspectionList.GetItemChecked(i))
            {
                kinds.Add(MetricInspectionCatalog.Options[i].Kind);
            }
        }

        if (kinds.Count == 0)
        {
            MessageBox.Show(this, "최소 한 개 이상의 검사 항목을 선택하세요.", "분석 포함", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return false;
        }

        SelectedInspectionScope = MetricInspectionCatalog.FromCheckedKinds(kinds);
        return true;
    }
}
