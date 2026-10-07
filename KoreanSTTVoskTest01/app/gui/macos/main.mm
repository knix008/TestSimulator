// app/gui/macos/main.mm
//
// macOS 네이티브 GUI (Cocoa, Objective-C++). GTK 판·Win32 판과 기능은 같고, 역시
// 음성 인식 로직은 한 줄도 없다 — kstt::SttEngine 의 공개 API 만 부르고, 워커
// 스레드에서 오는 콜백을 dispatch_async(main queue) 로 UI 스레드에 넘긴다.
//
// 이 파일은 macOS 에서만 컴파일된다 (CMake 가 플랫폼을 보고 고른다).
#import <Cocoa/Cocoa.h>

#include <cmath>
#include <memory>
#include <string>
#include <vector>

#include "kstt/platform/audio_input.h"
#include "kstt/stt_engine.h"
#include "kstt/wav_file.h"

namespace {

NSString* toNS(const std::string& utf8) {
    return [NSString stringWithUTF8String:utf8.c_str()];
}

std::string toStd(NSString* text) {
    return text ? std::string([text UTF8String]) : std::string();
}

std::string baseName(const std::string& path) {
    const size_t cut = path.find_last_of("/\\");
    return cut == std::string::npos ? path : path.substr(cut + 1);
}

}  // namespace

// ---------------------------------------------------------------------------

@interface KsttWindowController : NSObject <NSWindowDelegate>
@end

@implementation KsttWindowController {
    NSWindow* _window;
    NSTextField* _modelField;
    NSPopUpButton* _devicePopup;
    NSButton* _startButton;
    NSButton* _stopButton;
    NSButton* _wavButton;
    NSButton* _partialCheck;
    NSButton* _loadButton;
    NSButton* _browseButton;
    NSLevelIndicator* _levelIndicator;
    NSTextField* _statusLabel;
    NSTextField* _partialLabel;
    NSTextView* _transcriptView;
    NSProgressIndicator* _spinner;

    kstt::SttEngine _engine;
    std::vector<kstt::AudioDevice> _devices;
    BOOL _loading;
    BOOL _smokeStarted;
}

- (instancetype)init {
    self = [super init];
    if (!self) return nil;
    _loading = NO;
    _smokeStarted = NO;
    [self buildWindow];
    [self wireEngine];
    [self refreshDevices];

    const std::string found = kstt::SttEngine::findDefaultModel();
    if (!found.empty()) _modelField.stringValue = toNS(found);
    [self syncButtons];
    [self loadModelAsync];
    return self;
}

// ------------------------------------------------------------------ 창 만들기

