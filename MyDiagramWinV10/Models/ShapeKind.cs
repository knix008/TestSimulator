namespace MyDiagramWinV10.Models;

public enum ShapeKind
{
    Rectangle,
    RoundedRectangle,
    Ellipse,
    Diamond,
    Triangle,
    Parallelogram,
    Hexagon,
    Pentagon,
    Star,
    Cross,
    Cylinder,
    Cloud,
    Document,
    Database,
    Arrow,
    Trapezoid,
    Chevron,
    CallOut,           // speech bubble with tail
    Note,              // rectangle with folded corner
    OffPageConnector,  // right-pointing pentagon (flowchart off-page)
    DoubleArrow,       // two-headed arrow
    ManualInput,       // slanted-top trapezoid (flowchart manual input)
    Delay,             // D-shape (rect + right semicircle)

    // ── Network diagram shapes ────────────────────────────────────────────
    NetworkServer,     // rack server (rectangle with horizontal stripes)
    NetworkRouter,     // router (circle with 4-directional arrows)
    NetworkSwitch,     // switch (rectangle with port dots)
    NetworkPC,         // workstation / PC (monitor + base)
    NetworkFirewall,   // firewall (rectangle with hatching)
    NetworkHub,        // hub / concentrator (circle with radiating lines)
    NetworkPrinter,    // printer (box with paper slot)
    NetworkWifi,       // wireless AP (arc + dot)

    // ── Extended network shapes ───────────────────────────────────────────
    NetworkInternet,   // internet/globe (circle with cross + longitude oval)
    NetworkStorage,    // disk array / NAS (stacked rectangles)
    NetworkLaptop,     // laptop (screen + keyboard base)
    NetworkMobile,     // smartphone (rounded rect + screen + button)
    NetworkIPPhone,    // IP telephone (handset + keypad)
    NetworkRack,       // server rack cabinet (tall rect with equipment slots)
    NetworkTablet,     // tablet device (wide rect + screen)
    NetworkGateway,    // gateway / VPN device (box with bidirectional arrows)

    // ── 3D diagram shapes (isometric / pseudo-3D) ─────────────────────────
    Shape3DCube,       // isometric cube
    Shape3DBox,        // isometric rectangular prism
    Shape3DSphere,     // shaded sphere
    Shape3DPyramid,    // square pyramid
    Shape3DCone,       // cone
    Shape3DCylinder,   // isometric cylinder
}
