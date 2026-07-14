#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::{exception, runtime::AnyObject, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSApplication, NSApplicationDidResignActiveNotification, NSEvent, NSFloatingWindowLevel,
    NSPopUpMenuWindowLevel, NSScreen, NSWindow, NSWindowAnimationBehavior,
    NSWindowCollectionBehavior, NSWindowStyleMask,
};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSNotificationCenter, NSPoint, NSPointInRect, NSRect, NSSize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    ActivationPolicy, AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub(crate) const LAUNCHER_WINDOW_LABEL: &str = "launcher";
const MAIN_WINDOW_LABEL: &str = "main";
const LAUNCHER_WINDOW_WIDTH: f64 = 780.0;
const LAUNCHER_WINDOW_HEIGHT: f64 = 490.0;
const LAUNCHER_WINDOW_MIN_WIDTH: f64 = 560.0;
const LAUNCHER_WINDOW_MIN_HEIGHT: f64 = 360.0;
const MAIN_WINDOW_REOPEN_SUPPRESS_DURATION: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct MonitorFrame {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct WindowFrame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum MainWindowMode {
    #[default]
    Hidden,
    Persistent,
    Transient,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct MainWindowSnapshot {
    frame: WindowFrame,
    maximized: bool,
    collection_behavior: u64,
    level: i64,
}

#[derive(Debug, Default)]
struct DesktopShellState {
    mode: MainWindowMode,
    launcher_target: Option<MonitorFrame>,
    transient_snapshot: Option<MainWindowSnapshot>,
}

impl DesktopShellState {
    fn mode(&self) -> MainWindowMode {
        self.mode
    }

    fn enter_persistent(&mut self) -> Option<MainWindowSnapshot> {
        self.mode = MainWindowMode::Persistent;
        self.transient_snapshot.take()
    }

    fn enter_transient(&mut self, snapshot: MainWindowSnapshot) {
        self.mode = MainWindowMode::Transient;
        self.transient_snapshot = Some(snapshot);
    }

    fn hide(&mut self) -> Option<MainWindowSnapshot> {
        self.mode = MainWindowMode::Hidden;
        self.transient_snapshot.take()
    }

    fn should_hide_on_app_deactivate(&self) -> bool {
        self.mode == MainWindowMode::Transient
    }

    fn set_launcher_target(&mut self, target: Option<MonitorFrame>) {
        self.launcher_target = target;
    }

    fn launcher_target(&self) -> Option<MonitorFrame> {
        self.launcher_target
    }
}

#[derive(Debug, Default)]
struct ManagedDesktopShellState(Mutex<DesktopShellState>);

#[derive(Debug, Default)]
struct MainWindowReopenGuard {
    suppress_until: Mutex<Option<Instant>>,
}

impl MainWindowReopenGuard {
    fn suppress_for(&self, duration: Duration) {
        let Ok(mut suppress_until) = self.suppress_until.lock() else {
            return;
        };
        *suppress_until = Some(Instant::now() + duration);
    }

    fn consume_if_active(&self) -> bool {
        self.consume_if_active_at(Instant::now())
    }

    fn consume_if_active_at(&self, now: Instant) -> bool {
        let Ok(mut suppress_until) = self.suppress_until.lock() else {
            return false;
        };
        let Some(deadline) = *suppress_until else {
            return false;
        };
        *suppress_until = None;
        now <= deadline
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LauncherActivationStep {
    MakeWindowKey,
    ActivateApplication,
}

#[cfg(target_os = "macos")]
fn launcher_activation_steps() -> [LauncherActivationStep; 2] {
    [
        LauncherActivationStep::MakeWindowKey,
        LauncherActivationStep::ActivateApplication,
    ]
}

#[cfg(target_os = "macos")]
fn transient_main_collection_behavior(
    mut behavior: NSWindowCollectionBehavior,
) -> NSWindowCollectionBehavior {
    behavior.remove(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Primary
            | NSWindowCollectionBehavior::CanJoinAllApplications
            | NSWindowCollectionBehavior::Managed
            | NSWindowCollectionBehavior::Transient
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::FullScreenPrimary
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::FullScreenNone,
    );
    behavior.insert(
        NSWindowCollectionBehavior::MoveToActiveSpace
            | NSWindowCollectionBehavior::Auxiliary
            | NSWindowCollectionBehavior::Transient
            | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
    behavior
}

fn select_target_monitor(
    preferred: Option<MonitorFrame>,
    available: &[MonitorFrame],
    cursor: Option<MonitorFrame>,
    current: Option<MonitorFrame>,
    primary: Option<MonitorFrame>,
) -> Option<MonitorFrame> {
    let valid = |candidate: Option<MonitorFrame>| {
        candidate.filter(|frame| available.iter().any(|available| available == frame))
    };

    valid(preferred)
        .or_else(|| valid(cursor))
        .or_else(|| valid(current))
        .or_else(|| valid(primary))
        .or_else(|| available.first().copied())
}

fn centered_window_frame(
    monitor: MonitorFrame,
    window_width: f64,
    window_height: f64,
) -> WindowFrame {
    let width = window_width.clamp(1.0, monitor.width.max(1.0));
    let height = window_height.clamp(1.0, monitor.height.max(1.0));
    let x = monitor.x + ((monitor.width - width) / 2.0).max(0.0);
    let y = monitor.y + ((monitor.height - height) / 2.0).max(0.0);

    WindowFrame {
        x,
        y,
        width,
        height,
    }
}

pub(crate) fn setup<R: Runtime + 'static>(app: &mut tauri::App<R>) -> tauri::Result<()> {
    app.manage(ManagedDesktopShellState::default());
    app.manage(MainWindowReopenGuard::default());
    set_accessory_activation_policy(app.handle());
    setup_tray(app)?;
    setup_launcher_window(app)?;
    setup_app_deactivation_observer(app.handle());
    if let Err(error) = setup_global_shortcut(app) {
        log_launcher_debug(format!("register global shortcut failed: {error}"));
    }
    Ok(())
}

pub(crate) fn show_launcher<R: Runtime + 'static>(app: &AppHandle<R>) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = show_launcher_on_main_thread(&handle) {
            log_launcher_debug(format!("show launcher failed: {error}"));
        }
    })
    .map_err(|error| error.to_string())
}

