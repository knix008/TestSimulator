namespace MyDiffWinV10.App.Controls;

/// <summary>
/// Exposes scroll position and line metrics for a paired <see cref="LineNumberGutter"/>.
/// </summary>
internal interface ILineScrollSource
{
    Font LineFont { get; }

    int LineCount { get; }

    int ContentLineCount { get; }

    int GetFirstVisibleLine();

    int GetLineTop(int lineIndex);

    int GetLineHeight(int lineIndex);

    event EventHandler? ScrollPositionChanged;
}
