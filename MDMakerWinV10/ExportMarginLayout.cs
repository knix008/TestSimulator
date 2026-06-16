namespace MDMakerWinV10;

/// <summary>Copyright·Confidential·페이지 번호의 margin-box 배치를 계산합니다.</summary>
static class ExportMarginLayout
{
    public static readonly PageNumberPosition[] ConfidentialPositions =
    [
        PageNumberPosition.TopLeft,
        PageNumberPosition.TopCenter,
        PageNumberPosition.TopRight,
        PageNumberPosition.BottomLeft,
        PageNumberPosition.BottomCenter,
    ];

    public readonly record struct Result(
        string? ConfidentialText,
        PageNumberPosition? ConfidentialSlot,
        string? CopyrightText,
        PageNumberPosition? CopyrightSlot,
        PageNumberPosition? PageNumberSlot);

    public static Result Resolve(PdfSettings settings)
    {
        string confText = settings.Confidential?.Trim() ?? "";
        string copyText = settings.Copyright?.Trim() ?? "";
        var confSlot = NormalizeConfidentialPosition(settings.ConfidentialPosition);
        var pageSlot = settings.PageNumbers;

        var occupied = new HashSet<PageNumberPosition>();

        PageNumberPosition? copyrightSlot = null;
        if (!string.IsNullOrEmpty(copyText))
        {
            copyrightSlot = PageNumberPosition.BottomLeft;
            occupied.Add(PageNumberPosition.BottomLeft);
        }

        PageNumberPosition? confidentialSlot = null;
        if (!string.IsNullOrEmpty(confText))
        {
            if (copyrightSlot != null && confSlot == PageNumberPosition.BottomLeft)
                confSlot = PageNumberPosition.BottomCenter;
            confidentialSlot = confSlot;
            occupied.Add(confSlot);
        }

        PageNumberPosition? resolvedPage = null;
        if (pageSlot != PageNumberPosition.None)
        {
            resolvedPage = occupied.Contains(pageSlot)
                ? FindFreeSlot(pageSlot, occupied)
                : pageSlot;
        }

        return new Result(
            string.IsNullOrEmpty(confText) ? null : confText,
            confidentialSlot,
            string.IsNullOrEmpty(copyText) ? null : copyText,
            copyrightSlot,
            resolvedPage);
    }

    public static PageNumberPosition NormalizeConfidentialPosition(PageNumberPosition pos)
    {
        if (ConfidentialPositions.Contains(pos))
            return pos;
        return PageNumberPosition.TopCenter;
    }

    public static string MarginBoxSelector(PageNumberPosition slot) => slot switch
    {
        PageNumberPosition.BottomLeft   => "bottom-left",
        PageNumberPosition.BottomCenter => "bottom-center",
        PageNumberPosition.BottomRight  => "bottom-right",
        PageNumberPosition.TopLeft      => "top-left",
        PageNumberPosition.TopCenter    => "top-center",
        PageNumberPosition.TopRight     => "top-right",
        _                               => "top-center",
    };

    public static bool IsTopSlot(PageNumberPosition slot) => slot >= PageNumberPosition.TopLeft;

    static PageNumberPosition FindFreeSlot(PageNumberPosition preferred, HashSet<PageNumberPosition> occupied)
    {
        bool preferTop = preferred >= PageNumberPosition.TopLeft;
        PageNumberPosition[] sameRow = preferTop
            ? [PageNumberPosition.TopLeft, PageNumberPosition.TopCenter, PageNumberPosition.TopRight]
            : [PageNumberPosition.BottomLeft, PageNumberPosition.BottomCenter, PageNumberPosition.BottomRight];
        PageNumberPosition[] otherRow = preferTop
            ? [PageNumberPosition.BottomLeft, PageNumberPosition.BottomCenter, PageNumberPosition.BottomRight]
            : [PageNumberPosition.TopLeft, PageNumberPosition.TopCenter, PageNumberPosition.TopRight];

        foreach (var slot in sameRow.Concat(otherRow))
        {
            if (!occupied.Contains(slot))
                return slot;
        }
        return preferred;
    }
}
