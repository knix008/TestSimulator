using System.ComponentModel;

namespace BGRemoveWin1._0
{
    /// <summary>
    /// 마우스 휠로 확대/축소, 드래그로 패닝을 지원하는 이미지 패널.
    /// 이미지가 표시 영역을 초과하면 스크롤바가 자동으로 나타납니다.
    /// 더블클릭으로 화면 맞춤을 복원합니다.
    /// </summary>
    public class ZoomableImagePanel : Panel
    {
        // ── Fields ───────────────────────────────────────────────────────

        private Bitmap? _image;
        private float   _zoom = 1f;
        private float   _panX;
        private float   _panY;
        private bool    _isDragging;
        private Point   _dragStart;
        private float   _dragStartPanX;
        private float   _dragStartPanY;
        private bool    _showCheckerboard;
        private bool    _fitOnResize = true;
        private string  _placeholderText = "";
        private bool    _updatingScrollbars;

        private readonly HScrollBar _hScroll  = new();
        private readonly VScrollBar _vScroll  = new();
        private readonly Panel      _sbCorner = new();

        private const float MinZoom = 0.02f;
        private const float MaxZoom = 32f;

        private static readonly Brush ChkLight = new SolidBrush(Color.FromArgb(204, 204, 204));
        private static readonly Brush ChkDark  = new SolidBrush(Color.FromArgb(153, 153, 153));

        // ── Constructor ──────────────────────────────────────────────────

        public ZoomableImagePanel()
        {
            DoubleBuffered = true;
            ResizeRedraw   = true;

            _hScroll.Visible  = false;
            _vScroll.Visible  = false;
            _sbCorner.Visible = false;
            _sbCorner.BackColor = SystemColors.Control;

            _hScroll.Scroll += OnHScroll;
            _vScroll.Scroll += OnVScroll;

            Controls.AddRange(new Control[] { _hScroll, _vScroll, _sbCorner });
        }

        // ── Public properties ────────────────────────────────────────────

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public Bitmap? Image
        {
            get => _image;
            set { _image = value; _fitOnResize = true; FitToView(); }
        }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool ShowCheckerboard
        {
            get => _showCheckerboard;
            set { _showCheckerboard = value; Invalidate(); }
        }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string PlaceholderText
        {
            get => _placeholderText;
            set { _placeholderText = value; Invalidate(); }
        }

        public float CurrentZoom => _zoom;

        // ── Zoom API ─────────────────────────────────────────────────────

        public void FitToView()
        {
            if (_image == null || Width <= 0 || Height <= 0)
            {
                UpdateScrollbars();
                Invalidate();
                return;
            }
            float scaleX = (float)Width  / _image.Width;
            float scaleY = (float)Height / _image.Height;
            _zoom = MathF.Min(scaleX, scaleY);
            _panX = (Width  - _image.Width  * _zoom) / 2f;
            _panY = (Height - _image.Height * _zoom) / 2f;
            _fitOnResize = true;
            UpdateScrollbars();
            Invalidate();
        }

        // ── Scrollbar logic ──────────────────────────────────────────────

        private void OnHScroll(object? sender, ScrollEventArgs e)
        {
            if (_updatingScrollbars) return;
            _panX        = -_hScroll.Value;
            _fitOnResize = false;
            Invalidate();
        }

        private void OnVScroll(object? sender, ScrollEventArgs e)
        {
            if (_updatingScrollbars) return;
            _panY        = -_vScroll.Value;
            _fitOnResize = false;
            Invalidate();
        }

        private void UpdateScrollbars()
        {
            if (_updatingScrollbars) return;
            _updatingScrollbars = true;
            try
            {
                if (_image == null)
                {
                    _hScroll.Visible = _vScroll.Visible = _sbCorner.Visible = false;
                    return;
                }

                int sbH = SystemInformation.HorizontalScrollBarHeight;
                int sbW = SystemInformation.VerticalScrollBarWidth;

                float imgW = _image.Width  * _zoom;
                float imgH = _image.Height * _zoom;

                // 어느 스크롤바가 필요한지 결정 (상호 의존 해소)
                int viewW = Width;
                int viewH = Height;
                bool needH = imgW > viewW;
                bool needV = imgH > viewH;
                if (needH) { viewH = Height - sbH; needV = imgH > viewH; }
                if (needV) { viewW = Width  - sbW; needH = imgW > viewW; }

                int finalViewW = Width  - (needV ? sbW : 0);
                int finalViewH = Height - (needH ? sbH : 0);

                _hScroll.Visible  = needH;
                _vScroll.Visible  = needV;
                _sbCorner.Visible = needH && needV;

                if (needH)
                {
                    int maxScroll = Math.Max(0, (int)(imgW - finalViewW));
                    int lc        = Math.Max(1, finalViewW);
                    _hScroll.Minimum     = 0;
                    _hScroll.LargeChange = lc;
                    _hScroll.Maximum     = maxScroll + lc - 1;
                    _hScroll.SmallChange = Math.Max(1, finalViewW / 20);
                    _hScroll.Value       = Math.Clamp((int)-_panX, 0, maxScroll);
                    _hScroll.SetBounds(0, Height - sbH, finalViewW, sbH);
                }

                if (needV)
                {
                    int maxScroll = Math.Max(0, (int)(imgH - finalViewH));
                    int lc        = Math.Max(1, finalViewH);
                    _vScroll.Minimum     = 0;
                    _vScroll.LargeChange = lc;
                    _vScroll.Maximum     = maxScroll + lc - 1;
                    _vScroll.SmallChange = Math.Max(1, finalViewH / 20);
                    _vScroll.Value       = Math.Clamp((int)-_panY, 0, maxScroll);
                    _vScroll.SetBounds(Width - sbW, 0, sbW, finalViewH);
                }

                if (needH && needV)
                    _sbCorner.SetBounds(Width - sbW, Height - sbH, sbW, sbH);
            }
            finally
            {
                _updatingScrollbars = false;
            }
        }