pub(crate) fn hide_launcher<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LAUNCHER_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn open_tool_from_launcher<R: Runtime + 'static>(
    app: &AppHandle<R>,
    tool_id: String,
) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = open_tool_on_main_thread(&handle, tool_id) {
            log_launcher_debug(format!("open tool from launcher failed: {error}"));
        }
    })
    .map_err(|error| error.to_string())
}

pub(crate) fn suppress_next_reopen<R: Runtime>(app: &AppHandle<R>) {
    app.state::<MainWindowReopenGuard>()
        .suppress_for(MAIN_WINDOW_REOPEN_SUPPRESS_DURATION);
}

pub(crate) fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        if let Err(error) = hide_main_window_on_main_thread(window.app_handle()) {
            log_launcher_debug(format!("hide main window after close failed: {error}"));
        }
    }
}

pub(crate) fn handle_reopen<R: Runtime + 'static>(app: &AppHandle<R>) {
    if app.state::<MainWindowReopenGuard>().consume_if_active() {
        return;
    }
    show_persistent_main(app);
}

fn setup_tray<R: Runtime + 'static>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)?;
    let launcher = MenuItem::with_id(app, "launcher", "打开快速启动器", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 DevForge", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &launcher, &separator, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_persistent_main(app),
            "launcher" => {
                let _ = show_launcher(app);
            }
            "quit" => {
                if let Err(error) = hide_main_window_on_main_thread(app) {
                    log_launcher_debug(format!("restore main window before quit failed: {error}"));
                }
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn setup_launcher_window<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let launcher = WebviewWindowBuilder::new(
        app,
        LAUNCHER_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=launcher".into()),
    )
    .title("DevForge Launcher")
    .inner_size(LAUNCHER_WINDOW_WIDTH, LAUNCHER_WINDOW_HEIGHT)
    .min_inner_size(LAUNCHER_WINDOW_MIN_WIDTH, LAUNCHER_WINDOW_MIN_HEIGHT)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible_on_all_workspaces(true)
    .visible(false)
    .center()
    .build()?;

    let launcher_for_focus = launcher.clone();
    launcher.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            let _ = launcher_for_focus.hide();
        }
    });

    Ok(())
}

