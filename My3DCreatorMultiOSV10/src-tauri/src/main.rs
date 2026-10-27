use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::WindowBuilder,
};
use wry::{
    http::{header::CONTENT_TYPE, Response},
    WebViewBuilder,
};

static HTML_DATA: &[u8] = include_bytes!("../../dist/index.html");
static JS_DATA: &[u8] = include_bytes!("../../dist/assets/app.js");
static CSS_DATA: &[u8] = include_bytes!("../../dist/assets/app.css");

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("====================================================");
    println!("       Omni3D Studio Native GUI Application        ");
    println!("====================================================");

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("Omni3D Studio - Universal 3D Creator")
        .with_inner_size(LogicalSize::new(1400.0, 900.0))
        .with_min_inner_size(LogicalSize::new(900.0, 600.0))
        .build(&event_loop)?;

    println!("[*] Registering in-memory custom protocol (omni://localhost)...");

    let builder = WebViewBuilder::new()
        .with_devtools(true)
        .with_custom_protocol("omni".into(), move |_webview_id, request| {
            let path = request.uri().path();
            let (content_type, body) = if path.ends_with(".js") {
                ("application/javascript; charset=utf-8", JS_DATA)
            } else if path.ends_with(".css") {
                ("text/css; charset=utf-8", CSS_DATA)
            } else {
                ("text/html; charset=utf-8", HTML_DATA)
            };

            Response::builder()
                .header(CONTENT_TYPE, content_type)
                .header("Access-Control-Allow-Origin", "*")
                .status(200)
                .body(body.to_vec())
                .unwrap()
                .map(Into::into)
        })
        .with_url("omni://localhost");

    let _webview = builder.build(&window)?;

    println!("[✓] Omni3D Studio GUI Desktop Window launched successfully.");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        let _ = &_webview; // Keep WebView alive across the event loop!

        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            println!("[*] Omni3D Studio Window closed.");
            *control_flow = ControlFlow::Exit;
        }
    });
}
