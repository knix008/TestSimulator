using System.ComponentModel;

namespace RemBGWin1._0
{
    /// <summary>
    /// 마우스 휠 확대/축소, 드래그 패닝, 자동 스크롤바를 지원하는 이미지 패널.
    /// 더블클릭으로 화면 맞춤 복원. 줌 배율은 우하단에 오버레이로 표시됩니다.
    /// </summary>
    public class ZoomableImagePanel : Panel
    {
        // ── Fields ───────────────────────────────────────────────────────

        private Bitmap? _image;
        private float   _zoom        = 1f;
        private float   _offsetX;
        private float   _offsetY;
        private bool    _panning;
        private Point   _panOrigin;
        private float   _panStartX;
        private float   _panStartY;
        private bool    _fitOnResize = true;
        private bool    _lockScrollSync;

        private readonly HScrollBar _hBar    = new();
        private readonly VScrollBar _vBar    = new();
        private readonly Panel      _corner  = new();

        private const float MinZoom  = 0.02f;
        private const float MaxZoom  = 32f;
        private const int   TileSize = 16;

        private static readonly Brush TileLight = new SolidBrush(Color.FromArgb(204, 204, 204));
        private static readonly Brush TileDark  = new SolidBrush(Color.FromArgb(160, 160, 160));

        // ── Constructor ──────────────────────────────────────────────────

        public ZoomableImagePanel()
        {
            DoubleBuffered = true;
            ResizeRedraw   = true;

            _hBar.Visible = _vBar.Visible = _corner.Visible = false;
            _corner.BackColor = SystemColors.Control;

            _hBar.Scroll += (_, _) =>
            {
                if (_lockScrollSync) return;
                _offsetX     = -_hBar.Value;
                _fitOnResize = false;
                Invalidate();
            };
            _vBar.Scroll += (_, _) =>
            {
                if (_lockScrollSync) return;
                _offsetY     = -_vBar.Value;
                _fitOnResize = false;
                Invalidate();
            };

            Controls.AddRange(new Control[] { _hBar, _vBar, _corner });
        }

        // ── Public properties ────────────────────────────────────────────

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public Bitmap? Image
        {
            get => _image;
            set { _image = value; _fitOnResize = true; FitToView(); }
        }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public bool ShowCheckerboard { get; set; }