fn setup_global_shortcut<R: Runtime + 'static>(app: &tauri::App<R>) -> Result<(), String> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let handle = app.handle().clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                if event.state() == ShortcutState::Pressed {
                    let _ = show_launcher(&handle);
                }
            }));
            if result.is_err() {
                log_launcher_debug("global shortcut handler panicked");
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn show_persistent_main<R: Runtime + 'static>(app: &AppHandle<R>) {
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = show_persistent_main_on_main_thread(&handle) {
            log_launcher_debug(format!("show persistent main window failed: {error}"));
        }
    }) {
        log_launcher_debug(format!("queue persistent main window failed: {error}"));
    }
}

fn open_tool_on_main_thread<R: Runtime>(app: &AppHandle<R>, tool_id: String) -> Result<(), String> {
    hide_launcher(app)?;
    if shell_mode(app)? == MainWindowMode::Persistent {
        show_persistent_main_on_main_thread(app)?;
    } else {
        show_transient_main_on_main_thread(app)?;
    }
    app.emit("devforge://open-tool", tool_id)
        .map_err(|error| error.to_string())
}

fn shell_mode<R: Runtime>(app: &AppHandle<R>) -> Result<MainWindowMode, String> {
    let state = app.state::<ManagedDesktopShellState>();
    let state = state
        .0
        .lock()
        .map_err(|_| "桌面窗口状态锁已损坏".to_string())?;
    Ok(state.mode())
}

fn update_shell_state<R: Runtime, T>(
    app: &AppHandle<R>,
    update: impl FnOnce(&mut DesktopShellState) -> T,
) -> Result<T, String> {
    let state = app.state::<ManagedDesktopShellState>();
    let mut state = state
        .0
        .lock()
        .map_err(|_| "桌面窗口状态锁已损坏".to_string())?;
    Ok(update(&mut state))
}

fn show_launcher_on_main_thread<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if shell_mode(app)? == MainWindowMode::Transient {
        hide_main_window_on_main_thread(app)?;
    }
    if shell_mode(app)? != MainWindowMode::Persistent {
        set_accessory_activation_policy(app);
    }

    let Some(window) = app.get_webview_window(LAUNCHER_WINDOW_LABEL) else {
        return Err("启动器窗口不存在".to_string());
    };
    configure_launcher_workspace_behavior(&window);
    window
        .set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
            width: LAUNCHER_WINDOW_MIN_WIDTH,
            height: LAUNCHER_WINDOW_MIN_HEIGHT,
        })))
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: LAUNCHER_WINDOW_WIDTH,
            height: LAUNCHER_WINDOW_HEIGHT,
        }))
        .map_err(|error| error.to_string())?;

    let target = resolve_target_monitor(app, &window, None).unwrap_or(MonitorFrame {
        x: 0.0,
        y: 0.0,
        width: LAUNCHER_WINDOW_WIDTH,
        height: LAUNCHER_WINDOW_HEIGHT,
    });
    update_shell_state(app, |state| state.set_launcher_target(Some(target)))?;
    position_window_on_monitor(
        &window,
        target,
        LAUNCHER_WINDOW_WIDTH,
        LAUNCHER_WINDOW_HEIGHT,
    )?;
    show_and_front_launcher(&window)?;
    app.emit("devforge://focus-launcher", ())
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn show_persistent_main_on_main_thread<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    hide_launcher(app)?;
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("主窗口不存在".to_string());
    };
    if let Some(snapshot) = update_shell_state(app, DesktopShellState::enter_persistent)? {
        restore_main_window_snapshot(&window, snapshot)?;
    }
    set_regular_activation_policy(app);
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    show_and_front_main(&window)?;
    Ok(())
}