- (void)buildWindow {
    const NSRect frame = NSMakeRect(0, 0, 760, 620);
    _window = [[NSWindow alloc]
        initWithContentRect:frame
                  styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                             NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                    backing:NSBackingStoreBuffered
                      defer:NO];
    _window.title = @"한국어 음성 인식 (Vosk)";
    _window.delegate = self;
    _window.minSize = NSMakeSize(640, 460);
    [_window center];

    NSView* content = _window.contentView;
    const auto label = [](NSString* text) {
        NSTextField* field = [NSTextField labelWithString:text];
        field.translatesAutoresizingMaskIntoConstraints = NO;
        return field;
    };
    const auto button = [self](NSString* title, SEL action) {
        NSButton* b = [NSButton buttonWithTitle:title target:self action:action];
        b.translatesAutoresizingMaskIntoConstraints = NO;
        return b;
    };

    // 1행: 모델
    NSTextField* modelLabel = label(@"모델");
    _modelField = [NSTextField textFieldWithString:@""];
    _modelField.placeholderString = @"Vosk 한국어 모델 디렉터리";
    _modelField.translatesAutoresizingMaskIntoConstraints = NO;
    _browseButton = button(@"찾아보기…", @selector(chooseModelFolder:));
    _loadButton = button(@"모델 적재", @selector(loadModelClicked:));

    // 2행: 입력 장치
    NSTextField* deviceLabel = label(@"입력");
    _devicePopup = [[NSPopUpButton alloc] initWithFrame:NSZeroRect pullsDown:NO];
    _devicePopup.translatesAutoresizingMaskIntoConstraints = NO;
    NSButton* refreshButton = button(@"새로 고침", @selector(refreshDevicesClicked:));

    // 3행: 조작
    _startButton = button(@"● 인식 시작", @selector(startMicrophone:));
    _startButton.keyEquivalent = @"\r";
    _stopButton = button(@"■ 중지", @selector(stopRecognition:));
    _wavButton = button(@"WAV 파일 인식…", @selector(chooseWavFile:));

    // 진행 중 추측을 보여 줄지. 끄면 확정된 문장만 쌓인다.
    _partialCheck = [NSButton checkboxWithTitle:@"진행 중 표시"
                                         target:self
                                         action:@selector(partialToggled:)];
    _partialCheck.state = NSControlStateValueOn;
    _partialCheck.translatesAutoresizingMaskIntoConstraints = NO;

    NSTextField* levelLabel = label(@"입력 레벨");
    _levelIndicator = [[NSLevelIndicator alloc] initWithFrame:NSZeroRect];
    _levelIndicator.levelIndicatorStyle = NSLevelIndicatorStyleContinuousCapacity;
    _levelIndicator.minValue = 0.0;
    _levelIndicator.maxValue = 1.0;
    _levelIndicator.translatesAutoresizingMaskIntoConstraints = NO;

    _spinner = [[NSProgressIndicator alloc] initWithFrame:NSZeroRect];
    _spinner.style = NSProgressIndicatorStyleSpinning;
    _spinner.controlSize = NSControlSizeSmall;
    _spinner.displayedWhenStopped = NO;
    _spinner.translatesAutoresizingMaskIntoConstraints = NO;

    // 4행: 상태
    _statusLabel = label(@"준비 중…");
    _statusLabel.textColor = NSColor.secondaryLabelColor;
    _statusLabel.lineBreakMode = NSLineBreakByTruncatingMiddle;

    // 5행: 결과
    NSTextField* transcriptLabel = label(@"인식 결과");
    transcriptLabel.font = [NSFont boldSystemFontOfSize:NSFont.systemFontSize];
    NSButton* clearButton = button(@"지우기", @selector(clearTranscript:));
    NSButton* saveButton = button(@"저장…", @selector(saveTranscript:));

    NSScrollView* scroller = [[NSScrollView alloc] initWithFrame:NSZeroRect];
    scroller.hasVerticalScroller = YES;
    scroller.borderType = NSBezelBorder;
    scroller.translatesAutoresizingMaskIntoConstraints = NO;
    _transcriptView = [[NSTextView alloc] initWithFrame:NSZeroRect];
    _transcriptView.editable = NO;
    _transcriptView.richText = NO;
    _transcriptView.font = [NSFont systemFontOfSize:NSFont.systemFontSize + 1];
    _transcriptView.textContainerInset = NSMakeSize(6, 6);
    _transcriptView.autoresizingMask = NSViewWidthSizable;
    scroller.documentView = _transcriptView;

    // 6행: 진행 중
    _partialLabel = label(@"");
    _partialLabel.textColor = NSColor.tertiaryLabelColor;
    _partialLabel.lineBreakMode = NSLineBreakByTruncatingHead;

    NSArray* views = @[
        modelLabel, _modelField, _browseButton, _loadButton, deviceLabel, _devicePopup,
        refreshButton, _startButton, _stopButton, _wavButton, _partialCheck, levelLabel,
        _levelIndicator, _spinner, _statusLabel, transcriptLabel, clearButton, saveButton,
        scroller, _partialLabel
    ];
    for (NSView* view in views) [content addSubview:view];

    // 자동 배치 (세로로 쌓고, 가로로 늘어나는 것은 늘린다)
    NSDictionary* v = NSDictionaryOfVariableBindings(
        modelLabel, _modelField, _browseButton, _loadButton, deviceLabel, _devicePopup,
        refreshButton, _startButton, _stopButton, _wavButton, _partialCheck, levelLabel,
        _levelIndicator, _spinner, _statusLabel, transcriptLabel, clearButton, saveButton,
        scroller, _partialLabel);

    const auto addConstraints = [&](NSString* format) {
        [content addConstraints:[NSLayoutConstraint
                                    constraintsWithVisualFormat:format
                                                        options:NSLayoutFormatAlignAllCenterY
                                                        metrics:nil
                                                          views:v]];
    };

    addConstraints(@"H:|-16-[modelLabel(40)]-8-[_modelField]-8-[_browseButton(100)]"
                   @"-8-[_loadButton(90)]-16-|");
    addConstraints(@"H:|-16-[deviceLabel(40)]-8-[_devicePopup]-8-[refreshButton(100)]-16-|");
    addConstraints(@"H:|-16-[_startButton(110)]-8-[_stopButton(80)]-8-[_wavButton(150)]"
                   @"-12-[_partialCheck]-16-[levelLabel]-8-[_levelIndicator]"
                   @"-8-[_spinner(16)]-16-|");

    [content addConstraints:[NSLayoutConstraint
                                constraintsWithVisualFormat:@"H:|-16-[_statusLabel]-16-|"
                                                    options:0
                                                    metrics:nil
                                                      views:v]];
    [content addConstraints:[NSLayoutConstraint
                                constraintsWithVisualFormat:
                                    @"H:|-16-[transcriptLabel]-(>=8)-[clearButton(80)]"
                                     "-8-[saveButton(80)]-16-|"
                                                    options:NSLayoutFormatAlignAllCenterY
                                                    metrics:nil
                                                      views:v]];
    [content addConstraints:[NSLayoutConstraint
                                constraintsWithVisualFormat:@"H:|-16-[scroller]-16-|"
                                                    options:0
                                                    metrics:nil
                                                      views:v]];
    [content addConstraints:[NSLayoutConstraint
                                constraintsWithVisualFormat:@"H:|-16-[_partialLabel]-16-|"
                                                    options:0
                                                    metrics:nil
                                                      views:v]];
    [content addConstraints:[NSLayoutConstraint
                                constraintsWithVisualFormat:
                                    @"V:|-16-[_modelField]-10-[_devicePopup]-14-[_startButton]"
                                     "-12-[_statusLabel]-14-[transcriptLabel]-6-[scroller]"
                                     "-8-[_partialLabel]-16-|"
                                                    options:0
                                                    metrics:nil
                                                      views:v]];
}

