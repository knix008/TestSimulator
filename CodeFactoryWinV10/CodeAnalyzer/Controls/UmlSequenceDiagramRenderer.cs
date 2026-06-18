using System.Diagnostics;
using System.Drawing.Drawing2D;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal sealed class UmlSequenceDiagramRenderer
{
    private const int LeftMargin = 40;
    private const int TopMargin = 28;
    private const int HeaderHeight = 40;
    private const int HeaderMinWidth = 100;
    private const int HeaderMaxWidth = 200;
    private const int LifelineGap = 48;
    private const int MessageRowHeight = 52;
    private const int BottomPadding = 48;
    private const int ActivationWidth = 12;
    private const int SelfCallWidth = 28;
    private const int SelfCallHeight = 22;
    private const int DocumentTopPadding = 8;
    private const int DocumentTitleHeight = 30;
    private const int DocumentPanelBottomPadding = 16;
    private const int DocumentPanelSeparator = 24;
    private const int DocumentGlobalNoteHeight = 22;
    private const float GdiSafeCoordinateMin = -32_768f;
    private const float GdiSafeCoordinateMax = 32_767f;

    public static Size Measure(SequenceDiagramResult? sequence)
    {
        if (sequence is null || sequence.ParticipantIds.Count == 0)
        {
            return new Size(400, 300);
        }

        return BuildLayout(sequence).DiagramSize;
    }

    public static Size MeasureDocument(SequenceDiagramDocument? document)
    {
        if (document is null || document.Panels.Count == 0)
        {
            return new Size(400, 300);
        }

        var maxWidth = 400;
        var totalHeight = DocumentTopPadding;

        if (!string.IsNullOrWhiteSpace(document.TruncationNote))
        {
            totalHeight += DocumentGlobalNoteHeight;
        }

        for (var index = 0; index < document.Panels.Count; index++)
        {
            var panel = document.Panels[index];
            var panelSize = panel.LayoutSize.IsEmpty ? Measure(panel.Diagram) : panel.LayoutSize;
            maxWidth = Math.Max(maxWidth, panelSize.Width);

            totalHeight += DocumentTitleHeight;
            if (!string.IsNullOrWhiteSpace(document.Panels[index].Diagram.TruncationNote))
            {
                totalHeight += 18;
            }

            totalHeight += panelSize.Height + DocumentPanelBottomPadding;

            if (index < document.Panels.Count - 1)
            {
                totalHeight += DocumentPanelSeparator;
            }
        }

        return new Size(maxWidth, Math.Max(totalHeight + 12, 280));
    }

    public static Size MeasurePanel(SequenceDiagramPanel panel)
    {
        var panelSize = panel.LayoutSize.IsEmpty ? Measure(panel.Diagram) : panel.LayoutSize;
        var height = panelSize.Height + 8;
        if (!string.IsNullOrWhiteSpace(panel.Diagram.TruncationNote))
        {
            height += 22;
        }

        if (!string.IsNullOrWhiteSpace(panel.Diagram.PageNote))
        {
            height += 22;
        }

        return new Size(
            Math.Min(Math.Max(panelSize.Width, 400), AnalysisScaleLimits.MaxSequenceDiagramCacheDimension),
            Math.Max(height, 280));
    }

    public static void DrawSinglePanel(Graphics graphics, SequenceDiagramPanel panel)
    {
        var y = 4;
        if (!string.IsNullOrWhiteSpace(panel.Diagram.TruncationNote))
        {
            DrawNote(graphics, panel.Diagram.TruncationNote, 12, y);
            y += 22;
        }

        if (!string.IsNullOrWhiteSpace(panel.Diagram.PageNote))
        {
            DrawNote(graphics, panel.Diagram.PageNote, 12, y);
            y += 22;
        }

        using var nameFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var messageFont = new Font("Segoe UI", 8.25f);
        DrawPanel(graphics, panel.Diagram, panel.Layout, new Point(0, y), nameFont, messageFont);
    }

    public static SequenceDiagramDocument AttachPanelSizes(
        SequenceDiagramDocument document,
        IProgress<AnalysisProgressReport>? progress = null)
    {
        if (document.Panels.Count == 0)
        {
            return document;
        }

        var panels = new List<SequenceDiagramPanel>(document.Panels.Count);
        var stopwatch = Stopwatch.StartNew();

        for (var index = 0; index < document.Panels.Count; index++)
        {
            var panel = document.Panels[index];
            var layoutSource = SequenceDiagramMessagePaginator.GetLayoutSource(panel.Diagram);
            var layout = BuildLayout(layoutSource);
            panels.Add(new SequenceDiagramPanel
            {
                RootId = panel.RootId,
                Title = panel.Title,
                Diagram = panel.Diagram,
                LayoutSize = layout.DiagramSize,
                Layout = layout
            });

            progress?.Report(new AnalysisProgressReport
            {
                Percent = 70 + (int)((index + 1) * 30.0 / document.Panels.Count),
                Message = $"레이아웃 계산 중 ({index + 1}/{document.Panels.Count})...",
                Elapsed = stopwatch.Elapsed
            });
        }

        progress?.Report(new AnalysisProgressReport
        {
            Percent = 100,
            Message = "완료",
            Elapsed = stopwatch.Elapsed
        });

        return new SequenceDiagramDocument
        {
            Panels = panels,
            IsTruncated = document.IsTruncated,
            TruncationNote = document.TruncationNote
        };
    }

    public static bool TryHitParticipant(
        SequenceDiagramResult? sequence,
        Point documentPoint,
        out string participantId)
    {
        participantId = string.Empty;
        if (sequence is null || sequence.ParticipantIds.Count == 0)
        {
            return false;
        }

        var layout = BuildLayout(sequence);
        foreach (var participant in layout.Participants)
        {
            var lifelineHit = new Rectangle(
                participant.LifelineX - 24,
                participant.HeaderBounds.Top,
                48,
                layout.LifelineBottomY - participant.HeaderBounds.Top);
            if (!participant.HeaderBounds.Contains(documentPoint) && !lifelineHit.Contains(documentPoint))
            {
                continue;
            }

            participantId = participant.Id;
            return true;
        }

        return false;
    }

    public static void Draw(Graphics graphics, SequenceDiagramResult? sequence)
    {
        DrawPanel(graphics, sequence, layout: null, Point.Empty);
    }

    public static void DrawDocument(Graphics graphics, SequenceDiagramDocument? document)
    {
        DrawDocument(graphics, document, null);
    }

    public static void DrawDocument(Graphics graphics, SequenceDiagramDocument? document, Rectangle? visibleDocumentBounds)
    {
        if (document is null || document.Panels.Count == 0)
        {
            return;
        }

        var y = DocumentTopPadding;
        const int cullMargin = 160;

        if (!string.IsNullOrWhiteSpace(document.TruncationNote))
        {
            DrawNote(graphics, document.TruncationNote, 12, y);
            y += DocumentGlobalNoteHeight;
        }

        using var titleFont = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        using var titleBrush = new SolidBrush(Color.FromArgb(35, 45, 60));
        using var separatorPen = new Pen(Color.FromArgb(210, 215, 222), 1f);
        using var nameFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var messageFont = new Font("Segoe UI", 8.25f);

        for (var index = 0; index < document.Panels.Count; index++)
        {
            var panel = document.Panels[index];
            var panelSize = panel.LayoutSize.IsEmpty ? Measure(panel.Diagram) : panel.LayoutSize;
            var blockHeight = ComputePanelBlockHeight(panel, panelSize);
            var blockTop = y;
            var blockBottom = blockTop + blockHeight;

            if (visibleDocumentBounds is { } visible)
            {
                if (blockBottom < visible.Top - cullMargin)
                {
                    y = blockBottom;
                    continue;
                }

                if (blockTop > visible.Bottom + cullMargin)
                {
                    break;
                }
            }

            var title = document.Panels.Count > 1
                ? $"[{index + 1}/{document.Panels.Count}] {panel.Title}"
                : panel.Title;

            graphics.DrawString(title, titleFont, titleBrush, 12, y);
            y += DocumentTitleHeight;

            if (!string.IsNullOrWhiteSpace(panel.Diagram.TruncationNote))
            {
                DrawNote(graphics, panel.Diagram.TruncationNote, 12, y);
                y += 18;
            }

            try
            {
                DrawPanel(graphics, panel.Diagram, panel.Layout, new Point(0, y), nameFont, messageFont);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                DrawNote(graphics, $"패널 그리기 실패: {ex.Message}", 12, y + 4);
                y += panelSize.Height + DocumentPanelBottomPadding;
                continue;
            }

            y += panelSize.Height + DocumentPanelBottomPadding;

            if (index < document.Panels.Count - 1)
            {
                graphics.DrawLine(separatorPen, 12, y, Math.Max(panelSize.Width - 12, 200), y);
                y += DocumentPanelSeparator;
            }
        }
    }

    private static int ComputePanelBlockHeight(SequenceDiagramPanel panel, Size panelSize)
    {
        var height = DocumentTitleHeight + panelSize.Height + DocumentPanelBottomPadding;
        if (!string.IsNullOrWhiteSpace(panel.Diagram.TruncationNote))
        {
            height += 18;
        }

        return height;
    }

    private static void DrawPanel(
        Graphics graphics,
        SequenceDiagramResult? sequence,
        SequenceDiagramLayoutData? layout,
        Point origin,
        Font? nameFont = null,
        Font? messageFont = null)
    {
        if (sequence is null || sequence.ParticipantIds.Count == 0)
        {
            return;
        }

        graphics.TranslateTransform(origin.X, origin.Y);
        try
        {
            DrawCore(graphics, sequence, layout, nameFont, messageFont);
        }
        finally
        {
            graphics.ResetTransform();
        }
    }

    private static void DrawNote(Graphics graphics, string note, int x, int y)
    {
        using var noteFont = new Font("Segoe UI", 8.25f, FontStyle.Italic);
        using var noteBrush = new SolidBrush(Color.FromArgb(120, 90, 0));
        graphics.DrawString(note, noteFont, noteBrush, x, y);
    }

    private static void DrawCore(
        Graphics graphics,
        SequenceDiagramResult sequence,
        SequenceDiagramLayoutData? layout,
        Font? nameFont = null,
        Font? messageFont = null)
    {
        var resolvedLayout = layout ?? BuildLayout(sequence);

        using var lifelinePen = new Pen(Color.FromArgb(90, 100, 115), 1f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash
        };
        using var borderPen = new Pen(Color.FromArgb(35, 45, 60), 1.4f);
        using var messagePen = new Pen(Color.FromArgb(35, 45, 60), 1.5f);
        using var headerBrush = new SolidBrush(Color.FromArgb(248, 250, 252));
        using var activationBrush = new SolidBrush(Color.FromArgb(225, 235, 248));
        using var activationBorder = new Pen(Color.FromArgb(74, 108, 155), 1f);
        using var ownedNameFont = nameFont is null ? new Font("Segoe UI", 9f, FontStyle.Bold) : null;
        using var ownedMessageFont = messageFont is null ? new Font("Segoe UI", 8.25f) : null;
        using var textBrush = new SolidBrush(Color.FromArgb(30, 40, 55));
        using var arrowFill = new SolidBrush(Color.FromArgb(35, 45, 60));
        var resolvedNameFont = nameFont ?? ownedNameFont!;
        var resolvedMessageFont = messageFont ?? ownedMessageFont!;

        foreach (var participant in resolvedLayout.Participants)
        {
            var header = participant.HeaderBounds;
            graphics.FillRectangle(headerBrush, header);
            graphics.DrawRectangle(borderPen, header);

            var name = participant.DisplayName;
            var nameSize = graphics.MeasureString(name, resolvedNameFont);
            graphics.DrawString(
                name,
                resolvedNameFont,
                textBrush,
                header.Left + (header.Width - nameSize.Width) / 2f,
                header.Top + (header.Height - nameSize.Height) / 2f - 1);

            graphics.DrawLine(
                lifelinePen,
                participant.LifelineX,
                header.Bottom,
                participant.LifelineX,
                resolvedLayout.LifelineBottomY);

            foreach (var activation in participant.Activations)
            {
                graphics.FillRectangle(activationBrush, activation);
                graphics.DrawRectangle(activationBorder, activation);
            }
        }

        foreach (var messageDraw in resolvedLayout.Messages)
        {
            if (messageDraw.FromIndex < 0
                || messageDraw.ToIndex < 0
                || messageDraw.FromIndex >= resolvedLayout.Participants.Count
                || messageDraw.ToIndex >= resolvedLayout.Participants.Count)
            {
                continue;
            }

            var from = resolvedLayout.Participants[messageDraw.FromIndex];
            var to = resolvedLayout.Participants[messageDraw.ToIndex];
            var y = messageDraw.Y;
            if (!IsDrawableCoordinate(y) || !IsDrawableCoordinate(from.LifelineX) || !IsDrawableCoordinate(to.LifelineX))
            {
                continue;
            }

            var label = $"{messageDraw.Message.Order + 1 + sequence.MessageIndexOffset}: {messageDraw.Message.Label}";

            if (messageDraw.IsSelfCall)
            {
                DrawSelfMessage(graphics, messagePen, arrowFill, resolvedMessageFont, textBrush, from.LifelineX, y, label);
                continue;
            }

            var x1 = from.LifelineX;
            var x2 = to.LifelineX;
            var start = new Point(x1, y);
            var end = new Point(x2, y);

            var labelSize = graphics.MeasureString(label, resolvedMessageFont);
            var labelX = Math.Min(x1, x2) + Math.Abs(x2 - x1) / 2f - labelSize.Width / 2f;
            graphics.DrawString(label, resolvedMessageFont, textBrush, labelX, y - labelSize.Height - 3);

            graphics.DrawLine(messagePen, start, end);
            DrawFilledArrow(graphics, messagePen, arrowFill, start, end);
        }
    }

    internal static SequenceDiagramLayoutData BuildLayout(SequenceDiagramResult sequence)
    {
        var participantWidths = sequence.ParticipantIds
            .Select(id =>
            {
                var name = GetDisplayName(sequence, id);
                return Math.Clamp(name.Length * 7 + 24, HeaderMinWidth, HeaderMaxWidth);
            })
            .ToList();

        var participants = new List<SequenceDiagramParticipantLayoutData>();
        var x = LeftMargin;
        for (var index = 0; index < sequence.ParticipantIds.Count; index++)
        {
            var id = sequence.ParticipantIds[index];
            var width = participantWidths[index];
            var header = new Rectangle(x, TopMargin, width, HeaderHeight);
            participants.Add(new SequenceDiagramParticipantLayoutData
            {
                Id = id,
                DisplayName = GetDisplayName(sequence, id),
                HeaderBounds = header,
                LifelineX = header.Left + header.Width / 2
            });
            x += width + LifelineGap;
        }

        var messageStartY = TopMargin + HeaderHeight + 36;
        var messages = new List<SequenceDiagramMessageLayoutData>();
        var activationsByParticipant = participants.ToDictionary(
            participant => participant.Id,
            _ => new List<Rectangle>(),
            StringComparer.Ordinal);

        foreach (var message in sequence.Messages.OrderBy(message => message.Order))
        {
            var fromIndex = IndexOf(sequence.ParticipantIds, message.FromId);
            var toIndex = IndexOf(sequence.ParticipantIds, message.ToId);
            if (fromIndex < 0 || toIndex < 0)
            {
                continue;
            }

            var y = messageStartY + message.Order * MessageRowHeight;
            var isSelf = fromIndex == toIndex;

            messages.Add(new SequenceDiagramMessageLayoutData
            {
                Message = message,
                FromIndex = fromIndex,
                ToIndex = toIndex,
                Y = y,
                IsSelfCall = isSelf
            });

            if (!isSelf)
            {
                var lifelineX = participants[toIndex].LifelineX;
                var activationTop = y - 4;
                var activationBottom = y + MessageRowHeight - 12;
                activationsByParticipant[message.ToId].Add(new Rectangle(
                    lifelineX - ActivationWidth / 2,
                    activationTop,
                    ActivationWidth,
                    activationBottom - activationTop));
            }
        }

        var participantsWithActivations = participants
            .Select(participant => new SequenceDiagramParticipantLayoutData
            {
                Id = participant.Id,
                DisplayName = participant.DisplayName,
                HeaderBounds = participant.HeaderBounds,
                LifelineX = participant.LifelineX,
                Activations = MergeActivations(activationsByParticipant[participant.Id])
            })
            .ToList();

        var lifelineBottom = messageStartY + Math.Max(1, sequence.Messages.Count) * MessageRowHeight + BottomPadding;
        var diagramWidth = participants.Count > 0
            ? participants[^1].HeaderBounds.Right + LeftMargin
            : 400;
        var diagramHeight = Math.Max(lifelineBottom + 20, 280);
        diagramWidth = Math.Min(diagramWidth, AnalysisScaleLimits.MaxSequenceDiagramCacheDimension);
        diagramHeight = Math.Min(diagramHeight, AnalysisScaleLimits.MaxSequenceDiagramCacheDimension);

        return new SequenceDiagramLayoutData
        {
            DiagramSize = new Size(Math.Max(diagramWidth, 400), diagramHeight),
            Participants = participantsWithActivations,
            Messages = messages,
            LifelineBottomY = lifelineBottom
        };
    }

    private static List<Rectangle> MergeActivations(List<Rectangle> activations)
    {
        if (activations.Count == 0)
        {
            return activations;
        }

        var sorted = activations.OrderBy(rect => rect.Top).ToList();
        var merged = new List<Rectangle> { sorted[0] };

        for (var index = 1; index < sorted.Count; index++)
        {
            var last = merged[^1];
            var current = sorted[index];
            if (current.Top <= last.Bottom + 4)
            {
                merged[^1] = Rectangle.Union(last, current);
            }
            else
            {
                merged.Add(current);
            }
        }

        return merged;
    }

    private static void DrawSelfMessage(
        Graphics graphics,
        Pen pen,
        Brush arrowFill,
        Font font,
        Brush textBrush,
        int lifelineX,
        int y,
        string label)
    {
        var loopRect = new Rectangle(lifelineX + 6, y - SelfCallHeight / 2, SelfCallWidth, SelfCallHeight);
        graphics.DrawRectangle(pen, loopRect);

        var start = new Point(lifelineX, y);
        var corner = new Point(loopRect.Right, y);
        var down = new Point(loopRect.Right, loopRect.Bottom);
        var back = new Point(lifelineX, loopRect.Bottom);

        graphics.DrawLine(pen, start, corner);
        graphics.DrawLine(pen, corner, down);
        graphics.DrawLine(pen, down, back);
        DrawFilledArrow(graphics, pen, arrowFill, down, back);

        var labelSize = graphics.MeasureString(label, font);
        graphics.DrawString(label, font, textBrush, loopRect.Right + 6, y - labelSize.Height / 2f);
    }

    private static void DrawFilledArrow(Graphics graphics, Pen pen, Brush fill, Point start, Point end)
    {
        DrawFilledArrow(graphics, pen, fill, new PointF(start.X, start.Y), new PointF(end.X, end.Y));
    }

    private static void DrawFilledArrow(Graphics graphics, Pen pen, Brush fill, PointF start, PointF end)
    {
        if (Math.Abs(start.X - end.X) < 0.5f && Math.Abs(start.Y - end.Y) < 0.5f)
        {
            return;
        }

        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f)
        {
            return;
        }

        var ux = dx / len;
        var uy = dy / len;
        var tip = end;
        var baseCenterX = tip.X - ux * 10f;
        var baseCenterY = tip.Y - uy * 10f;
        var perpX = -uy * 5f;
        var perpY = ux * 5f;

        var points = new[]
        {
            tip,
            new PointF(baseCenterX + perpX, baseCenterY + perpY),
            new PointF(baseCenterX - perpX, baseCenterY - perpY)
        };

        if (!IsDrawableCoordinate(points[0].X, points[0].Y)
            || !IsDrawableCoordinate(points[1].X, points[1].Y)
            || !IsDrawableCoordinate(points[2].X, points[2].Y))
        {
            return;
        }

        using var path = new GraphicsPath();
        path.AddPolygon(points);
        graphics.FillPath(fill, path);
        graphics.DrawPath(pen, path);
    }

    private static bool IsDrawableCoordinate(float value) =>
        value >= GdiSafeCoordinateMin && value <= GdiSafeCoordinateMax;

    private static bool IsDrawableCoordinate(int value) => IsDrawableCoordinate((float)value);

    private static bool IsDrawableCoordinate(float x, float y) =>
        IsDrawableCoordinate(x) && IsDrawableCoordinate(y);

    private static string GetDisplayName(SequenceDiagramResult sequence, string id)
    {
        if (sequence.ParticipantMap.TryGetValue(id, out var node))
        {
            var name = node.DisplayName;
            return name.Length > 22 ? name[..19] + "..." : name;
        }

        return id;
    }

    private static int IndexOf(IReadOnlyList<string> participants, string id)
    {
        for (var index = 0; index < participants.Count; index++)
        {
            if (string.Equals(participants[index], id, StringComparison.Ordinal))
            {
                return index;
            }
        }

        return -1;
    }
}
