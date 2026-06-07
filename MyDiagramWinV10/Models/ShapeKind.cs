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

    // ── Basic shape extensions ────────────────────────────────────────────
    Octagon,                // 팔각형
    RightTriangle,          // 직각삼각형
    Star4,                  // 4점별
    Star6,                  // 6점별
    Donut,                  // 링/도넛

    // ── Flowchart additional shapes ───────────────────────────────────────
    FlowPredefinedProcess,  // 내장 프로세스 (rect + inner side lines)
    FlowManualOperation,    // 수동 조작 (inverted trapezoid)
    FlowSummingJunction,    // 합산 교차점 (circle + X)
    FlowOr,                 // 논리합 (circle + +)
    FlowMerge,              // 병합 (inverted triangle)
    FlowCollate,            // 조합 (bowtie / hourglass)
    FlowSort,               // 정렬 (diamond + horizontal divider)
    FlowDisplay,            // 표시기 (hexagonal display)
    FlowPreparation,        // 준비 (wide hexagon / shield)
    FlowAnnotation,         // 주석 (open bracket)

    // ── Arrow shapes ──────────────────────────────────────────────────────
    ArrowLeft,              // 왼쪽 화살표
    ArrowUp,                // 위쪽 화살표
    ArrowDown,              // 아래쪽 화살표
    ArrowUpDown,            // 상하 양방향 화살표
    ArrowQuad,              // 사방향 화살표
    ArrowBent,              // 꺾인 화살표
    ArrowStriped,           // 줄무늬 화살표

    // ── Callout / speech bubble ───────────────────────────────────────────
    CalloutRound,           // 둥근 말풍선
    Explosion,              // 폭발 / 별모양

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
    Shape3DCube,             // isometric cube (equal sides)
    Shape3DBox,              // isometric rectangular prism
    Shape3DSphere,           // shaded sphere
    Shape3DPyramid,          // square pyramid
    Shape3DCone,             // cone
    Shape3DCylinder,         // isometric cylinder
    Shape3DTriangularPrism,  // triangular prism (삼각기둥)
    Shape3DCapsule,          // capsule / stadium with dome caps (캡슐)
    Shape3DGem,              // cut gem / diamond facets (보석)
    Shape3DTorus,            // donut / torus (토러스)
}