// ------------------------------------------------------------------ 엔진 연결

- (void)wireEngine {
    // 콜백은 워커 스레드에서 온다 → 주 큐로 넘겨야 UI 를 만질 수 있다.
    __weak KsttWindowController* weakSelf = self;

    _engine.onPartial([weakSelf](const std::string& text) {
        NSString* copy = toNS(text);
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf setPartial:copy];
        });
    });

    _engine.onFinal([weakSelf](const kstt::Transcript& result) {
        if (result.text.empty()) return;
        NSString* copy = toNS(result.text);
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf appendTranscript:copy];
        });
    });

    _engine.onLevel([weakSelf](float rms) {
        // RMS 는 작은 값에 몰려 있어 보기 좋게 눌러 펴 준다.
        const double shaped = std::min(1.0, std::sqrt(static_cast<double>(rms)) * 1.6);
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf setLevel:shaped];
        });
    });

    _engine.onState([weakSelf](kstt::EngineState state, const std::string& message) {
        NSString* copy = toNS(message);
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf engineStateChanged:static_cast<int>(state) message:copy];
        });
    });
}

- (void)engineStateChanged:(int)rawState message:(NSString*)message {
    switch (static_cast<kstt::EngineState>(rawState)) {
        case kstt::EngineState::Running:
            [self setStatus:[@"인식 중 — " stringByAppendingString:message] isError:NO];
            break;
        case kstt::EngineState::Ready:
            [self setStatus:([message isEqualToString:@"finished"] ? @"인식이 끝났습니다."
                                                                   : @"대기 중 (모델 준비됨)")
                    isError:NO];
            [self setLevel:0.0];
            [self setPartial:@""];
            break;
        case kstt::EngineState::Error:
            [self setStatus:message isError:YES];
            [self setLevel:0.0];
            break;
        default:
            break;
    }
    [self syncButtons];
}

// ------------------------------------------------------------------ 동작