fn show_transient_main_on_main_thread<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("主窗口不存在".to_string());
    };
    let snapshot = capture_main_window_snapshot(&window)?;
    let preferred = update_shell_state(app, |state| state.launcher_target())?;
    let target = resolve_target_monitor(app, &window, preferred).unwrap_or(MonitorFrame {
        x: snapshot.frame.x,
        y: snapshot.frame.y,
        width: snapshot.frame.width,
        height: snapshot.frame.height,
    });

    let configure_result = (|| {
        configure_transient_main_window(&window)?;
        position_window_on_monitor(&window, target, snapshot.frame.width, snapshot.frame.height)?;
        update_shell_state(app, |state| state.enter_transient(snapshot))?;
        set_accessory_activation_policy(app);
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        show_and_front_main(&window)
    })();

    if let Err(error) = configure_result {
        let _ = window.hide();
        let _ = restore_main_window_snapshot(&window, snapshot);
        let _ = update_shell_state(app, DesktopShellState::hide);
        return Err(error);
    }
    Ok(())
}

fn hide_main_window_on_main_thread<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        set_accessory_activation_policy(app);
        return Ok(());
    };
    window.hide().map_err(|error| error.to_string())?;
    let snapshot = update_shell_state(app, DesktopShellState::hide)?;
    if let Some(snapshot) = snapshot {
        restore_main_window_snapshot(&window, snapshot)?;
    }
    set_accessory_activation_policy(app);
    Ok(())
}

fn capture_main_window_snapshot<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<MainWindowSnapshot, String> {
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    if maximized {
        window.unmaximize().map_err(|error| error.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        return run_appkit_step("capture main window snapshot", || unsafe {
            let ns_window = &*(ns_window.cast::<NSWindow>());
            let frame = ns_window.frame();
            MainWindowSnapshot {
                frame: WindowFrame {
                    x: frame.origin.x,
                    y: frame.origin.y,
                    width: frame.size.width,
                    height: frame.size.height,
                },
                maximized,
                collection_behavior: ns_window.collectionBehavior().bits() as u64,
                level: ns_window.level() as i64,
            }
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let position = window.outer_position().map_err(|error| error.to_string())?;
        let size = window.outer_size().map_err(|error| error.to_string())?;
        Ok(MainWindowSnapshot {
            frame: WindowFrame {
                x: f64::from(position.x),
                y: f64::from(position.y),
                width: f64::from(size.width),
                height: f64::from(size.height),
            },
            maximized,
            collection_behavior: 0,
            level: 0,
        })
    }
}

fn restore_main_window_snapshot<R: Runtime>(
    window: &WebviewWindow<R>,
    snapshot: MainWindowSnapshot,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        run_appkit_step("restore main window snapshot", || unsafe {
            let ns_window = &*(ns_window.cast::<NSWindow>());
            ns_window.setCollectionBehavior(NSWindowCollectionBehavior::from_bits_retain(
                snapshot.collection_behavior as usize,
            ));
            ns_window.setLevel(snapshot.level as isize);
            ns_window.setFrame_display(
                NSRect::new(
                    NSPoint::new(snapshot.frame.x, snapshot.frame.y),
                    NSSize::new(snapshot.frame.width, snapshot.frame.height),
                ),
                true,
            );
        })?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                snapshot.frame.x.round() as i32,
                snapshot.frame.y.round() as i32,
            )))
            .map_err(|error| error.to_string())?;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                snapshot.frame.width.round() as u32,
                snapshot.frame.height.round() as u32,
            )))
            .map_err(|error| error.to_string())?;
    }

    if snapshot.maximized {
        window.maximize().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn configure_launcher_workspace_behavior<R: Runtime>(window: &WebviewWindow<R>) {
    if let Err(error) = window.set_visible_on_all_workspaces(true) {
        log_launcher_debug(format!(
            "set launcher visible on all workspaces failed: {error}"
        ));
    }
    if let Err(error) = configure_launcher_fullscreen_auxiliary(window) {
        log_launcher_debug(format!(
            "configure launcher fullscreen behavior failed: {error}"
        ));
    }
    if let Err(error) = window.set_focusable(true) {
        log_launcher_debug(format!("set launcher focusable failed: {error}"));
    }
}

#[cfg(target_os = "macos")]
fn configure_launcher_fullscreen_auxiliary<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    run_appkit_step("configure launcher fullscreen behavior", || unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        ns_window.setCollectionBehavior(launcher_fullscreen_collection_behavior(
            ns_window.collectionBehavior(),
        ));
        ns_window.setStyleMask(launcher_floating_panel_style_mask(ns_window.styleMask()));
        ns_window.setHidesOnDeactivate(false);
        ns_window.setCanHide(false);
        ns_window.setAnimationBehavior(NSWindowAnimationBehavior::UtilityWindow);
        ns_window.setLevel(NSPopUpMenuWindowLevel);
    })
}