        [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
        public string PlaceholderText { get; set; } = string.Empty;

        public float CurrentZoom => _zoom;

        // ── Zoom API ─────────────────────────────────────────────────────

        public void FitToView()
        {
            if (_image == null || Width <= 0 || Height <= 0)
            {
                SyncScrollbars();
                Invalidate();
                return;
            }

            float sx = (float)Width  / _image.Width;
            float sy = (float)Height / _image.Height;
            _zoom    = MathF.Min(sx, sy);
            _offsetX = (Width  - _image.Width  * _zoom) / 2f;
            _offsetY = (Height - _image.Height * _zoom) / 2f;
            _fitOnResize = true;

            SyncScrollbars();
            Invalidate();
        }

        // ── Scrollbar management ─────────────────────────────────────────

        private void SyncScrollbars()
        {
            if (_lockScrollSync) return;
            _lockScrollSync = true;
            try
            {
                if (_image == null)
                {
                    _hBar.Visible = _vBar.Visible = _corner.Visible = false;
                    return;
                }

                int sbH = SystemInformation.HorizontalScrollBarHeight;
                int sbW = SystemInformation.VerticalScrollBarWidth;

                float imgW = _image.Width  * _zoom;
                float imgH = _image.Height * _zoom;

                // 두 스크롤바의 필요 여부 상호 결정
                bool needH = imgW > Width;
                bool needV = imgH > Height;
                if (needH && !needV) needV = imgH > Height - sbH;
                if (needV && !needH) needH = imgW > Width  - sbW;

                int viewW = Width  - (needV ? sbW : 0);
                int viewH = Height - (needH ? sbH : 0);

                _hBar.Visible   = needH;
                _vBar.Visible   = needV;
                _corner.Visible = needH && needV;

                if (needH)
                {
                    int maxScroll = Math.Max(0, (int)(imgW - viewW));
                    _hBar.Minimum     = 0;
                    _hBar.Maximum     = maxScroll + Math.Max(1, viewW) - 1;
                    _hBar.LargeChange = Math.Max(1, viewW);
                    _hBar.SmallChange = Math.Max(1, viewW / 20);
                    _hBar.Value       = Math.Clamp((int)-_offsetX, 0, maxScroll);
                    _hBar.SetBounds(0, Height - sbH, viewW, sbH);
                }

                if (needV)
                {
                    int maxScroll = Math.Max(0, (int)(imgH - viewH));
                    _vBar.Minimum     = 0;
                    _vBar.Maximum     = maxScroll + Math.Max(1, viewH) - 1;
                    _vBar.LargeChange = Math.Max(1, viewH);
                    _vBar.SmallChange = Math.Max(1, viewH / 20);
                    _vBar.Value       = Math.Clamp((int)-_offsetY, 0, maxScroll);
                    _vBar.SetBounds(Width - sbW, 0, sbW, viewH);
                }

                if (needH && needV)
                    _corner.SetBounds(Width - sbW, Height - sbH, sbW, sbH);
            }
            finally
            {
                _lockScrollSync = false;
            }
        }

        // ── 스크롤바를 제외한 실제 뷰포트 크기 ──────────────────────────

        private Rectangle Viewport => new(
            0, 0,
            Width  - (_vBar.Visible ? _vBar.Width  : 0),
            Height - (_hBar.Visible ? _hBar.Height : 0));

        // ── Mouse events ─────────────────────────────────────────────────

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            if (_fitOnResize) FitToView();
            else SyncScrollbars();
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            if (_image == null) { base.OnMouseWheel(e); return; }

            float factor  = e.Delta > 0 ? 1.2f : 1f / 1.2f;
            float newZoom = Math.Clamp(_zoom * factor, MinZoom, MaxZoom);

            // 마우스 커서 아래 이미지 좌표 고정
            float imgX = (e.X - _offsetX) / _zoom;
            float imgY = (e.Y - _offsetY) / _zoom;
            _zoom    = newZoom;
            _offsetX = e.X - imgX * _zoom;
            _offsetY = e.Y - imgY * _zoom;
            _fitOnResize = false;

            SyncScrollbars();
            Invalidate();
            base.OnMouseWheel(e);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left && _image != null)
            {
                _panning    = true;
                _panOrigin  = e.Location;
                _panStartX  = _offsetX;
                _panStartY  = _offsetY;
                Cursor      = Cursors.SizeAll;
            }
            base.OnMouseDown(e);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            if (_panning)
            {
                _offsetX     = _panStartX + (e.X - _panOrigin.X);
                _offsetY     = _panStartY + (e.Y - _panOrigin.Y);
                _fitOnResize = false;
                SyncScrollbars();
                Invalidate();
            }
            base.OnMouseMove(e);
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            if (_panning) { _panning = false; Cursor = Cursors.Default; }
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
            var view = Viewport;

            if (_image == null)
            {
                g.Clear(BackColor);
                DrawPlaceholder(g, view);
                return;
            }

            if (ShowCheckerboard)
                DrawCheckerboard(g, view);
            else
                g.Clear(BackColor);

            // 이미지 렌더링
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode   = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.Clip = new System.Drawing.Region(view);
            g.DrawImage(_image, _offsetX, _offsetY, _image.Width * _zoom, _image.Height * _zoom);
            g.ResetClip();

            // 배율 레이블
            DrawZoomLabel(g, view);
        }

        private static void DrawCheckerboard(Graphics g, Rectangle r)
        {
            for (int y = r.Y; y < r.Bottom; y += TileSize)
            for (int x = r.X; x < r.Right;  x += TileSize)
            {
                var brush = ((x / TileSize + y / TileSize) % 2 == 0) ? TileLight : TileDark;
                g.FillRectangle(brush, x, y,
                    Math.Min(TileSize, r.Right  - x),
                    Math.Min(TileSize, r.Bottom - y));
            }
        }

        private static void DrawPlaceholder(Graphics g, Rectangle r)
        {
            // do nothing if no text
        }

        private void DrawZoomLabel(Graphics g, Rectangle r)
        {
            string label = $"{_zoom * 100:F0}%";
            using var font    = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            using var bgBrush = new SolidBrush(Color.FromArgb(170, 20, 20, 20));
            using var fgBrush = new SolidBrush(Color.White);

            var size = g.MeasureString(label, font);
            float lx = r.Right  - size.Width  - 14;
            float ly = r.Bottom - size.Height - 10;

            g.FillRectangle(bgBrush, lx - 6, ly - 3, size.Width + 12, size.Height + 6);
            g.DrawString(label, font, fgBrush, lx, ly);
        }
    }
}