- (void)loadModelAsync {
    if (_loading || _engine.isRunning()) return;

    kstt::EngineConfig config;
    config.modelPath = toStd(_modelField.stringValue);

    _loading = YES;
    [_spinner startAnimation:nil];
    [self setStatus:@"모델을 적재합니다… (수 초 걸릴 수 있습니다)" isError:NO];
    [self syncButtons];

    __weak KsttWindowController* weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        KsttWindowController* strongSelf = weakSelf;
        if (!strongSelf) return;

        std::string err;
        const bool ok = strongSelf->_engine.loadModel(config, &err);
        NSString* modelPath = toNS(strongSelf->_engine.config().modelPath);
        NSString* message =
            ok ? toNS("준비됨 · 모델 " + baseName(strongSelf->_engine.config().modelPath) + " · " +
                      baseName(strongSelf->_engine.voskLibraryPath()))
               : toNS(err);

        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf modelLoadFinished:ok path:modelPath message:message];
        });
    });
}

- (void)modelLoadFinished:(BOOL)ok path:(NSString*)path message:(NSString*)message {
    _loading = NO;
    [_spinner stopAnimation:nil];
    if (ok) {
        _modelField.stringValue = path;
        [self setStatus:message isError:NO];
        [self maybeRunSmokeFile];
    } else {
        [self setStatus:message isError:YES];
    }
    [self syncButtons];
}

- (void)startMicrophone:(id)sender {
    if (!_engine.isModelLoaded()) {
        [self setStatus:@"먼저 모델을 적재하세요." isError:YES];
        return;
    }
    const NSInteger selected = _devicePopup.indexOfSelectedItem;
    int deviceId = -1;
    if (selected >= 0 && static_cast<size_t>(selected) < _devices.size())
        deviceId = _devices[static_cast<size_t>(selected)].id;

    std::string err;
    if (!_engine.start(kstt::platform::createMicrophone(deviceId), &err)) {
        [self setStatus:toNS(err) isError:YES];
        [self showAlert:@"마이크를 열 수 없습니다." detail:toNS(err)];
        return;
    }
    [self syncButtons];
}

- (void)startWavFile:(NSString*)path {
    if (!_engine.isModelLoaded()) {
        [self setStatus:@"먼저 모델을 적재하세요." isError:YES];
        return;
    }
    std::string err;
    auto source = std::make_shared<kstt::WavFileSource>(toStd(path));
    if (!_engine.start(source, &err)) {
        [self setStatus:toNS(err) isError:YES];
        [self showAlert:@"WAV 파일을 인식할 수 없습니다." detail:toNS(err)];
        return;
    }
    [self appendRaw:[NSString stringWithFormat:@"── %@ ──\n", path]];
    [self syncButtons];
}

- (void)stopRecognition:(id)sender {
    if (!_engine.isRunning()) return;
    [self setStatus:@"중지 중…" isError:NO];
    _engine.stop();
    [self syncButtons];
}

- (void)refreshDevices {
    _devices = kstt::platform::inputDevices();
    [_devicePopup removeAllItems];
    for (const kstt::AudioDevice& device : _devices)
        [_devicePopup addItemWithTitle:toNS(device.name)];
    if (!_devices.empty()) [_devicePopup selectItemAtIndex:0];
}

- (void)partialToggled:(id)sender {
    const BOOL show = _partialCheck.state == NSControlStateValueOn;
    _engine.setPartialMode(show ? kstt::PartialMode::Stable : kstt::PartialMode::Off);
    if (!show) [self setPartial:@""];
}

- (void)refreshDevicesClicked:(id)sender { [self refreshDevices]; }
- (void)loadModelClicked:(id)sender { [self loadModelAsync]; }

- (void)chooseModelFolder:(id)sender {
    NSOpenPanel* panel = [NSOpenPanel openPanel];
    panel.title = @"Vosk 모델 디렉터리 선택";
    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.allowsMultipleSelection = NO;
    [panel beginSheetModalForWindow:_window
                  completionHandler:^(NSModalResponse response) {
                      if (response != NSModalResponseOK) return;
                      self->_modelField.stringValue = panel.URL.path;
                      [self loadModelAsync];
                  }];
}

- (void)chooseWavFile:(id)sender {
    NSOpenPanel* panel = [NSOpenPanel openPanel];
    panel.title = @"인식할 WAV 파일 선택";
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowedFileTypes = @[ @"wav" ];
    [panel beginSheetModalForWindow:_window
                  completionHandler:^(NSModalResponse response) {
                      if (response != NSModalResponseOK) return;
                      [self startWavFile:panel.URL.path];
                  }];
}

