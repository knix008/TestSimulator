using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class AnalysisSummaryViewer : UserControl
{
    private const int CardWidth = 500;
    private const int CardHeight = 380;
    private const int FullWidthCardHeight = 440;
    private const int CardGap = 16;

    private readonly ToolTip _toolTip = new()
    {
        AutoPopDelay = 12000,
        InitialDelay = 350,
        ReshowDelay = 120,
        ShowAlways = true
    };

    private readonly Panel _scrollHost = new()
    {
        Dock = DockStyle.Fill,
        AutoScroll = true,
        BackColor = Color.FromArgb(238, 242, 248)
    };

    private readonly Label _header = new()
    {
        Dock = DockStyle.Top,
        Height = 52,
        Padding = new Padding(14, 10, 14, 6),
        Text = "품질 Summary",
        Font = new Font("Segoe UI Semibold", 11f, FontStyle.Bold),
        ForeColor = Color.FromArgb(25, 35, 50),
        BackColor = Color.FromArgb(238, 242, 248)
    };

    private readonly Panel _cardsPanel = new()
    {
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        BackColor = Color.FromArgb(238, 242, 248),
        Padding = new Padding(CardGap)
    };

    private AnalysisResult? _analysis;
    private string? _projectRoot;
    private bool _isAnalyzing;
    private IReadOnlyList<SummarySection> _sections = [];

    public event Action<DiagramViewKind>? NavigationRequested;

    public AnalysisSummaryViewer()
    {
        DoubleBuffered = true;
        _scrollHost.Controls.Add(_cardsPanel);
        Controls.Add(_scrollHost);
        Controls.Add(_header);
        _scrollHost.Resize += (_, _) => LayoutCards();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _toolTip.Dispose();
        }

        base.Dispose(disposing);
    }

    public void SetAnalysis(AnalysisResult? analysis, string? projectRoot)
    {
        _isAnalyzing = false;
        _analysis = analysis;
        _projectRoot = projectRoot;
        Rebuild();
    }

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _analysis = null;
        _projectRoot = null;
        _sections = [];
        _header.Text = "품질 Summary — 분석 중...";
        ClearCards();
        ShowPlaceholder("분석을 실행하면 코드 품질 요약과 개선 지표 차트가 표시됩니다.");
    }

    public void EndAnalysis() => _isAnalyzing = false;

    private void Rebuild()
    {
        if (_isAnalyzing)
        {
            return;
        }

        _sections = AnalysisSummarySectionBuilder.Build(_analysis);
        if (_sections.Count == 0)
        {
            _header.Text = "품질 Summary";
            ClearCards();
            ShowPlaceholder("표시할 품질 분석 결과가 없습니다. 프로젝트를 분석한 뒤 다시 확인하세요.");
            return;
        }

        var rootHint = string.IsNullOrWhiteSpace(_projectRoot) ? string.Empty : $" · {_projectRoot}";
        var areaCount = _sections.Count(section => !section.IsFullWidth);
        _header.Text = areaCount > 0
            ? $"품질 Summary — {areaCount}개 영역{rootHint}"
            : $"품질 Summary{rootHint}";
        ClearCards();
        foreach (var section in _sections)
        {
            _cardsPanel.Controls.Add(CreateCard(section));
        }

        LayoutCards();
    }

    private SummaryChartCard CreateCard(SummarySection section)
    {
        var defaultHeight = section.IsFullWidth ? FullWidthCardHeight : CardHeight;
        var card = new SummaryChartCard(_toolTip)
        {
            Width = section.IsFullWidth ? Math.Max(CardWidth, _scrollHost.ClientSize.Width - CardGap * 2) : CardWidth,
            Height = section.CardHeight ?? defaultHeight,
            Margin = new Padding(0, 0, CardGap, CardGap)
        };
        card.Bind(section);
        card.NavigationRequested += viewKind => NavigationRequested?.Invoke(viewKind);
        return card;
    }

    private void LayoutCards()
    {
        if (_cardsPanel.Controls.Count == 0)
        {
            _cardsPanel.Size = new Size(Math.Max(400, _scrollHost.ClientSize.Width), CardHeight);
            return;
        }

        var availableWidth = Math.Max(
            CardWidth,
            _scrollHost.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - CardGap * 2);
        var columns = Math.Max(1, availableWidth / (CardWidth + CardGap));
        var x = CardGap;
        var y = CardGap;
        var column = 0;
        var maxRight = CardGap;

        foreach (Control control in _cardsPanel.Controls)
        {
            if (control.Tag is SummarySection { IsFullWidth: true } fullWidthSection)
            {
                if (column > 0)
                {
                    y += CardHeight + CardGap;
                    column = 0;
                    x = CardGap;
                }
                control.Width = availableWidth;
                control.Height = fullWidthSection.CardHeight ?? FullWidthCardHeight;
                control.Location = new Point(CardGap, y);
                y += control.Height + CardGap;
                maxRight = Math.Max(maxRight, CardGap + availableWidth);
                continue;
            }

            control.Width = CardWidth;
            control.Height = CardHeight;
            control.Location = new Point(x, y);
            maxRight = Math.Max(maxRight, x + CardWidth);
            column++;
            if (column >= columns)
            {
                column = 0;
                x = CardGap;
                y += CardHeight + CardGap;
            }
            else
            {
                x += CardWidth + CardGap;
            }
        }

        if (column > 0)
        {
            y += CardHeight + CardGap;
        }

        _cardsPanel.Size = new Size(
            Math.Max(availableWidth, maxRight + CardGap),
            Math.Max(CardHeight, y));
    }

    private void ShowPlaceholder(string message)
    {
        var label = new Label
        {
            AutoSize = false,
            Width = Math.Max(320, _scrollHost.ClientSize.Width - CardGap * 4),
            Height = 120,
            Location = new Point(CardGap * 2, CardGap * 2),
            Text = message,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 10f),
            ForeColor = Color.FromArgb(90, 100, 115),
            BackColor = Color.FromArgb(252, 253, 255)
        };
        _cardsPanel.Controls.Add(label);
        _cardsPanel.Size = new Size(Math.Max(400, _scrollHost.ClientSize.Width), 160);
    }

    private void ClearCards() => _cardsPanel.Controls.Clear();
}
