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
    fn promoting_transient_mode_to_persistent_returns_the_saved_snapshot() {
        let expected_snapshot = snapshot();
        let mut state = DesktopShellState::default();
        state.enter_transient(expected_snapshot);

        assert_eq!(state.enter_persistent(), Some(expected_snapshot));
        assert_eq!(state.mode(), MainWindowMode::Persistent);
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
}
