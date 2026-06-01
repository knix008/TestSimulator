using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    public partial class MindMapCanvasControl
    {
        private const double AttachmentGap = 8;
        private const double ImageAttachmentReserve = 200;
        private const double NoteAttachmentReserve = 110;
        private const double OverlayCollisionMargin = 14;

        private Dictionary<Guid, (double X, double Y)>? _expandReflowSnapshot;
        private bool _expandReflowKeepOnClose;

        private double GetAttachmentReserveHeight(NodeViewModel node)
        {
            double h = 0;
            if (node.HasImage) h += ImageAttachmentReserve;
            if (node.HasNote) h += NoteAttachmentReserve;
            return h > 0 ? h + AttachmentGap : 0;
        }

        private double GetLayoutBlockHeight(NodeViewModel node)
            => NodeHeight + GetAttachmentReserveHeight(node);

        private double GetNodeExtentBottom(NodeViewModel node)
        {
            double bottom = node.Y + GetLayoutBlockHeight(node);
            if (_notePanelNode == node || _imagePanelNode == node)
            {
                var overlay = GetExpandedOverlayWorldBounds(node);
                if (!overlay.IsEmpty)
                    bottom = Math.Max(bottom, overlay.Bottom);
            }

            return bottom;
        }

        private static Rect GetNodeWorldBounds(NodeViewModel node)
            => new(node.X, node.Y, node.Width, NodeHeight);

        private Rect GetAttachmentReserveRect(NodeViewModel node)
        {
            double h = GetAttachmentReserveHeight(node);
            if (h <= 0) return Rect.Empty;
            return new Rect(
                node.X,
                node.Y + NodeHeight + AttachmentGap,
                Math.Max(node.Width, 180),
                h);
        }

        private void ApplyAutomaticLayoutPositions()
        {
            if (_vm?.RootNode == null) return;

            foreach (var node in _vm.GetAllNodes())
                node.Width = MeasureTextWidth(node.Text, node.Level == 0 ? 16 : 13) + 28;

            switch (_vm.LayoutType)
            {
                case LayoutType.Radial:
                    LayoutRadial(_vm.RootNode);
                    AlignRadialRootToTreeCenter(_vm.RootNode);
                    break;
                case LayoutType.Fishbone:
                    LayoutFishbone(_vm.RootNode);
                    break;
                default:
                    LayoutHorizontal(_vm.RootNode, ContentPadding, ContentPadding, out _);
                    break;
            }

            if (_vm.LayoutFlipHorizontal || _vm.LayoutFlipVertical)
                ApplyLayoutFlip(_vm.LayoutFlipHorizontal, _vm.LayoutFlipVertical);

            foreach (var node in _vm.GetAllNodes())
                node.SyncToModel();
        }

        private void RelayoutAfterAttachmentChange(NodeViewModel changedNode)
        {
            if (_vm == null) return;

            if (!_userPositioned)
                ApplyAutomaticLayoutPositions();
            else
                EnsureSpaceForNodeAttachment(changedNode);

            RefreshAllVisuals();
            UpdateContentExtent();
            FinishOverlayReflow(changedNode);
        }

        private void EnsureSpaceForNodeAttachment(NodeViewModel node)
        {
            var reserve = GetAttachmentReserveRect(node);
            if (reserve.IsEmpty) return;

            PushNodesAwayFrom(reserve, node);
        }

        private void BeginExpandReflowSnapshot(bool keepPositionsOnClose)
        {
            _expandReflowKeepOnClose = keepPositionsOnClose;
            if (keepPositionsOnClose || _expandReflowSnapshot != null || _vm == null)
                return;

            _expandReflowSnapshot = _vm.GetAllNodes()
                .ToDictionary(n => n.Model.Id, n => (n.X, n.Y));
        }

        private void RestoreExpandReflowSnapshot()
        {
            if (_expandReflowKeepOnClose || _expandReflowSnapshot == null || _vm == null)
            {
                _expandReflowSnapshot = null;
                return;
            }

            foreach (var node in _vm.GetAllNodes())
            {
                if (_expandReflowSnapshot.TryGetValue(node.Model.Id, out var pos))
                {
                    node.X = pos.X;
                    node.Y = pos.Y;
                    node.SyncToModel();
                }
            }

            _expandReflowSnapshot = null;
            RefreshAllVisuals();
            UpdateContentExtent();
        }

        private void FinishOverlayReflow(NodeViewModel anchor)
        {
            PositionNodeOverlays(anchor);
            NoteBorder.UpdateLayout();
            ImageBorder.UpdateLayout();

            var obstacle = GetExpandedOverlayWorldBounds(anchor);
            if (!obstacle.IsEmpty)
            {
                PushNodesAwayFrom(obstacle, anchor);
                RefreshAllVisuals();
                UpdateContentExtent();
                PositionNodeOverlays(anchor);
            }
        }

        private void AfterOverlayOpened(NodeViewModel node, bool keepReflowOnClose)
        {
            BeginExpandReflowSnapshot(keepReflowOnClose);
            FinishOverlayReflow(node);
        }

        private Rect GetExpandedOverlayWorldBounds(NodeViewModel anchor)
        {
            var bounds = GetAttachmentReserveRect(anchor);

            if (_notePanelNode == anchor && NoteBorder.Visibility == Visibility.Visible)
            {
                var noteRect = ElementToWorldRect(NoteBorder);
                if (!noteRect.IsEmpty)
                    bounds = bounds.IsEmpty ? noteRect : Rect.Union(bounds, noteRect);
            }

            if (_imagePanelNode == anchor && ImageBorder.Visibility == Visibility.Visible)
            {
                var imageRect = ElementToWorldRect(ImageBorder);
                if (!imageRect.IsEmpty)
                    bounds = bounds.IsEmpty ? imageRect : Rect.Union(bounds, imageRect);
            }

            return bounds;
        }

        private Rect ElementToWorldRect(FrameworkElement element)
        {
            if (element.Visibility != Visibility.Visible)
                return Rect.Empty;

            element.UpdateLayout();
            if (element.ActualWidth <= 0 || element.ActualHeight <= 0)
                return Rect.Empty;

            var transform = element.TransformToVisual(NodeCanvas);
            if (transform == null)
                return Rect.Empty;

            var topLeft = transform.Transform(new Point(0, 0));
            var bottomRight = transform.Transform(new Point(element.ActualWidth, element.ActualHeight));
            return new Rect(
                topLeft.X + _contentOriginX,
                topLeft.Y + _contentOriginY,
                Math.Max(0, bottomRight.X - topLeft.X),
                Math.Max(0, bottomRight.Y - topLeft.Y));
        }

        private void PushNodesAwayFrom(Rect obstacle, NodeViewModel anchor)
        {
            if (_vm == null || obstacle.IsEmpty) return;

            obstacle.Inflate(OverlayCollisionMargin, OverlayCollisionMargin);

            const int maxIterations = 32;
            for (int iteration = 0; iteration < maxIterations; iteration++)
            {
                bool movedAny = false;

                foreach (var other in _vm.GetAllNodes())
                {
                    if (other == anchor || IsDescendantOf(anchor, other))
                        continue;

                    var nodeBounds = GetNodeWorldBounds(other);
                    if (!obstacle.IntersectsWith(nodeBounds))
                        continue;

                    double dy = obstacle.Bottom - nodeBounds.Top;
                    if (dy <= 0.5)
                        continue;

                    ShiftSubtree(other, 0, dy);
                    other.HasManualPosition = true;
                    movedAny = true;
                }

                if (!movedAny)
                    break;
            }
        }

        private static bool IsDescendantOf(NodeViewModel ancestor, NodeViewModel node)
        {
            for (var current = node.Parent; current != null; current = current.Parent)
            {
                if (current == ancestor)
                    return true;
            }

            return false;
        }
    }
}
