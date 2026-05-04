using System.Drawing;
using System.Windows.Forms;
using System.Windows.Media.Media3D;

namespace Viewer3DWinForms;

public partial class ThreeDViewerForm
{
    private enum MainLightKind
    {
        HelixSun = 0,
        Directional = 1,
        Point = 2
    }

    private enum AuxLightKind
    {
        None = 0,
        Directional = 1,
        Point = 2
    }

    private ComboBox _comboMainKind = null!;
    private ComboBox _comboFillKind = null!;
    private Label _lblMainKindCap = null!;
    private Label _lblFillKindCap = null!;

    private Label _lblMainDirAzCap = null!;
    private TrackBar _trackMainDirAz = null!;
    private Label _lblMainDirAzVal = null!;
    private Label _lblMainDirElCap = null!;
    private TrackBar _trackMainDirEl = null!;
    private Label _lblMainDirElVal = null!;

    private Label _lblMainPxCap = null!;
    private TrackBar _trackMainPx = null!;
    private Label _lblMainPxVal = null!;
    private Label _lblMainPyCap = null!;
    private TrackBar _trackMainPy = null!;
    private Label _lblMainPyVal = null!;
    private Label _lblMainPzCap = null!;
    private TrackBar _trackMainPz = null!;
    private Label _lblMainPzVal = null!;

    private Label _lblFillDirAzCap = null!;
    private TrackBar _trackFillDirAz = null!;
    private Label _lblFillDirAzVal = null!;
    private Label _lblFillDirElCap = null!;
    private TrackBar _trackFillDirEl = null!;
    private Label _lblFillDirElVal = null!;

    private Label _lblFillPxCap = null!;
    private TrackBar _trackFillPx = null!;
    private Label _lblFillPxVal = null!;
    private Label _lblFillPyCap = null!;
    private TrackBar _trackFillPy = null!;
    private Label _lblFillPyVal = null!;
    private Label _lblFillPzCap = null!;
    private TrackBar _trackFillPz = null!;
    private Label _lblFillPzVal = null!;
    private Label _lblFillRangeCap = null!;
    private TrackBar _trackFillRange = null!;
    private Label _lblFillRangeVal = null!;

    private void InitializeAdvancedLightingUi()
    {
        lblLightTitle.Text = "조명 (주·보조 광원 / 환경광)";

        _lblMainKindCap = LightingLabel("주광원", 0, 0);
        _comboMainKind = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Location = new Point(0, 0),
            Size = new Size(188, 22),
            Font = new Font("Segoe UI", 8f)
        };
        _comboMainKind.Items.AddRange(new object[] { "Helix 태양", "방향광", "점광" });
        _comboMainKind.SelectedIndex = 0;