#[cfg(not(target_os = "macos"))]
fn configure_launcher_fullscreen_auxiliary<R: Runtime>(
    _window: &WebviewWindow<R>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn configure_transient_main_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    run_appkit_step("configure transient main window", || unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        ns_window.setCollectionBehavior(transient_main_collection_behavior(
            ns_window.collectionBehavior(),
        ));
        ns_window.setHidesOnDeactivate(false);
        ns_window.setCanHide(true);
        ns_window.setLevel(NSFloatingWindowLevel);
    })
}

#[cfg(not(target_os = "macos"))]
fn configure_transient_main_window<R: Runtime>(_window: &WebviewWindow<R>) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn launcher_fullscreen_collection_behavior(
    mut behavior: NSWindowCollectionBehavior,
) -> NSWindowCollectionBehavior {
    behavior.remove(
        NSWindowCollectionBehavior::Primary
            | NSWindowCollectionBehavior::Auxiliary
            | NSWindowCollectionBehavior::CanJoinAllApplications
            | NSWindowCollectionBehavior::Managed
            | NSWindowCollectionBehavior::Transient
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::FullScreenPrimary
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::FullScreenNone,
    );
    behavior.insert(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Auxiliary
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Transient,
    );
    behavior
}

#[cfg(target_os = "macos")]
fn launcher_floating_panel_style_mask(mut style_mask: NSWindowStyleMask) -> NSWindowStyleMask {
    style_mask.insert(NSWindowStyleMask::UtilityWindow);
    style_mask.remove(NSWindowStyleMask::NonactivatingPanel | NSWindowStyleMask::Miniaturizable);
    style_mask
}