- (void)saveTranscript:(id)sender {
    NSSavePanel* panel = [NSSavePanel savePanel];
    panel.title = @"인식 결과 저장";
    panel.nameFieldStringValue = @"인식결과.txt";
    [panel beginSheetModalForWindow:_window
                  completionHandler:^(NSModalResponse response) {
                      if (response != NSModalResponseOK) return;
                      NSError* error = nil;
                      [self->_transcriptView.string writeToURL:panel.URL
                                                    atomically:YES
                                                      encoding:NSUTF8StringEncoding
                                                         error:&error];
                      if (error)
                          [self setStatus:error.localizedDescription isError:YES];
                      else
                          [self setStatus:[@"저장했습니다: " stringByAppendingString:panel.URL.path]
                                  isError:NO];
                  }];
}

- (void)clearTranscript:(id)sender {
    _transcriptView.string = @"";
    [self setPartial:@""];
}

- (void)maybeRunSmokeFile {
    // KSTT_SMOKE_WAV 가 가리키는 WAV 를 모델 적재 직후 자동으로 인식한다 (점검용).
    if (_smokeStarted) return;
    const char* path = getenv("KSTT_SMOKE_WAV");
    if (!path || !*path) return;
    _smokeStarted = YES;
    [self startWavFile:toNS(path)];
}

// ------------------------------------------------------------------ 표시

- (void)setStatus:(NSString*)text isError:(BOOL)isError {
    _statusLabel.stringValue = text ?: @"";
    _statusLabel.textColor = isError ? NSColor.systemRedColor : NSColor.secondaryLabelColor;
}

- (void)setPartial:(NSString*)text {
    _partialLabel.stringValue =
        (text.length == 0) ? @"" : [@"… " stringByAppendingString:text];
}

- (void)setLevel:(double)value {
    _levelIndicator.doubleValue = value;
}

- (void)appendTranscript:(NSString*)text {
    NSDateFormatter* formatter = [[NSDateFormatter alloc] init];
    formatter.dateFormat = @"HH:mm:ss";
    NSString* line = [NSString stringWithFormat:@"[%@] %@\n",
                                                [formatter stringFromDate:[NSDate date]], text];
    [self appendRaw:line];
}

- (void)appendRaw:(NSString*)line {
    [_transcriptView.textStorage.mutableString appendString:line];
    [_transcriptView scrollRangeToVisible:NSMakeRange(_transcriptView.string.length, 0)];
}

- (void)syncButtons {
    const BOOL running = _engine.isRunning();
    const BOOL ready = _engine.isModelLoaded() && !_loading;

    _startButton.enabled = ready && !running;
    _stopButton.enabled = running;
    _wavButton.enabled = ready && !running;
    _loadButton.enabled = !_loading && !running;
    _browseButton.enabled = !_loading && !running;
    _modelField.enabled = !_loading && !running;
    _devicePopup.enabled = !running;
}

- (void)showAlert:(NSString*)message detail:(NSString*)detail {
    NSAlert* alert = [[NSAlert alloc] init];
    alert.messageText = message;
    alert.informativeText = detail;
    alert.alertStyle = NSAlertStyleWarning;
    [alert beginSheetModalForWindow:_window completionHandler:nil];
}

- (void)showWindow {
    [_window makeKeyAndOrderFront:nil];
}

// 창을 닫으면 앱을 끝낸다 (엔진을 먼저 멈춘다).
- (BOOL)windowShouldClose:(NSWindow*)sender {
    _engine.stop();
    [NSApp terminate:nil];
    return YES;
}

@end

// ---------------------------------------------------------------------------

int main(int argc, const char* argv[]) {
    @autoreleasepool {
        // --model / --lib 는 환경변수로 코어에 넘긴다.
        for (int i = 1; i < argc; ++i) {
            if (strcmp(argv[i], "--model") == 0 && i + 1 < argc)
                setenv("KSTT_MODEL", argv[++i], 1);
            else if (strcmp(argv[i], "--lib") == 0 && i + 1 < argc)
                setenv("KSTT_VOSK_LIB", argv[++i], 1);
        }

        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

        KsttWindowController* controller = [[KsttWindowController alloc] init];
        [controller showWindow];

        [NSApp activateIgnoringOtherApps:YES];
        [NSApp run];
    }
    return 0;
}
