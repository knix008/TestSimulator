using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal sealed class UmlSequenceLayout
{
    public Size DiagramSize { get; init; }
    public IReadOnlyList<UmlSequenceParticipantLayout> Participants { get; init; } = [];
    public IReadOnlyList<UmlSequenceMessageLayout> Messages { get; init; } = [];
    public int LifelineBottomY { get; init; }
}

internal sealed class UmlSequenceParticipantLayout
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public Rectangle HeaderBounds { get; init; }
    public int LifelineX { get; init; }
    public IReadOnlyList<Rectangle> Activations { get; init; } = [];
}

internal sealed class UmlSequenceMessageLayout
{
    public required SequenceMessage Message { get; init; }
    public int FromIndex { get; init; }
    public int ToIndex { get; init; }
    public int Y { get; init; }
    public bool IsSelfCall { get; init; }
}

internal static class UmlSequenceDiagramRenderer
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

    public static Size Measure(SequenceDiagramResult? sequence)
    {
        if (sequence is null || sequence.ParticipantIds.Count == 0)
        {
            return new Size(400, 300);
        }

        return BuildLayout(sequence).DiagramSize;
    }

    public static void Draw(Graphics graphics, SequenceDiagramResult? sequence)
    {
        if (sequence is null || sequence.ParticipantIds.Count == 0)
        {
            return;
        }

        var layout = BuildLayout(sequence);

        using var lifelinePen = new Pen(Color.FromArgb(90, 100, 115), 1f)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash
        };
        using var borderPen = new Pen(Color.FromArgb(35, 45, 60), 1.4f);
        using var messagePen = new Pen(Color.FromArgb(35, 45, 60), 1.5f);
        using var fillBrush = new SolidBrush(Color.White);
        using var headerBrush = new SolidBrush(Color.FromArgb(248, 250, 252));
        using var activationBrush = new SolidBrush(Color.FromArgb(225, 235, 248));
        using var activationBorder = new Pen(Color.FromArgb(74, 108, 155), 1f);
        using var nameFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var messageFont = new Font("Segoe UI", 8.25f);
        using var textBrush = new SolidBrush(Color.FromArgb(30, 40, 55));
        using var arrowFill = new SolidBrush(Color.FromArgb(35, 45, 60));

        foreach (var participant in layout.Participants)
        {
            var header = participant.HeaderBounds;
            graphics.FillRectangle(headerBrush, header);
            graphics.DrawRectangle(borderPen, header);

            var name = participant.DisplayName;
            var nameSize = graphics.MeasureString(name, nameFont);
            graphics.DrawString(
                name,
                nameFont,
                textBrush,
                header.Left + (header.Width - nameSize.Width) / 2f,
                header.Top + (header.Height - nameSize.Height) / 2f - 1);

            graphics.DrawLine(
                lifelinePen,
                participant.LifelineX,
                header.Bottom,
                participant.LifelineX,
                layout.LifelineBottomY);

            foreach (var activation in participant.Activations)
            {
                graphics.FillRectangle(activationBrush, activation);
                graphics.DrawRectangle(activationBorder, activation);
            }
        }

        foreach (var messageDraw in layout.Messages)
        {
            var from = layout.Participants[messageDraw.FromIndex];
            var to = layout.Participants[messageDraw.ToIndex];
            var y = messageDraw.Y;
            var label = $"{messageDraw.Message.Order + 1}: {messageDraw.Message.Label}";

            if (messageDraw.IsSelfCall)
            {
                DrawSelfMessage(graphics, messagePen, arrowFill, messageFont, textBrush, from.LifelineX, y, label);
                continue;
            }

            var x1 = from.LifelineX;
            var x2 = to.LifelineX;
            var start = new Point(x1, y);
            var end = new Point(x2, y);

            var labelSize = graphics.MeasureString(label, messageFont);
            var labelX = Math.Min(x1, x2) + Math.Abs(x2 - x1) / 2f - labelSize.Width / 2f;
            graphics.DrawString(label, messageFont, textBrush, labelX, y - labelSize.Height - 3);

            graphics.DrawLine(messagePen, start, end);
            DrawFilledArrow(graphics, messagePen, arrowFill, start, end);
        }
    }

    private static UmlSequenceLayout BuildLayout(SequenceDiagramResult sequence)
    {
        var participantWidths = sequence.ParticipantIds
            .Select(id =>
            {
                var name = GetDisplayName(sequence, id);
                return Math.Clamp(name.Length * 7 + 24, HeaderMinWidth, HeaderMaxWidth);
            })
            .ToList();

        var participants = new List<UmlSequenceParticipantLayout>();
        var x = LeftMargin;
        for (var index = 0; index < sequence.ParticipantIds.Count; index++)
        {
            var id = sequence.ParticipantIds[index];
            var width = participantWidths[index];
            var header = new Rectangle(x, TopMargin, width, HeaderHeight);
            participants.Add(new UmlSequenceParticipantLayout
            {
                Id = id,
                DisplayName = GetDisplayName(sequence, id),
                HeaderBounds = header,
                LifelineX = header.Left + header.Width / 2
            });
            x += width + LifelineGap;
        }

        var messageStartY = TopMargin + HeaderHeight + 36;
        var messages = new List<UmlSequenceMessageLayout>();
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

            messages.Add(new UmlSequenceMessageLayout
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
            .Select(participant => new UmlSequenceParticipantLayout
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

        return new UmlSequenceLayout
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
        if (start.X == end.X && start.Y == end.Y)
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
        var baseCenterX = tip.X - ux * 10;
        var baseCenterY = tip.Y - uy * 10;
        var perpX = -uy * 5;
        var perpY = ux * 5;

        var points = new[]
        {
            tip,
            new Point((int)(baseCenterX + perpX), (int)(baseCenterY + perpY)),
            new Point((int)(baseCenterX - perpX), (int)(baseCenterY - perpY))
        };

        graphics.FillPolygon(fill, points);
        graphics.DrawPolygon(pen, points);
    }

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