fn position_window_on_monitor<R: Runtime>(
    window: &WebviewWindow<R>,
    monitor: MonitorFrame,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let frame = centered_window_frame(monitor, width, height);

    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        return run_appkit_step("position desktop window", || unsafe {
            let ns_window = &*(ns_window.cast::<NSWindow>());
            ns_window.setFrame_display(
                NSRect::new(
                    NSPoint::new(frame.x, frame.y),
                    NSSize::new(frame.width, frame.height),
                ),
                true,
            );
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                frame.width.round() as u32,
                frame.height.round() as u32,
            )))
            .map_err(|error| error.to_string())?;
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                frame.x.round() as i32,
                frame.y.round() as i32,
            )))
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn resolve_target_monitor<R: Runtime>(
    _app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    preferred: Option<MonitorFrame>,
) -> Option<MonitorFrame> {
    #[cfg(target_os = "macos")]
    {
        let available = available_monitor_frames_macos();
        return select_target_monitor(
            preferred,
            &available,
            cursor_monitor_frame_macos(),
            window_monitor_frame_macos(window),
            primary_monitor_frame_macos(),
        );
    }

    #[cfg(not(target_os = "macos"))]
    {
        let available = _app
            .available_monitors()
            .ok()
            .unwrap_or_default()
            .iter()
            .map(monitor_frame_from_tauri)
            .collect::<Vec<_>>();
        let cursor = _app
            .cursor_position()
            .ok()
            .and_then(|cursor| _app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
            .as_ref()
            .map(monitor_frame_from_tauri);
        let current = window
            .current_monitor()
            .ok()
            .flatten()
            .as_ref()
            .map(monitor_frame_from_tauri);
        let primary = _app
            .primary_monitor()
            .ok()
            .flatten()
            .as_ref()
            .map(monitor_frame_from_tauri);
        select_target_monitor(preferred, &available, cursor, current, primary)
    }
}

#[cfg(not(target_os = "macos"))]
fn monitor_frame_from_tauri(monitor: &tauri::Monitor) -> MonitorFrame {
    let position = monitor.position();
    let size = monitor.size();
    MonitorFrame {
        x: f64::from(position.x),
        y: f64::from(position.y),
        width: f64::from(size.width),
        height: f64::from(size.height),
    }
}

#[cfg(target_os = "macos")]
fn available_monitor_frames_macos() -> Vec<MonitorFrame> {
    let Some(mtm) = MainThreadMarker::new() else {
        return Vec::new();
    };
    NSScreen::screens(mtm)
        .iter()
        .map(|screen| monitor_frame_from_ns_rect(screen.visibleFrame()))
        .collect()
}

#[cfg(target_os = "macos")]
fn cursor_monitor_frame_macos() -> Option<MonitorFrame> {
    let mtm = MainThreadMarker::new()?;
    let mouse_location = NSEvent::mouseLocation();
    for screen in NSScreen::screens(mtm).iter() {
        if NSPointInRect(mouse_location, screen.frame()) {
            return Some(monitor_frame_from_ns_rect(screen.visibleFrame()));
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn window_monitor_frame_macos<R: Runtime>(window: &WebviewWindow<R>) -> Option<MonitorFrame> {
    let ns_window = window.ns_window().ok()?;
    run_appkit_step("read window monitor", || unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        ns_window
            .screen()
            .map(|screen| monitor_frame_from_ns_rect(screen.visibleFrame()))
    })
    .ok()
    .flatten()
}

#[cfg(target_os = "macos")]
fn primary_monitor_frame_macos() -> Option<MonitorFrame> {
    let mtm = MainThreadMarker::new()?;
    NSScreen::mainScreen(mtm).map(|screen| monitor_frame_from_ns_rect(screen.visibleFrame()))
}

#[cfg(target_os = "macos")]
fn monitor_frame_from_ns_rect(frame: NSRect) -> MonitorFrame {
    MonitorFrame {
        x: frame.origin.x,
        y: frame.origin.y,
        width: frame.size.width,
        height: frame.size.height,
    }
}

fn show_and_front_launcher<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        run_appkit_step("show and front launcher", || unsafe {
            let ns_window = &*(ns_window.cast::<NSWindow>());
            if ns_window.isMiniaturized() {
                ns_window.deminiaturize(None::<&AnyObject>);
            }
            ns_window.orderFrontRegardless();
            for step in launcher_activation_steps() {
                match step {
                    LauncherActivationStep::MakeWindowKey => {
                        if ns_window.canBecomeKeyWindow() {
                            ns_window.makeKeyWindow();
                        }
                        if ns_window.canBecomeMainWindow() {
                            ns_window.makeMainWindow();
                        }
                        ns_window.makeKeyAndOrderFront(None::<&AnyObject>);
                    }
                    LauncherActivationStep::ActivateApplication => activate_current_macos_app(),
                }
            }
            ns_window.orderFrontRegardless();
        })?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
    }
    window.set_focus().map_err(|error| error.to_string())?;
    if let Err(error) = window.as_ref().set_focus() {
        log_launcher_debug(format!("set launcher webview focus failed: {error}"));
    }
    Ok(())
}

fn show_and_front_main<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        run_appkit_step("show and front main window", || unsafe {
            let ns_window = &*(ns_window.cast::<NSWindow>());
            activate_current_macos_app();
            ns_window.makeKeyAndOrderFront(None::<&AnyObject>);
            ns_window.orderFrontRegardless();
        })?;
    }
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn activate_current_macos_app() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    app.activate();
}