        _lblFillKindCap = LightingLabel("보조광", 0, 0);
        _comboFillKind = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Location = new Point(0, 0),
            Size = new Size(188, 22),
            Font = new Font("Segoe UI", 8f)
        };
        _comboFillKind.Items.AddRange(new object[] { "없음", "방향광", "점광" });
        _comboFillKind.SelectedIndex = 1;

        _lblMainDirAzCap = LightingLabel("주 방위", 4, 0);
        _trackMainDirAz = LightingTrack(46, 0, 0, 359, 38);
        _lblMainDirAzVal = LightingValueLabel(212, 0);
        _lblMainDirElCap = LightingLabel("주 고도", 4, 0);
        _trackMainDirEl = LightingTrack(46, 0, -89, 89, 52);
        _lblMainDirElVal = LightingValueLabel(212, 0);

        _lblMainPxCap = LightingLabel("주 X", 4, 0);
        _trackMainPx = LightingTrack(46, 0, 0, 6000, 4200);
        _lblMainPxVal = LightingValueLabel(212, 0);
        _lblMainPyCap = LightingLabel("주 Y", 4, 0);
        _trackMainPy = LightingTrack(46, 0, 0, 6000, 3900);
        _lblMainPyVal = LightingValueLabel(212, 0);
        _lblMainPzCap = LightingLabel("주 Z", 4, 0);
        _trackMainPz = LightingTrack(46, 0, 0, 6000, 3600);
        _lblMainPzVal = LightingValueLabel(212, 0);

        _lblFillDirAzCap = LightingLabel("보 방위", 4, 0);
        _trackFillDirAz = LightingTrack(46, 0, 0, 359, 310);
        _lblFillDirAzVal = LightingValueLabel(212, 0);
        _lblFillDirElCap = LightingLabel("보 고도", 4, 0);
        _trackFillDirEl = LightingTrack(46, 0, -89, 89, 12);
        _lblFillDirElVal = LightingValueLabel(212, 0);

        _lblFillPxCap = LightingLabel("보 X", 4, 0);
        _trackFillPx = LightingTrack(46, 0, 0, 6000, 2400);
        _lblFillPxVal = LightingValueLabel(212, 0);
        _lblFillPyCap = LightingLabel("보 Y", 4, 0);
        _trackFillPy = LightingTrack(46, 0, 0, 6000, 3400);
        _lblFillPyVal = LightingValueLabel(212, 0);
        _lblFillPzCap = LightingLabel("보 Z", 4, 0);
        _trackFillPz = LightingTrack(46, 0, 0, 6000, 2600);
        _lblFillPzVal = LightingValueLabel(212, 0);
        _lblFillRangeCap = LightingLabel("보 거리", 4, 0);
        _trackFillRange = LightingTrack(46, 0, 100, 8000, 2000);
        _lblFillRangeVal = LightingValueLabel(212, 0);

        panelLighting.SuspendLayout();
        panelLighting.AutoScroll = false;
        panelLighting.Controls.Add(_lblMainKindCap);
        panelLighting.Controls.Add(_comboMainKind);
        panelLighting.Controls.Add(_lblFillKindCap);
        panelLighting.Controls.Add(_comboFillKind);
        foreach (var c in new Control[]
                 {
                     _lblMainDirAzCap, _trackMainDirAz, _lblMainDirAzVal,
                     _lblMainDirElCap, _trackMainDirEl, _lblMainDirElVal,
                     _lblMainPxCap, _trackMainPx, _lblMainPxVal,
                     _lblMainPyCap, _trackMainPy, _lblMainPyVal,
                     _lblMainPzCap, _trackMainPz, _lblMainPzVal,
                     _lblFillDirAzCap, _trackFillDirAz, _lblFillDirAzVal,
                     _lblFillDirElCap, _trackFillDirEl, _lblFillDirElVal,
                     _lblFillPxCap, _trackFillPx, _lblFillPxVal,
                     _lblFillPyCap, _trackFillPy, _lblFillPyVal,
                     _lblFillPzCap, _trackFillPz, _lblFillPzVal,
                     _lblFillRangeCap, _trackFillRange, _lblFillRangeVal
                 })
            panelLighting.Controls.Add(c);

        void wireTrack(TrackBar tb) => tb.ValueChanged += (_, _) => ApplyLightParametersFromTracks();

        wireTrack(_trackMainDirAz);
        wireTrack(_trackMainDirEl);
        wireTrack(_trackMainPx);
        wireTrack(_trackMainPy);
        wireTrack(_trackMainPz);
        wireTrack(_trackFillDirAz);
        wireTrack(_trackFillDirEl);
        wireTrack(_trackFillPx);
        wireTrack(_trackFillPy);
        wireTrack(_trackFillPz);
        wireTrack(_trackFillRange);

        trackSunAltitude.ValueChanged += (_, _) => ApplyLightParametersFromTracks();
        trackSunAzimuth.ValueChanged += (_, _) => ApplyLightParametersFromTracks();
        trackFillBright.ValueChanged += (_, _) => ApplyLightParametersFromTracks();

        _comboMainKind.SelectedIndexChanged += (_, _) =>
        {
            SyncLightingControlVisibility();
            RebuildViewportLights();
            ApplyLightParametersFromTracks();
        };
        _comboFillKind.SelectedIndexChanged += (_, _) =>
        {
            SyncLightingControlVisibility();
            RebuildViewportLights();
            ApplyLightParametersFromTracks();
        };

        SyncLightingControlVisibility();
        RebuildViewportLights();
        ApplyLightParametersFromTracks();
        panelLighting.ResumeLayout();
    }

    private static Label LightingLabel(string text, int x, int y)
    {
        return new Label
        {
            AutoSize = false,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 8f),
            Location = new Point(x, y),
            Size = new Size(42, 14),
            Text = text
        };
    }

    private const int LightingTrackBarHeight = 22;

    private static TrackBar LightingTrack(int x, int y, int min, int max, int value)
    {
        var tb = new TrackBar
        {
            AutoSize = false,
            Location = new Point(x, y),
            Size = new Size(162, LightingTrackBarHeight),
            TickStyle = TickStyle.None,
            Minimum = min,
            Maximum = max,
            SmallChange = 1,
            LargeChange = Math.Max(1, (max - min) / 10)
        };
        tb.Value = Math.Clamp(value, min, max);
        return tb;
    }

    private static Label LightingValueLabel(int x, int y)
    {
        return new Label
        {
            AutoSize = false,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 8f),
            Location = new Point(x, y),
            Size = new Size(30, 14),
            TextAlign = ContentAlignment.MiddleRight,
            Text = "0"
        };
    }

    private MainLightKind GetMainKind() => (MainLightKind)_comboMainKind.SelectedIndex;

    private AuxLightKind GetFillKind() => (AuxLightKind)_comboFillKind.SelectedIndex;

    private void SyncLightingControlVisibility()
    {
        var main = GetMainKind();
        var fill = GetFillKind();

        var sunMain = main == MainLightKind.HelixSun;
        var dirMain = main == MainLightKind.Directional;
        var ptMain = main == MainLightKind.Point;

        lblSunAltitudeCap.Visible = sunMain;
        trackSunAltitude.Visible = sunMain;
        lblSunAltitudeVal.Visible = sunMain;
        lblSunAzimuthCap.Visible = sunMain;
        trackSunAzimuth.Visible = sunMain;
        lblSunAzimuthVal.Visible = sunMain;

        _lblMainDirAzCap.Visible = dirMain;
        _trackMainDirAz.Visible = dirMain;
        _lblMainDirAzVal.Visible = dirMain;
        _lblMainDirElCap.Visible = dirMain;
        _trackMainDirEl.Visible = dirMain;
        _lblMainDirElVal.Visible = dirMain;

        _lblMainPxCap.Visible = ptMain;
        _trackMainPx.Visible = ptMain;
        _lblMainPxVal.Visible = ptMain;
        _lblMainPyCap.Visible = ptMain;
        _trackMainPy.Visible = ptMain;
        _lblMainPyVal.Visible = ptMain;
        _lblMainPzCap.Visible = ptMain;
        _trackMainPz.Visible = ptMain;
        _lblMainPzVal.Visible = ptMain;

        var fillDir = fill == AuxLightKind.Directional;
        var fillPt = fill == AuxLightKind.Point;
        var fillAny = fill != AuxLightKind.None;

        lblFillBrightCap.Visible = fillAny;
        trackFillBright.Visible = fillAny;
        lblFillBrightVal.Visible = fillAny;

        _lblFillDirAzCap.Visible = fillDir;
        _trackFillDirAz.Visible = fillDir;
        _lblFillDirAzVal.Visible = fillDir;
        _lblFillDirElCap.Visible = fillDir;
        _trackFillDirEl.Visible = fillDir;
        _lblFillDirElVal.Visible = fillDir;

        _lblFillPxCap.Visible = fillPt;
        _trackFillPx.Visible = fillPt;
        _lblFillPxVal.Visible = fillPt;
        _lblFillPyCap.Visible = fillPt;
        _trackFillPy.Visible = fillPt;
        _lblFillPyVal.Visible = fillPt;
        _lblFillPzCap.Visible = fillPt;
        _trackFillPz.Visible = fillPt;
        _lblFillPzVal.Visible = fillPt;
        _lblFillRangeCap.Visible = fillPt;
        _trackFillRange.Visible = fillPt;
        _lblFillRangeVal.Visible = fillPt;

        LayoutLightingPanelPositions();
    }

    private void LayoutLightingPanelPositions()
    {
        const int labelLeft = 4;
        const int trackLeft = 46;
        const int valLeft = 212;
        const int row = LightingTrackBarHeight;
        const int gapSm = 3;
        const int gapMd = 5;
        var main = GetMainKind();
        var fill = GetFillKind();

        lblLightTitle.SetBounds(6, 2, 236, 14, BoundsSpecified.All);
        _lblMainKindCap.SetBounds(labelLeft, 19, 40, 14, BoundsSpecified.All);
        _comboMainKind.SetBounds(trackLeft, 16, 188, 22, BoundsSpecified.All);
        _lblFillKindCap.SetBounds(labelLeft, 42, 40, 14, BoundsSpecified.All);
        _comboFillKind.SetBounds(trackLeft, 39, 188, 22, BoundsSpecified.All);

        int y = 64;
        void placeRow(Label cap, TrackBar tb, Label val, int rowY)
        {
            tb.Size = new Size(162, row);
            cap.Location = new Point(labelLeft, rowY + 4);
            tb.Location = new Point(trackLeft, rowY);
            val.Location = new Point(valLeft, rowY + 4);
        }

        if (main == MainLightKind.HelixSun)
        {
            placeRow(lblSunAltitudeCap, trackSunAltitude, lblSunAltitudeVal, y);
            placeRow(lblSunAzimuthCap, trackSunAzimuth, lblSunAzimuthVal, y + row);
            y += row * 2 + gapSm;
        }
        else if (main == MainLightKind.Directional)
        {
            placeRow(_lblMainDirAzCap, _trackMainDirAz, _lblMainDirAzVal, y);
            placeRow(_lblMainDirElCap, _trackMainDirEl, _lblMainDirElVal, y + row);
            y += row * 2 + gapSm;
        }
        else
        {
            placeRow(_lblMainPxCap, _trackMainPx, _lblMainPxVal, y);
            placeRow(_lblMainPyCap, _trackMainPy, _lblMainPyVal, y + row);
            placeRow(_lblMainPzCap, _trackMainPz, _lblMainPzVal, y + row * 2);
            y += row * 3 + gapSm;
        }

        if (fill == AuxLightKind.Directional)
        {
            placeRow(_lblFillDirAzCap, _trackFillDirAz, _lblFillDirAzVal, y);
            placeRow(_lblFillDirElCap, _trackFillDirEl, _lblFillDirElVal, y + row);
            y += row * 2 + gapSm;
        }
        else if (fill == AuxLightKind.Point)
        {
            placeRow(_lblFillPxCap, _trackFillPx, _lblFillPxVal, y);
            placeRow(_lblFillPyCap, _trackFillPy, _lblFillPyVal, y + row);
            placeRow(_lblFillPzCap, _trackFillPz, _lblFillPzVal, y + row * 2);
            placeRow(_lblFillRangeCap, _trackFillRange, _lblFillRangeVal, y + row * 3);
            y += row * 4 + gapSm;
        }

        if (fill != AuxLightKind.None)
        {
            placeRow(lblFillBrightCap, trackFillBright, lblFillBrightVal, y);
            y += row + gapSm;
        }

        placeRow(lblAmbientCap, trackAmbient, lblAmbientVal, y);
        y += row + gapMd;
        placeRow(lblEmissiveCap, trackEmissive, lblEmissiveVal, y);
        y += row + gapMd;

        panelLighting.AutoScrollMinSize = new Size(0, 0);
        panelLighting.Height = y + 6;
        panelViews.Top = panelLighting.Bottom + 6;
    }

    private void RebuildViewportLights()
    {
        _viewport.Children.Clear();

        switch (GetMainKind())
        {
            case MainLightKind.HelixSun:
                _viewport.Children.Add(_sunLight);
                break;
            case MainLightKind.Directional:
                _viewport.Children.Add(_mainDirHost);
                break;
            case MainLightKind.Point:
                _viewport.Children.Add(_mainPointHost);
                break;
        }

        switch (GetFillKind())
        {
            case AuxLightKind.Directional:
                _viewport.Children.Add(_fillDirHost);
                break;
            case AuxLightKind.Point:
                _viewport.Children.Add(_fillPointHost);
                break;
        }

        _viewport.Children.Add(_ambientVisual);
        _viewport.Children.Add(_modelRoot);
    }

    private static Vector3D LightTravelDirectionFromAzimuthElevation(double azimuthDeg, double elevationDeg)
    {
        var az = azimuthDeg * (Math.PI / 180.0);
        var el = elevationDeg * (Math.PI / 180.0);
        var x = Math.Cos(el) * Math.Cos(az);
        var y = Math.Sin(el);
        var z = Math.Cos(el) * Math.Sin(az);
        var fromEmission = new Vector3D(x, y, z);
        fromEmission.Normalize();
        return -fromEmission;
    }

    private void ApplySunLightFromTracks()
    {
        _sunLight.Altitude = trackSunAltitude.Value;
        _sunLight.Azimuth = trackSunAzimuth.Value;
        lblSunAltitudeVal.Text = trackSunAltitude.Value.ToString();
        lblSunAzimuthVal.Text = trackSunAzimuth.Value.ToString();
    }

    private void ApplyLightParametersFromTracks()
    {
        if (GetMainKind() == MainLightKind.HelixSun)
            ApplySunLightFromTracks();

        if (GetMainKind() == MainLightKind.Directional)
        {
            _mainDirectional.Direction = LightTravelDirectionFromAzimuthElevation(
                _trackMainDirAz.Value,
                _trackMainDirEl.Value);
            _lblMainDirAzVal.Text = _trackMainDirAz.Value.ToString();
            _lblMainDirElVal.Text = _trackMainDirEl.Value.ToString();
        }

        if (GetMainKind() == MainLightKind.Point)
        {
            _mainPoint.Position = new Point3D(
                _trackMainPx.Value - 3000,
                _trackMainPy.Value - 3000,
                _trackMainPz.Value - 3000);
            _lblMainPxVal.Text = (_trackMainPx.Value - 3000).ToString();
            _lblMainPyVal.Text = (_trackMainPy.Value - 3000).ToString();
            _lblMainPzVal.Text = (_trackMainPz.Value - 3000).ToString();
        }

        var fillRgb = FillScaledRgb();

        if (GetFillKind() == AuxLightKind.Directional)
        {
            _fillDirectional.Direction = LightTravelDirectionFromAzimuthElevation(
                _trackFillDirAz.Value,
                _trackFillDirEl.Value);
            _fillDirectional.Color = fillRgb;
            _lblFillDirAzVal.Text = _trackFillDirAz.Value.ToString();
            _lblFillDirElVal.Text = _trackFillDirEl.Value.ToString();
        }

        if (GetFillKind() == AuxLightKind.Point)
        {
            _fillPoint.Position = new Point3D(
                _trackFillPx.Value - 3000,
                _trackFillPy.Value - 3000,
                _trackFillPz.Value - 3000);
            _fillPoint.Range = _trackFillRange.Value;
            _fillPoint.Color = fillRgb;
            _lblFillPxVal.Text = (_trackFillPx.Value - 3000).ToString();
            _lblFillPyVal.Text = (_trackFillPy.Value - 3000).ToString();
            _lblFillPzVal.Text = (_trackFillPz.Value - 3000).ToString();
            _lblFillRangeVal.Text = _trackFillRange.Value.ToString();
        }

        lblFillBrightVal.Text = trackFillBright.Value.ToString();
    }

    private System.Windows.Media.Color FillScaledRgb()
    {
        var t = trackFillBright.Value / 100.0;
        var r = (byte)Math.Clamp((int)Math.Round(FillLightBaseR * t), 0, 255);
        var g = (byte)Math.Clamp((int)Math.Round(FillLightBaseG * t), 0, 255);
        var b = (byte)Math.Clamp((int)Math.Round(FillLightBaseB * t), 0, 255);
        return System.Windows.Media.Color.FromRgb(r, g, b);
    }
}