        /// <summary>스크롤바를 제외한 실제 이미지 표시 영역</summary>
        private Rectangle EffectiveRect =>
            new(0, 0,
                Width  - (_vScroll.Visible ? _vScroll.Width  : 0),
                Height - (_hScroll.Visible ? _hScroll.Height : 0));

        // ── Mouse events ─────────────────────────────────────────────────

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            if (_fitOnResize) FitToView();
            else UpdateScrollbars();
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            if (_image == null) { base.OnMouseWheel(e); return; }

            float factor  = e.Delta > 0 ? 1.2f : 1f / 1.2f;
            float newZoom = Math.Clamp(_zoom * factor, MinZoom, MaxZoom);

            // 커서 아래의 이미지 좌표를 고정
            float imgX = (e.X - _panX) / _zoom;
            float imgY = (e.Y - _panY) / _zoom;

            _zoom        = newZoom;
            _panX        = e.X - imgX * _zoom;
            _panY        = e.Y - imgY * _zoom;
            _fitOnResize = false;

            UpdateScrollbars();
            Invalidate();
            base.OnMouseWheel(e);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left && _image != null)
            {
                _isDragging    = true;
                _dragStart     = e.Location;
                _dragStartPanX = _panX;
                _dragStartPanY = _panY;
                Cursor         = Cursors.SizeAll;
            }
            base.OnMouseDown(e);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            if (_isDragging)
            {
                _panX        = _dragStartPanX + (e.X - _dragStart.X);
                _panY        = _dragStartPanY + (e.Y - _dragStart.Y);
                _fitOnResize = false;
                UpdateScrollbars();
                Invalidate();
            }
            base.OnMouseMove(e);
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            if (_isDragging) { _isDragging = false; Cursor = Cursors.Default; }
            base.OnMouseUp(e);
        }

        protected override void OnDoubleClick(EventArgs e)
        {
            FitToView();
            base.OnDoubleClick(e);
        }

        // ── Painting ─────────────────────────────────────────────────────

        protected override void OnPaint(PaintEventArgs e)
        {
            var g    = e.Graphics;
            var rect = EffectiveRect; // 스크롤바 영역 제외

            if (_showCheckerboard)
                DrawCheckerboard(g, rect);
            else
                g.Clear(BackColor);

            if (_image == null)
            {
                DrawCenteredText(g, rect, _placeholderText);
                return;
            }

            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode   = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.Clip              = new System.Drawing.Region(rect);
            g.DrawImage(_image, _panX, _panY, _image.Width * _zoom, _image.Height * _zoom);
            g.ResetClip();

            DrawZoomLabel(g, rect);
        }

        private static void DrawCheckerboard(Graphics g, Rectangle rect)
        {
            const int tile = 16;
            for (int y = rect.Y; y < rect.Bottom; y += tile)
            for (int x = rect.X; x < rect.Right;  x += tile)
            {
                var brush = ((x / tile + y / tile) % 2 == 0) ? ChkLight : ChkDark;
                g.FillRectangle(brush, x, y,
                    Math.Min(tile, rect.Right  - x),
                    Math.Min(tile, rect.Bottom - y));
            }
        }

        private static void DrawCenteredText(Graphics g, Rectangle rect, string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            using var font  = new Font("Segoe UI", 11f);
            using var brush = new SolidBrush(Color.FromArgb(120, 120, 120));
            g.DrawString(text, font, brush, (RectangleF)rect, new StringFormat
            {
                Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center
            });
        }

        private void DrawZoomLabel(Graphics g, Rectangle rect)
        {
            string text = $"{_zoom * 100:F0}%";
            using var font    = new Font("Segoe UI", 9f, FontStyle.Bold);
            using var bgBrush = new SolidBrush(Color.FromArgb(180, 80, 0, 0));
            using var fgBrush = new SolidBrush(Color.FromArgb(255, 255, 80, 80));
            var size = g.MeasureString(text, font);
            float lx = rect.Right  - size.Width  - 10;
            float ly = rect.Bottom - size.Height - 8;
            g.FillRectangle(bgBrush, lx - 6, ly - 3, size.Width + 12, size.Height + 6);
            g.DrawString(text, font, fgBrush, lx, ly);
        }
    }
}