#[cfg(target_os = "macos")]
fn set_accessory_activation_policy<R: Runtime>(app: &AppHandle<R>) {
    if let Err(error) = app.set_activation_policy(ActivationPolicy::Accessory) {
        log_launcher_debug(format!("set accessory activation policy failed: {error}"));
    }
}

#[cfg(not(target_os = "macos"))]
fn set_accessory_activation_policy<R: Runtime>(_app: &AppHandle<R>) {}

#[cfg(target_os = "macos")]
fn set_regular_activation_policy<R: Runtime>(app: &AppHandle<R>) {
    if let Err(error) = app.set_activation_policy(ActivationPolicy::Regular) {
        log_launcher_debug(format!("set regular activation policy failed: {error}"));
    }
}

#[cfg(not(target_os = "macos"))]
fn set_regular_activation_policy<R: Runtime>(_app: &AppHandle<R>) {}

#[cfg(target_os = "macos")]
fn setup_app_deactivation_observer<R: Runtime + 'static>(app: &AppHandle<R>) {
    let handle = app.clone();
    let block = RcBlock::new(move |_| {
        if let Ok(true) = update_shell_state(&handle, |state| state.should_hide_on_app_deactivate())
        {
            if let Err(error) = hide_main_window_on_main_thread(&handle) {
                log_launcher_debug(format!("hide transient main window failed: {error}"));
            }
        }
    });

    unsafe {
        let _ = NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSApplicationDidResignActiveNotification),
            None,
            None,
            &block,
        );
    }
}

#[cfg(not(target_os = "macos"))]
fn setup_app_deactivation_observer<R: Runtime + 'static>(_app: &AppHandle<R>) {}

#[cfg(target_os = "macos")]
fn run_appkit_step<T>(label: &str, step: impl FnOnce() -> T) -> Result<T, String> {
    exception::catch(std::panic::AssertUnwindSafe(step)).map_err(|exception| {
        let detail = exception
            .as_deref()
            .map(|exception| format!("{exception:?}"))
            .unwrap_or_else(|| "nil Objective-C exception".to_string());
        let message = format!("{label} raised Objective-C exception: {detail}");
        log_launcher_debug(&message);
        message
    })
}

fn launcher_debug_enabled() -> bool {
    std::env::var("DEVFORGE_LAUNCHER_DEBUG").is_ok_and(|value| value != "0")
}

fn log_launcher_debug(message: impl AsRef<str>) {
    if launcher_debug_enabled() {
        eprintln!("devforge launcher: {}", message.as_ref());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(x: f64, y: f64, width: f64, height: f64) -> MonitorFrame {
        MonitorFrame {
            x,
            y,
            width,
            height,
        }
    }

    fn snapshot() -> MainWindowSnapshot {
        MainWindowSnapshot {
            frame: WindowFrame {
                x: 120.0,
                y: 80.0,
                width: 1280.0,
                height: 820.0,
            },
            maximized: false,
            collection_behavior: 7,
            level: 3,
        }
    }

    #[test]
    fn transient_mode_hides_and_restores_snapshot_when_the_app_deactivates() {
        let expected_snapshot = snapshot();
        let mut state = DesktopShellState::default();

        state.enter_transient(expected_snapshot);

        assert_eq!(state.mode(), MainWindowMode::Transient);
        assert!(state.should_hide_on_app_deactivate());
        assert_eq!(state.hide(), Some(expected_snapshot));
        assert_eq!(state.mode(), MainWindowMode::Hidden);
    }

    #[test]
    fn persistent_mode_ignores_app_deactivation() {
        let mut state = DesktopShellState::default();

        state.enter_persistent();

        assert_eq!(state.mode(), MainWindowMode::Persistent);
        assert!(!state.should_hide_on_app_deactivate());
        assert_eq!(state.hide(), None);
        assert_eq!(state.mode(), MainWindowMode::Hidden);
    }

    #[test]
    fn reopen_guard_suppresses_only_the_next_reopen_event() {
        let guard = MainWindowReopenGuard::default();

        guard.suppress_for(Duration::from_secs(2));

        assert!(guard.consume_if_active());
        assert!(!guard.consume_if_active());
    }

    #[test]
    fn reopen_guard_expires_after_its_deadline() {
        let guard = MainWindowReopenGuard::default();
        let now = Instant::now();
        {
            let mut suppress_until = guard.suppress_until.lock().expect("guard lock");
            *suppress_until = Some(now - Duration::from_millis(1));
        }

        assert!(!guard.consume_if_active_at(now));
        assert!(!guard.consume_if_active_at(now));
    }

    #[test]
    fn promoting_transient_mode_to_persistent_returns_the_saved_snapshot() {
        let expected_snapshot = snapshot();
        let mut state = DesktopShellState::default();
        state.enter_transient(expected_snapshot);

        assert_eq!(state.enter_persistent(), Some(expected_snapshot));
        assert_eq!(state.mode(), MainWindowMode::Persistent);
    }

    #[test]
    fn remembers_the_monitor_that_triggered_the_launcher() {
        let expected = frame(-1920.0, 0.0, 1920.0, 1080.0);
        let mut state = DesktopShellState::default();

        state.set_launcher_target(Some(expected));

        assert_eq!(state.launcher_target(), Some(expected));
    }

    #[test]
    fn target_monitor_prefers_a_valid_shortcut_screen() {
        let preferred = frame(-1920.0, 0.0, 1920.0, 1080.0);
        let primary = frame(0.0, 0.0, 2560.0, 1440.0);

        let selected = select_target_monitor(
            Some(preferred),
            &[primary, preferred],
            Some(primary),
            None,
            Some(primary),
        );

        assert_eq!(selected, Some(preferred));
    }

    #[test]
    fn target_monitor_falls_back_when_the_shortcut_screen_disappears() {
        let disconnected = frame(-1920.0, 0.0, 1920.0, 1080.0);
        let cursor = frame(0.0, 0.0, 2560.0, 1440.0);
        let current = frame(2560.0, 0.0, 1920.0, 1080.0);

        let selected = select_target_monitor(
            Some(disconnected),
            &[cursor, current],
            Some(cursor),
            Some(current),
            Some(current),
        );

        assert_eq!(selected, Some(cursor));
    }

    #[test]
    fn centers_and_clamps_a_window_inside_the_target_monitor() {
        let target = frame(100.0, 50.0, 640.0, 400.0);

        let centered = centered_window_frame(target, 780.0, 490.0);

        assert_eq!(
            centered,
            WindowFrame {
                x: 100.0,
                y: 50.0,
                width: 640.0,
                height: 400.0,
            }
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn launcher_activation_does_not_bring_all_app_windows_forward() {
        assert_eq!(
            launcher_activation_steps(),
            [
                LauncherActivationStep::MakeWindowKey,
                LauncherActivationStep::ActivateApplication,
            ]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn transient_main_window_moves_to_the_active_fullscreen_space() {
        let initial = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Managed
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::FullScreenPrimary;

        let behavior = transient_main_collection_behavior(initial);

        assert!(behavior.contains(NSWindowCollectionBehavior::MoveToActiveSpace));
        assert!(behavior.contains(NSWindowCollectionBehavior::Auxiliary));
        assert!(behavior.contains(NSWindowCollectionBehavior::Transient));
        assert!(behavior.contains(NSWindowCollectionBehavior::FullScreenAuxiliary));
        assert!(!behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces));
        assert!(!behavior.contains(NSWindowCollectionBehavior::Managed));
        assert!(!behavior.contains(NSWindowCollectionBehavior::Stationary));
        assert!(!behavior.contains(NSWindowCollectionBehavior::FullScreenPrimary));
    }
}
