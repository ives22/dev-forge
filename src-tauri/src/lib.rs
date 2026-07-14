mod desktop_shell;

use base64::{engine::general_purpose, Engine as _};
use fancy_regex::{Regex, RegexBuilder};
#[cfg(target_os = "macos")]
use objc2::{exception, runtime::AnyObject, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSApplicationActivationPolicy, NSEvent,
    NSPopUpMenuWindowLevel, NSRunningApplication, NSScreen, NSWindow, NSWindowAnimationBehavior,
    NSWindowCollectionBehavior, NSWindowStyleMask,
};
#[cfg(target_os = "macos")]
use objc2_core_foundation::{
    kCFStringTransformMandarinLatin, kCFStringTransformStripCombiningMarks, CFMutableString,
    CFRange, CFString,
};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSPoint, NSPointInRect, NSRect, NSSize};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream, UdpSocket},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const DB_URL: &str = "sqlite:devforge.db";
const DNS_PORT: u16 = 53;
const DNS_TIMEOUT: Duration = Duration::from_secs(3);
const FALLBACK_DNS_RESOLVERS: [&str; 2] = ["1.1.1.1", "8.8.8.8"];
const REGEX_MAX_MATCHES: usize = 1000;
const APPLICATION_RESULT_LIMIT: usize = 50;
const LAUNCHER_WINDOW_LABEL: &str = "launcher";
const LAUNCHER_WINDOW_WIDTH: f64 = 780.0;
const LAUNCHER_WINDOW_HEIGHT: f64 = 490.0;
const LAUNCHER_WINDOW_MIN_WIDTH: f64 = 560.0;
const LAUNCHER_WINDOW_MIN_HEIGHT: f64 = 360.0;
const MAIN_WINDOW_REOPEN_SUPPRESS_DURATION: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq)]
struct LauncherMonitorFrame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEntry {
    pub tool_id: String,
    pub action: String,
    pub input_preview: Option<String>,
    pub output_preview: Option<String>,
    pub input_bytes: i64,
    pub output_bytes: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct PortEntry {
    pub port: u16,
    pub protocol: String,
    pub address: String,
    pub status: String,
    pub pid: u32,
    pub process: String,
    pub group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalNetworkIpInfo {
    pub ip: String,
    pub interface_name: String,
    pub connection_type: String,
    pub hardware_port: String,
    pub mac_address: String,
    pub netmask: String,
    pub broadcast: String,
    pub is_default_route: bool,
    pub source: String,
    pub updated_at: String,
    pub status_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationEntry {
    pub id: String,
    pub name: String,
    pub localized_name: String,
    pub path: String,
    pub display_path: String,
    pub source: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnsTraceStep {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DnsRecord {
    #[serde(rename = "type")]
    pub record_type: String,
    pub host: String,
    pub value: String,
    pub ttl: Option<u32>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DnsLookupResult {
    pub domain: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub records: Vec<DnsRecord>,
    pub trace: Vec<DnsTraceStep>,
    pub elapsed_ms: u128,
    pub source: String,
    pub resolver: String,
    pub status_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegexOptions {
    pub pattern: String,
    pub flags: Vec<String>,
    pub text: String,
    pub replacement: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegexHighlightPart {
    pub text: String,
    #[serde(rename = "match")]
    pub match_: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegexGroup {
    pub label: String,
    pub value: String,
    #[serde(rename = "type")]
    pub group_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegexMatch {
    pub index: usize,
    pub end: usize,
    pub text: String,
    pub groups: Vec<RegexGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegexResult {
    pub ok: bool,
    pub flags: String,
    pub expression: String,
    pub matches: Vec<RegexMatch>,
    pub highlights: Vec<RegexHighlightPart>,
    pub group_count: usize,
    pub replace_output: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub engine: String,
}

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

#[tauri::command]
fn database_url() -> &'static str {
    DB_URL
}

#[tauri::command]
fn default_settings() -> serde_json::Value {
    serde_json::json!({
        "theme": "dark",
        "historyFullContent": false,
        "clipboardAutoDetect": false,
        "globalShortcut": "Option+Space"
    })
}

#[tauri::command]
async fn emit_command_palette<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.emit("devforge://open-command-palette", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn show_launcher<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    show_launcher_window(&app)
}

#[tauri::command]
async fn hide_launcher<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    hide_launcher_window(&app)
}

#[tauri::command]
async fn open_tool_from_launcher<R: Runtime>(
    app: AppHandle<R>,
    tool_id: String,
) -> Result<(), String> {
    hide_launcher_window(&app)?;
    show_main_window(&app);
    app.emit("devforge://open-tool", tool_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_applications(query: Option<String>) -> Result<Vec<ApplicationEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_applications_blocking(query.unwrap_or_default())
    })
    .await
    .map_err(|error| format!("应用搜索线程失败：{error}"))?
}

#[tauri::command]
async fn open_application<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_application_bundle(&path) {
        return Err("只能打开 .app 应用".to_string());
    }
    hide_launcher_window(&app)?;
    app.state::<MainWindowReopenGuard>()
        .suppress_for(MAIN_WINDOW_REOPEN_SUPPRESS_DURATION);
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|error| format!("启动应用失败：{error}"))?;
    Ok(())
}

#[tauri::command]
async fn application_icon_data_url(path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        application_icon_data_url_blocking(PathBuf::from(path))
    })
    .await
    .map_err(|error| format!("应用图标读取线程失败：{error}"))?
}

#[tauri::command]
async fn capture_screen_selection() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(capture_screen_selection_blocking)
            .await
            .map_err(|error| format!("截屏线程失败：{error}"))?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

#[tauri::command]
fn list_ports() -> Result<Vec<PortEntry>, String> {
    let mut rows = Vec::new();
    rows.extend(scan_lsof(&["-nP", "-iTCP", "-sTCP:LISTEN"], "TCP")?);
    rows.extend(scan_lsof(&["-nP", "-iUDP"], "UDP")?);

    let mut seen = HashSet::new();
    rows.retain(|row| {
        seen.insert((
            row.protocol.clone(),
            row.address.clone(),
            row.port,
            row.pid,
            row.process.clone(),
            row.status.clone(),
        ))
    });
    rows.sort_by(|a, b| {
        a.port
            .cmp(&b.port)
            .then_with(|| a.protocol.cmp(&b.protocol))
            .then_with(|| a.process.cmp(&b.process))
            .then_with(|| a.pid.cmp(&b.pid))
    });
    Ok(rows)
}

#[tauri::command]
async fn get_local_network_ip() -> Result<LocalNetworkIpInfo, String> {
    tauri::async_runtime::spawn_blocking(get_local_network_ip_blocking)
        .await
        .map_err(|error| format!("本机 IP 查询线程失败：{error}"))?
}

#[tauri::command]
async fn lookup_dns(domain: String, record_type: String) -> Result<DnsLookupResult, String> {
    tauri::async_runtime::spawn_blocking(move || lookup_dns_blocking(domain, record_type))
        .await
        .map_err(|error| format!("DNS 查询线程失败：{error}"))?
}

#[tauri::command]
async fn evaluate_regex(options: RegexOptions) -> Result<RegexResult, String> {
    tauri::async_runtime::spawn_blocking(move || evaluate_regex_blocking(options))
        .await
        .map_err(|error| format!("正则匹配线程失败：{error}"))?
}

fn evaluate_regex_blocking(options: RegexOptions) -> Result<RegexResult, String> {
    let replacement = options.replacement.unwrap_or_default();
    let parsed = parse_regex_pattern(&options.pattern, &options.flags);
    let normalized_flags = normalize_regex_flags(&parsed.flags);
    let expression = format!("/{}/{}", parsed.pattern, normalized_flags);
    let text = options.text;

    if parsed.pattern.is_empty() {
        return Ok(RegexResult {
            ok: true,
            flags: normalized_flags,
            expression,
            matches: Vec::new(),
            highlights: if text.is_empty() {
                Vec::new()
            } else {
                vec![RegexHighlightPart {
                    text: text.clone(),
                    match_: false,
                    match_index: None,
                }]
            },
            group_count: 0,
            replace_output: text,
            state: "Valid".to_string(),
            error: None,
            engine: "Rust fancy-regex".to_string(),
        });
    }

    match evaluate_regex_with_engine(&parsed.pattern, &normalized_flags, &text, &replacement) {
        Ok(mut result) => {
            result.expression = expression;
            result.flags = normalized_flags;
            Ok(result)
        }
        Err(error) => Ok(RegexResult {
            ok: false,
            flags: normalized_flags,
            expression,
            matches: Vec::new(),
            highlights: vec![RegexHighlightPart {
                text: error.clone(),
                match_: false,
                match_index: None,
            }],
            group_count: 0,
            replace_output: String::new(),
            state: "Error".to_string(),
            error: Some(error),
            engine: "Rust fancy-regex".to_string(),
        }),
    }
}

struct ParsedRegexInput {
    pattern: String,
    flags: Vec<String>,
}

#[derive(Debug, Clone)]
struct CaptureSnapshot {
    start: usize,
    end: usize,
    text: String,
    indexed: Vec<Option<String>>,
    named: Vec<(String, String)>,
}

fn evaluate_regex_with_engine(
    pattern: &str,
    flags: &str,
    text: &str,
    replacement: &str,
) -> Result<RegexResult, String> {
    let regex = compile_regex(pattern, flags)?;
    let capture_names = regex
        .capture_names()
        .map(|name| name.map(str::to_string))
        .collect::<Vec<_>>();
    let global = flags.contains('g');
    let mut match_cursor = 0usize;
    let mut text_cursor = 0usize;
    let mut matches = Vec::new();
    let mut snapshots = Vec::new();
    let mut highlights = Vec::new();

    while match_cursor <= text.len() && matches.len() < REGEX_MAX_MATCHES {
        let Some(captures) = regex
            .captures_from_pos(text, match_cursor)
            .map_err(|error| format!("正则匹配失败：{error}"))?
        else {
            break;
        };

        let Some(full_match) = captures.get(0) else {
            break;
        };

        let start = full_match.start();
        let end = full_match.end();
        let match_text = full_match.as_str();
        push_plain_regex_part(&mut highlights, &text[text_cursor..start]);
        highlights.push(RegexHighlightPart {
            text: if match_text.is_empty() {
                "\u{200B}".to_string()
            } else {
                match_text.to_string()
            },
            match_: true,
            match_index: Some(matches.len()),
        });

        let mut indexed = Vec::with_capacity(captures.len().saturating_sub(1));
        for group_index in 1..captures.len() {
            indexed.push(
                captures
                    .get(group_index)
                    .map(|capture| capture.as_str().to_string()),
            );
        }

        let mut named = Vec::new();
        for name in capture_names.iter().skip(1).flatten() {
            let value = captures
                .name(name)
                .map(|capture| capture.as_str().to_string())
                .unwrap_or_default();
            if !named.iter().any(|(label, _)| label == name) {
                named.push((name.clone(), value));
            }
        }

        let mut groups = named
            .iter()
            .map(|(label, value)| RegexGroup {
                label: label.clone(),
                value: value.clone(),
                group_type: "named".to_string(),
            })
            .collect::<Vec<_>>();
        groups.extend(indexed.iter().enumerate().map(|(index, value)| RegexGroup {
            label: format!("${}", index + 1),
            value: value.clone().unwrap_or_default(),
            group_type: "indexed".to_string(),
        }));

        matches.push(RegexMatch {
            index: byte_to_js_index(text, start),
            end: byte_to_js_index(text, end),
            text: match_text.to_string(),
            groups,
        });
        snapshots.push(CaptureSnapshot {
            start,
            end,
            text: match_text.to_string(),
            indexed,
            named,
        });

        text_cursor = end;
        if !global {
            break;
        }
        match_cursor = if end > start {
            end
        } else {
            next_char_boundary(text, end)
        };
        if match_cursor > text.len() {
            break;
        }
    }

    push_plain_regex_part(&mut highlights, &text[text_cursor..]);
    let replace_output = render_replacement_output(text, replacement, global, &snapshots);
    let group_count = matches.first().map(|item| item.groups.len()).unwrap_or(0);

    Ok(RegexResult {
        ok: true,
        flags: flags.to_string(),
        expression: String::new(),
        matches,
        highlights,
        group_count,
        replace_output,
        state: "Valid".to_string(),
        error: None,
        engine: "Rust fancy-regex".to_string(),
    })
}

fn parse_regex_pattern(pattern: &str, flags: &[String]) -> ParsedRegexInput {
    let trimmed = pattern.trim();
    if trimmed.starts_with('/') {
        if let Some((body, inline_flags)) = split_regex_literal(trimmed) {
            let mut merged = flags.to_vec();
            merged.extend(inline_flags.chars().map(|flag| flag.to_string()));
            return ParsedRegexInput {
                pattern: body,
                flags: merged,
            };
        }
    }
    ParsedRegexInput {
        pattern: pattern.to_string(),
        flags: flags.to_vec(),
    }
}

fn split_regex_literal(value: &str) -> Option<(String, String)> {
    let mut escaped = false;
    for (index, character) in value.char_indices().skip(1) {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '/' {
            let flags = &value[index + 1..];
            if flags
                .chars()
                .all(|flag| matches!(flag, 'g' | 'i' | 'm' | 's' | 'u' | 'x'))
            {
                return Some((value[1..index].to_string(), flags.to_string()));
            }
            return None;
        }
    }
    None
}

fn normalize_regex_flags(flags: &[String]) -> String {
    let mut seen = HashSet::new();
    ["g", "i", "m", "s", "u", "x"]
        .into_iter()
        .filter(|flag| {
            flags
                .iter()
                .any(|item| item.chars().any(|candidate| candidate.to_string() == *flag))
                && seen.insert(*flag)
        })
        .collect::<Vec<_>>()
        .join("")
}

fn compile_regex(pattern: &str, flags: &str) -> Result<Regex, String> {
    RegexBuilder::new(pattern)
        .case_insensitive(flags.contains('i'))
        .multi_line(flags.contains('m'))
        .dot_matches_new_line(flags.contains('s'))
        .ignore_whitespace(flags.contains('x'))
        .unicode_mode(true)
        .backtrack_limit(2_000_000)
        .build()
        .map_err(|error| format!("正则编译失败：{error}"))
}

fn render_replacement_output(
    text: &str,
    replacement: &str,
    global: bool,
    matches: &[CaptureSnapshot],
) -> String {
    if matches.is_empty() {
        return text.to_string();
    }

    let mut output = String::new();
    let mut cursor = 0usize;
    for snapshot in matches {
        output.push_str(&text[cursor..snapshot.start]);
        output.push_str(&render_replacement_template(replacement, snapshot));
        cursor = snapshot.end;
        if !global {
            break;
        }
    }
    output.push_str(&text[cursor..]);
    output
}

fn render_replacement_template(template: &str, snapshot: &CaptureSnapshot) -> String {
    let mut output = String::new();
    let mut chars = template.chars().peekable();
    while let Some(character) = chars.next() {
        if character != '$' {
            output.push(character);
            continue;
        }

        match chars.peek().copied() {
            Some('$') => {
                chars.next();
                output.push('$');
            }
            Some('&') => {
                chars.next();
                output.push_str(&snapshot.text);
            }
            Some('<') => {
                chars.next();
                let mut name = String::new();
                while let Some(next) = chars.next() {
                    if next == '>' {
                        break;
                    }
                    name.push(next);
                }
                if let Some((_, value)) = snapshot.named.iter().find(|(label, _)| *label == name) {
                    output.push_str(value);
                }
            }
            Some('{') => {
                chars.next();
                let mut name = String::new();
                while let Some(next) = chars.next() {
                    if next == '}' {
                        break;
                    }
                    name.push(next);
                }
                push_replacement_reference(&mut output, &name, snapshot);
            }
            Some(next) if next.is_ascii_digit() => {
                let mut number = String::new();
                while let Some(next) = chars.peek().copied() {
                    if !next.is_ascii_digit() {
                        break;
                    }
                    number.push(next);
                    chars.next();
                }
                if let Ok(index) = number.parse::<usize>() {
                    if index > 0 {
                        if let Some(Some(value)) = snapshot.indexed.get(index - 1) {
                            output.push_str(value);
                        }
                    }
                }
            }
            Some(next) if next == '_' || next.is_ascii_alphabetic() => {
                let mut name = String::new();
                while let Some(next) = chars.peek().copied() {
                    if !(next == '_' || next.is_ascii_alphanumeric()) {
                        break;
                    }
                    name.push(next);
                    chars.next();
                }
                push_replacement_reference(&mut output, &name, snapshot);
            }
            _ => output.push('$'),
        }
    }
    output
}

fn push_replacement_reference(output: &mut String, name: &str, snapshot: &CaptureSnapshot) {
    if let Ok(index) = name.parse::<usize>() {
        if index == 0 {
            output.push_str(&snapshot.text);
        } else if let Some(Some(value)) = snapshot.indexed.get(index - 1) {
            output.push_str(value);
        }
        return;
    }
    if let Some((_, value)) = snapshot.named.iter().find(|(label, _)| label == name) {
        output.push_str(value);
    }
}

fn push_plain_regex_part(parts: &mut Vec<RegexHighlightPart>, text: &str) {
    if text.is_empty() {
        return;
    }
    if let Some(previous) = parts.last_mut() {
        if !previous.match_ {
            previous.text.push_str(text);
            return;
        }
    }
    parts.push(RegexHighlightPart {
        text: text.to_string(),
        match_: false,
        match_index: None,
    });
}

fn byte_to_js_index(text: &str, byte_offset: usize) -> usize {
    text[..byte_offset.min(text.len())]
        .chars()
        .map(char::len_utf16)
        .sum()
}

fn next_char_boundary(text: &str, byte_offset: usize) -> usize {
    if byte_offset >= text.len() {
        return text.len() + 1;
    }
    text[byte_offset..]
        .char_indices()
        .nth(1)
        .map(|(offset, _)| byte_offset + offset)
        .unwrap_or(text.len())
}

fn list_applications_blocking(query: String) -> Result<Vec<ApplicationEntry>, String> {
    let normalized_query = normalize_search_text(&query);
    let mut entries = Vec::new();
    entries.extend(scan_application_directories(&normalized_query));
    entries.extend(search_applications_with_mdfind(&normalized_query));
    Ok(sort_and_deduplicate_applications(
        entries,
        &normalized_query,
    ))
}

fn search_applications_with_mdfind(normalized_query: &str) -> Vec<ApplicationEntry> {
    if !cfg!(target_os = "macos") {
        return Vec::new();
    }

    let predicate = if normalized_query.is_empty() {
        "kMDItemContentType == 'com.apple.application-bundle'".to_string()
    } else {
        let escaped_query = normalized_query.replace('\'', "\\'");
        format!(
            "kMDItemContentType == 'com.apple.application-bundle' && kMDItemDisplayName == '*{}*'cd",
            escaped_query
        )
    };

    let output = match Command::new("mdfind").arg(predicate).output() {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| application_entry_from_path(Path::new(line.trim()), "spotlight"))
        .filter(|entry| application_matches_query(entry, normalized_query))
        .collect()
}

fn scan_application_directories(normalized_query: &str) -> Vec<ApplicationEntry> {
    application_search_roots()
        .into_iter()
        .flat_map(|root| scan_application_directory(&root, normalized_query, 8))
        .collect()
}

fn application_search_roots() -> Vec<PathBuf> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        roots.push(home.join("Applications"));
        roots.push(home.join("Library/Application Support/JetBrains/Toolbox/apps"));
    }
    roots
}

fn scan_application_directory(
    root: &Path,
    normalized_query: &str,
    max_depth: usize,
) -> Vec<ApplicationEntry> {
    if is_application_bundle(root) {
        return application_entry_from_path(root, "filesystem")
            .filter(|entry| application_matches_query(entry, normalized_query))
            .into_iter()
            .collect();
    }
    if max_depth == 0 || !root.is_dir() {
        return Vec::new();
    }

    let Ok(read_dir) = fs::read_dir(root) else {
        return Vec::new();
    };

    let mut entries = Vec::new();
    for item in read_dir.flatten() {
        let path = item.path();
        if is_application_bundle(&path) {
            if let Some(entry) = application_entry_from_path(&path, "filesystem") {
                if application_matches_query(&entry, normalized_query) {
                    entries.push(entry);
                }
            }
            continue;
        }

        if path.is_dir() {
            entries.extend(scan_application_directory(
                &path,
                normalized_query,
                max_depth - 1,
            ));
        }
    }
    entries
}

fn sort_and_deduplicate_applications(
    entries: Vec<ApplicationEntry>,
    normalized_query: &str,
) -> Vec<ApplicationEntry> {
    let mut seen = HashSet::new();
    let mut deduplicated = entries
        .into_iter()
        .filter(|entry| seen.insert(entry.path.clone()))
        .collect::<Vec<_>>();

    deduplicated.sort_by(|left, right| {
        application_score(right, normalized_query)
            .cmp(&application_score(left, normalized_query))
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.path.cmp(&right.path))
    });
    deduplicated.truncate(APPLICATION_RESULT_LIMIT);
    deduplicated
}

fn application_entry_from_path(path: &Path, source: &str) -> Option<ApplicationEntry> {
    if !is_application_bundle(path) {
        return None;
    }
    let bundle_name = path.file_stem()?.to_string_lossy().trim().to_string();
    let metadata = read_application_metadata(path);
    let fallback_name = metadata
        .display_names
        .iter()
        .find(|candidate| !candidate.trim().is_empty())
        .cloned()
        .unwrap_or(bundle_name.clone());
    let localized_name =
        localized_application_name(&bundle_name, &metadata).unwrap_or(fallback_name);
    if localized_name.is_empty() {
        return None;
    }
    let icon_path = resolve_application_icon_path(path, &metadata);
    let path_text = path.to_string_lossy().to_string();
    let aliases = build_application_aliases(&path_text, &bundle_name, &metadata);
    Some(ApplicationEntry {
        id: path_text.clone(),
        name: localized_name.clone(),
        localized_name,
        display_path: path_text.clone(),
        path: path_text,
        source: source.to_string(),
        aliases,
        icon_path: icon_path.map(|path| path.to_string_lossy().to_string()),
    })
}

fn is_application_bundle(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("app"))
}

fn application_matches_query(entry: &ApplicationEntry, normalized_query: &str) -> bool {
    if normalized_query.is_empty() {
        return true;
    }
    application_search_values(entry)
        .into_iter()
        .any(|value| normalize_search_text(&value).contains(normalized_query))
}

fn application_score(entry: &ApplicationEntry, normalized_query: &str) -> i32 {
    if normalized_query.is_empty() {
        return 1;
    }
    application_search_values(entry)
        .into_iter()
        .map(|value| {
            let normalized = normalize_search_text(&value);
            if normalized == normalized_query {
                100
            } else if normalized.starts_with(normalized_query) {
                80
            } else if normalized.contains(normalized_query) {
                60
            } else {
                0
            }
        })
        .max()
        .unwrap_or(0)
}

fn application_search_values(entry: &ApplicationEntry) -> Vec<String> {
    let mut values = vec![
        entry.name.clone(),
        entry.path.clone(),
        entry.display_path.clone(),
    ];
    values.extend(entry.aliases.iter().cloned());
    values
}

#[derive(Debug, Default)]
struct ApplicationMetadata {
    display_names: Vec<String>,
    bundle_identifier: Option<String>,
    executable: Option<String>,
    icon_file: Option<String>,
}

fn read_application_metadata(path: &Path) -> ApplicationMetadata {
    let mut metadata = ApplicationMetadata::default();
    let info_plist = path.join("Contents/Info.plist");
    if let Some(contents) = read_text_file_lossy(&info_plist) {
        for key in ["CFBundleDisplayName", "CFBundleName"] {
            if let Some(value) = read_plist_string_value(&contents, key) {
                push_unique_string(&mut metadata.display_names, value);
            }
        }
        metadata.bundle_identifier = read_plist_string_value(&contents, "CFBundleIdentifier");
        metadata.executable = read_plist_string_value(&contents, "CFBundleExecutable");
        metadata.icon_file = read_plist_string_value(&contents, "CFBundleIconFile");
    }

    let resources = path.join("Contents/Resources");
    if let Ok(entries) = fs::read_dir(resources) {
        for entry in entries.flatten() {
            let lproj = entry.path();
            if !lproj
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("lproj"))
            {
                continue;
            }
            let strings_path = lproj.join("InfoPlist.strings");
            if let Some(contents) = read_text_file_lossy(&strings_path) {
                for key in ["CFBundleDisplayName", "CFBundleName"] {
                    if let Some(value) = read_info_plist_strings_value(&contents, key) {
                        push_unique_string(&mut metadata.display_names, value);
                    }
                }
            }
        }
    }

    metadata
}

fn read_plist_string_value(contents: &str, key: &str) -> Option<String> {
    let marker = format!("<key>{key}</key>");
    let key_index = contents.find(&marker)?;
    let after_key = &contents[key_index + marker.len()..];
    let start_marker = "<string>";
    let start = after_key.find(start_marker)? + start_marker.len();
    let after_start = &after_key[start..];
    let end = after_start.find("</string>")?;
    Some(
        decode_xml_entities(after_start[..end].trim())
            .trim()
            .to_string(),
    )
    .filter(|value| !value.is_empty())
}

fn read_text_file_lossy(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return Some(decode_utf16_bytes(&bytes[2..], true));
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return Some(decode_utf16_bytes(&bytes[2..], false));
    }
    Some(String::from_utf8_lossy(&bytes).to_string())
}

fn decode_utf16_bytes(bytes: &[u8], big_endian: bool) -> String {
    let units = bytes.chunks_exact(2).map(|chunk| {
        if big_endian {
            u16::from_be_bytes([chunk[0], chunk[1]])
        } else {
            u16::from_le_bytes([chunk[0], chunk[1]])
        }
    });
    char::decode_utf16(units)
        .map(|item| item.unwrap_or(char::REPLACEMENT_CHARACTER))
        .collect()
}

fn read_info_plist_strings_value(contents: &str, key: &str) -> Option<String> {
    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.starts_with("/*") || line.starts_with("//") || line.is_empty() {
            continue;
        }
        let Some((left, right)) = line.split_once('=') else {
            continue;
        };
        if unquote_strings_value(left.trim()) != key {
            continue;
        }
        let value = right.trim().trim_end_matches(';').trim();
        let value = unquote_strings_value(value);
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

fn localized_application_name(bundle_name: &str, metadata: &ApplicationMetadata) -> Option<String> {
    for value in
        builtin_application_localized_names(bundle_name, metadata.bundle_identifier.as_deref())
    {
        return Some(value.to_string());
    }

    metadata
        .display_names
        .iter()
        .find(|value| contains_cjk(value))
        .cloned()
}

fn builtin_application_localized_names<'a>(
    bundle_name: &str,
    bundle_identifier: Option<&str>,
) -> Vec<&'a str> {
    let normalized_name = normalize_search_text(bundle_name);
    let normalized_identifier = bundle_identifier
        .map(normalize_search_text)
        .unwrap_or_default();
    let mut names = Vec::new();

    let mut add_if_matches = |bundle_names: &[&str], identifiers: &[&str], value: &'a str| {
        let name_matches = bundle_names.iter().any(|name| normalized_name == *name);
        let identifier_matches = identifiers
            .iter()
            .any(|identifier| normalized_identifier == *identifier);
        if name_matches || identifier_matches {
            names.push(value);
        }
    };

    add_if_matches(&["calendar"], &["com.apple.ical"], "日历");
    add_if_matches(&["mail"], &["com.apple.mail"], "邮件");
    add_if_matches(&["notes"], &["com.apple.notes"], "备忘录");
    add_if_matches(&["reminders"], &["com.apple.reminders"], "提醒事项");
    add_if_matches(&["photos"], &["com.apple.photos"], "照片");
    add_if_matches(&["messages"], &["com.apple.messages"], "信息");
    add_if_matches(&["maps"], &["com.apple.maps"], "地图");
    add_if_matches(&["music"], &["com.apple.music"], "音乐");
    add_if_matches(
        &["activity monitor"],
        &["com.apple.activitymonitor"],
        "活动监视器",
    );
    add_if_matches(&["terminal"], &["com.apple.terminal"], "终端");
    add_if_matches(
        &["system settings", "system preferences"],
        &["com.apple.systempreferences"],
        "系统设置",
    );

    names
}

fn contains_cjk(value: &str) -> bool {
    value.chars().any(|character| {
        matches!(
            character,
            '\u{3400}'..='\u{4DBF}'
                | '\u{4E00}'..='\u{9FFF}'
                | '\u{F900}'..='\u{FAFF}'
        )
    })
}

fn resolve_application_icon_path(path: &Path, metadata: &ApplicationMetadata) -> Option<PathBuf> {
    let resources = path.join("Contents/Resources");
    if let Some(icon_file) = &metadata.icon_file {
        let icon_path = resources.join(ensure_icns_extension(icon_file));
        if icon_path.is_file() {
            return Some(icon_path);
        }
    }

    for candidate in ["AppIcon.icns", "app.icns", "Application.icns"] {
        let icon_path = resources.join(candidate);
        if icon_path.is_file() {
            return Some(icon_path);
        }
    }

    let read_dir = fs::read_dir(resources).ok()?;
    read_dir
        .flatten()
        .map(|entry| entry.path())
        .find(|candidate| is_icns_file(candidate))
}

fn ensure_icns_extension(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.to_lowercase().ends_with(".icns") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.icns")
    }
}

fn application_icon_data_url_blocking(path: PathBuf) -> Result<Option<String>, String> {
    let icon_path = if is_application_bundle(&path) {
        let metadata = read_application_metadata(&path);
        match resolve_application_icon_path(&path, &metadata) {
            Some(icon_path) => icon_path,
            None => return Ok(None),
        }
    } else if is_icns_file(&path) {
        path
    } else {
        return Err("只能读取 .app 或 .icns 图标".to_string());
    };

    if !icon_path.is_file() {
        return Ok(None);
    }

    let mut output_path = std::env::temp_dir();
    let output_name = format!(
        "devforge-app-icon-{}-{}.png",
        std::process::id(),
        sanitize_temp_file_part(&icon_path.to_string_lossy())
    );
    output_path.push(output_name);

    let output = Command::new("sips")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg("--resampleHeightWidthMax")
        .arg("128")
        .arg(&icon_path)
        .arg("--out")
        .arg(&output_path)
        .output()
        .map_err(|error| format!("无法执行 sips：{error}"))?;

    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        return Ok(None);
    }

    let bytes = fs::read(&output_path).map_err(|error| format!("读取应用图标失败：{error}"))?;
    let _ = fs::remove_file(&output_path);
    if bytes.is_empty() {
        return Ok(None);
    }
    Ok(Some(format!(
        "data:image/png;base64,{}",
        encode_base64(&bytes)
    )))
}

#[cfg(target_os = "macos")]
fn capture_screen_selection_blocking() -> Result<Option<String>, String> {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?
        .as_nanos();
    let output_path = std::env::temp_dir().join(format!(
        "devforge-2fa-screen-selection-{}-{unique}.png",
        std::process::id()
    ));

    let output = Command::new("screencapture")
        .args(["-i", "-s", "-x"])
        .arg(&output_path)
        .output()
        .map_err(|error| format!("无法启动系统截屏：{error}"))?;

    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        if output.stderr.is_empty() {
            return Ok(None);
        }
        let error_text = String::from_utf8_lossy(&output.stderr);
        if error_text.to_lowercase().contains("cancel") {
            return Ok(None);
        }
        return Err("截屏失败，请确认已授予屏幕录制权限".to_string());
    }

    if !output_path.is_file() {
        return Ok(None);
    }

    let bytes = fs::read(&output_path).map_err(|error| format!("读取截屏失败：{error}"))?;
    let _ = fs::remove_file(&output_path);
    if bytes.is_empty() {
        return Ok(None);
    }
    Ok(Some(format!(
        "data:image/png;base64,{}",
        encode_base64(&bytes)
    )))
}

fn is_icns_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("icns"))
}

fn sanitize_temp_file_part(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(96)
        .collect()
}

fn encode_base64(bytes: &[u8]) -> String {
    general_purpose::STANDARD.encode(bytes)
}

fn unquote_strings_value(value: &str) -> String {
    let trimmed = value.trim();
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(trimmed);
    unescape_strings_value(unquoted)
}

fn unescape_strings_value(value: &str) -> String {
    let mut output = String::new();
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            match character {
                'n' => output.push('\n'),
                'r' => output.push('\r'),
                't' => output.push('\t'),
                '"' => output.push('"'),
                '\\' => output.push('\\'),
                other => output.push(other),
            }
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else {
            output.push(character);
        }
    }
    if escaped {
        output.push('\\');
    }
    output
}

fn decode_xml_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn build_application_aliases(
    path: &str,
    bundle_name: &str,
    metadata: &ApplicationMetadata,
) -> Vec<String> {
    let mut aliases = Vec::new();
    push_unique_string(&mut aliases, bundle_name.to_string());
    for name in &metadata.display_names {
        push_unique_string(&mut aliases, name.clone());
    }
    if let Some(identifier) = &metadata.bundle_identifier {
        push_unique_string(&mut aliases, identifier.clone());
    }
    if let Some(executable) = &metadata.executable {
        push_unique_string(&mut aliases, executable.clone());
    }
    for alias in
        builtin_application_aliases(path, bundle_name, metadata.bundle_identifier.as_deref())
    {
        push_unique_string(&mut aliases, alias.to_string());
    }
    let names = aliases.clone();
    for name in names {
        for alias in pinyin_search_aliases(&name) {
            push_unique_string(&mut aliases, alias);
        }
    }
    aliases
}

fn builtin_application_aliases<'a>(
    path: &str,
    bundle_name: &str,
    bundle_identifier: Option<&str>,
) -> Vec<&'a str> {
    let normalized_name = normalize_search_text(bundle_name);
    let normalized_path = normalize_search_text(path);
    let normalized_identifier = bundle_identifier
        .map(normalize_search_text)
        .unwrap_or_default();
    let mut aliases = Vec::new();

    let mut add_if_matches = |names: &[&str], identifiers: &[&str], values: &[&'a str]| {
        let name_matches = names.iter().any(|name| {
            normalized_name == *name || normalized_path.ends_with(&format!("/{name}.app"))
        });
        let identifier_matches = identifiers
            .iter()
            .any(|identifier| normalized_identifier == *identifier);
        if name_matches || identifier_matches {
            aliases.extend(values.iter().copied());
        }
    };

    add_if_matches(&["calendar"], &["com.apple.ical"], &["日历", "Calendar"]);
    add_if_matches(&["safari"], &["com.apple.safari"], &["Safari", "浏览器"]);
    add_if_matches(&["mail"], &["com.apple.mail"], &["邮件", "Mail"]);
    add_if_matches(&["notes"], &["com.apple.notes"], &["备忘录", "Notes"]);
    add_if_matches(
        &["reminders"],
        &["com.apple.reminders"],
        &["提醒事项", "Reminders"],
    );
    add_if_matches(&["photos"], &["com.apple.photos"], &["照片", "Photos"]);
    add_if_matches(
        &["messages"],
        &["com.apple.messages"],
        &["信息", "Messages"],
    );
    add_if_matches(&["maps"], &["com.apple.maps"], &["地图", "Maps"]);
    add_if_matches(&["music"], &["com.apple.music"], &["音乐", "Music"]);
    add_if_matches(
        &["activity monitor"],
        &["com.apple.activitymonitor"],
        &["活动监视器", "Activity Monitor"],
    );
    add_if_matches(
        &["terminal"],
        &["com.apple.terminal"],
        &["终端", "Terminal"],
    );
    add_if_matches(
        &["system settings", "system preferences"],
        &["com.apple.systempreferences"],
        &["系统设置", "System Settings", "系统偏好设置"],
    );
    add_if_matches(
        &["pycharm"],
        &["com.jetbrains.pycharm"],
        &["PyCharm", "JetBrains"],
    );

    aliases
}

fn push_unique_string(values: &mut Vec<String>, value: String) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }
    if !values.iter().any(|existing| existing == trimmed) {
        values.push(trimmed.to_string());
    }
}

fn normalize_search_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn pinyin_search_aliases(value: &str) -> Vec<String> {
    if !contains_cjk(value) {
        return Vec::new();
    }

    let Some(spaced_pinyin) = transliterate_mandarin_to_latin(value) else {
        return Vec::new();
    };
    let spaced_pinyin = normalize_ascii_search_key(&spaced_pinyin);
    if spaced_pinyin.is_empty() {
        return Vec::new();
    }

    let compact_pinyin = spaced_pinyin.replace(' ', "");
    let mut aliases = Vec::new();
    push_unique_string(&mut aliases, spaced_pinyin);
    push_unique_string(&mut aliases, compact_pinyin);
    aliases
}

#[cfg(target_os = "macos")]
fn transliterate_mandarin_to_latin(value: &str) -> Option<String> {
    let source = CFString::from_str(value);
    let mutable = CFMutableString::new_copy(None, 0, Some(&source))?;
    let mandarin_transform = unsafe { kCFStringTransformMandarinLatin }?;
    let strip_marks_transform = unsafe { kCFStringTransformStripCombiningMarks }?;

    unsafe {
        if !CFMutableString::transform(
            Some(&mutable),
            std::ptr::null_mut(),
            Some(mandarin_transform),
            false,
        ) {
            return None;
        }
        let mut range = CFRange {
            location: 0,
            length: mutable.length(),
        };
        if !CFMutableString::transform(
            Some(&mutable),
            &mut range,
            Some(strip_marks_transform),
            false,
        ) {
            return None;
        }
    }

    Some(mutable.to_string())
}

#[cfg(not(target_os = "macos"))]
fn transliterate_mandarin_to_latin(_value: &str) -> Option<String> {
    None
}

fn normalize_ascii_search_key(value: &str) -> String {
    let mut output = String::new();
    let mut previous_was_space = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character.to_ascii_lowercase());
            previous_was_space = false;
        } else if !previous_was_space && !output.is_empty() {
            output.push(' ');
            previous_was_space = true;
        }
    }

    output.trim().to_string()
}

fn lookup_dns_blocking(domain: String, record_type: String) -> Result<DnsLookupResult, String> {
    let domain = normalize_dns_domain(&domain)?;
    let record_type = normalize_dns_record_type(&record_type)?;
    let started_at = Instant::now();
    let record_code = dns_record_code(&record_type)?;
    let resolvers = dns_resolvers();
    let mut errors = Vec::new();

    for resolver in resolvers {
        match query_dns_resolver(resolver, &domain, &record_type, record_code) {
            Ok(mut result) => {
                result.elapsed_ms = started_at.elapsed().as_millis().max(1);
                result.trace =
                    build_dns_trace(&result.resolver, result.records.len(), result.elapsed_ms);
                return Ok(result);
            }
            Err(error) => errors.push(format!("{resolver}: {error}")),
        }
    }

    Err(format!("DNS 查询失败：{}", errors.join("；")))
}

fn normalize_dns_domain(value: &str) -> Result<String, String> {
    let mut cleaned = value.trim().to_lowercase();
    if let Some(rest) = cleaned.strip_prefix("https://") {
        cleaned = rest.to_string();
    } else if let Some(rest) = cleaned.strip_prefix("http://") {
        cleaned = rest.to_string();
    }
    cleaned = cleaned
        .split('/')
        .next()
        .unwrap_or("")
        .trim_end_matches('.')
        .to_string();

    if cleaned.is_empty() {
        return Err("请输入域名".to_string());
    }
    if cleaned.len() > 253 {
        return Err("域名长度不能超过 253 个字符".to_string());
    }

    let valid = cleaned.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && label
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
            && !label.starts_with('-')
            && !label.ends_with('-')
    });
    if !valid {
        return Err("请输入有效域名，例如 devforge.app 或 api.example.com".to_string());
    }

    Ok(cleaned)
}

fn normalize_dns_record_type(value: &str) -> Result<String, String> {
    let record_type = value.trim().to_uppercase();
    if matches!(record_type.as_str(), "A" | "AAAA" | "CNAME" | "MX" | "TXT") {
        Ok(record_type)
    } else {
        Err("仅支持 A、AAAA、CNAME、MX、TXT 记录".to_string())
    }
}

fn dns_record_code(record_type: &str) -> Result<u16, String> {
    match record_type {
        "A" => Ok(1),
        "CNAME" => Ok(5),
        "MX" => Ok(15),
        "TXT" => Ok(16),
        "AAAA" => Ok(28),
        _ => Err("仅支持 A、AAAA、CNAME、MX、TXT 记录".to_string()),
    }
}

fn dns_type_name(record_code: u16) -> Option<&'static str> {
    match record_code {
        1 => Some("A"),
        5 => Some("CNAME"),
        15 => Some("MX"),
        16 => Some("TXT"),
        28 => Some("AAAA"),
        _ => None,
    }
}

fn dns_resolvers() -> Vec<IpAddr> {
    let mut resolvers = fs::read_to_string("/etc/resolv.conf")
        .map(|content| parse_resolv_conf_nameservers(&content))
        .unwrap_or_default();

    for fallback in FALLBACK_DNS_RESOLVERS {
        if let Ok(ip) = fallback.parse::<IpAddr>() {
            if !resolvers.contains(&ip) {
                resolvers.push(ip);
            }
        }
    }

    resolvers
}

fn parse_resolv_conf_nameservers(content: &str) -> Vec<IpAddr> {
    let mut resolvers = Vec::new();
    for line in content.lines() {
        let cleaned = line.split('#').next().unwrap_or("").trim();
        let mut parts = cleaned.split_whitespace();
        if parts.next() != Some("nameserver") {
            continue;
        }
        let Some(raw_addr) = parts.next() else {
            continue;
        };
        let addr = raw_addr.split('%').next().unwrap_or(raw_addr);
        if let Ok(ip) = addr.parse::<IpAddr>() {
            if !resolvers.contains(&ip) {
                resolvers.push(ip);
            }
        }
    }
    resolvers
}

fn query_dns_resolver(
    resolver: IpAddr,
    domain: &str,
    record_type: &str,
    record_code: u16,
) -> Result<DnsLookupResult, String> {
    let query_id = dns_query_id(domain, record_code);
    let query = build_dns_query(query_id, domain, record_code)?;
    let resolver_addr = SocketAddr::new(resolver, DNS_PORT);
    let mut response = query_dns_udp(resolver_addr, &query)?;

    if dns_response_is_truncated(&response)? {
        response = query_dns_tcp(resolver_addr, &query)?;
    }

    let resolver_name = resolver.to_string();
    let mut result = parse_dns_response(&response, record_type, &resolver_name, query_id)?;
    result.domain = domain.to_string();
    result.record_type = record_type.to_string();
    result.resolver = resolver_name;
    Ok(result)
}

fn dns_query_id(domain: &str, record_code: u16) -> u16 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u16;
    nanos ^ ((domain.len() as u16) << 8) ^ record_code
}

fn build_dns_query(query_id: u16, domain: &str, record_code: u16) -> Result<Vec<u8>, String> {
    let mut packet = Vec::with_capacity(512);
    packet.extend_from_slice(&query_id.to_be_bytes());
    packet.extend_from_slice(&0x0100u16.to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes());
    packet.extend_from_slice(&0u16.to_be_bytes());
    packet.extend_from_slice(&0u16.to_be_bytes());
    packet.extend_from_slice(&0u16.to_be_bytes());
    write_dns_name(&mut packet, domain)?;
    packet.extend_from_slice(&record_code.to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes());
    Ok(packet)
}

fn write_dns_name(packet: &mut Vec<u8>, domain: &str) -> Result<(), String> {
    for label in domain.split('.') {
        if label.is_empty() || label.len() > 63 {
            return Err("域名标签长度无效".to_string());
        }
        packet.push(label.len() as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.push(0);
    Ok(())
}

fn query_dns_udp(resolver: SocketAddr, query: &[u8]) -> Result<Vec<u8>, String> {
    let bind_addr = if resolver.is_ipv4() {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 0)
    } else {
        SocketAddr::new(IpAddr::V6(Ipv6Addr::UNSPECIFIED), 0)
    };
    let socket = UdpSocket::bind(bind_addr).map_err(|error| format!("UDP 初始化失败：{error}"))?;
    socket
        .set_read_timeout(Some(DNS_TIMEOUT))
        .map_err(|error| format!("UDP 超时设置失败：{error}"))?;
    socket
        .set_write_timeout(Some(DNS_TIMEOUT))
        .map_err(|error| format!("UDP 超时设置失败：{error}"))?;
    socket
        .send_to(query, resolver)
        .map_err(|error| format!("UDP 发送失败：{error}"))?;

    let mut buffer = vec![0u8; 4096];
    let (size, _) = socket
        .recv_from(&mut buffer)
        .map_err(|error| format!("UDP 接收失败：{error}"))?;
    buffer.truncate(size);
    Ok(buffer)
}

fn query_dns_tcp(resolver: SocketAddr, query: &[u8]) -> Result<Vec<u8>, String> {
    let mut stream = TcpStream::connect_timeout(&resolver, DNS_TIMEOUT)
        .map_err(|error| format!("TCP 连接失败：{error}"))?;
    stream
        .set_read_timeout(Some(DNS_TIMEOUT))
        .map_err(|error| format!("TCP 超时设置失败：{error}"))?;
    stream
        .set_write_timeout(Some(DNS_TIMEOUT))
        .map_err(|error| format!("TCP 超时设置失败：{error}"))?;

    let length = u16::try_from(query.len()).map_err(|_| "DNS 查询包过大".to_string())?;
    stream
        .write_all(&length.to_be_bytes())
        .and_then(|_| stream.write_all(query))
        .map_err(|error| format!("TCP 发送失败：{error}"))?;

    let mut length_bytes = [0u8; 2];
    stream
        .read_exact(&mut length_bytes)
        .map_err(|error| format!("TCP 响应长度读取失败：{error}"))?;
    let response_length = u16::from_be_bytes(length_bytes) as usize;
    let mut response = vec![0u8; response_length];
    stream
        .read_exact(&mut response)
        .map_err(|error| format!("TCP 响应读取失败：{error}"))?;
    Ok(response)
}

fn dns_response_is_truncated(packet: &[u8]) -> Result<bool, String> {
    if packet.len() < 4 {
        return Err("DNS 响应过短".to_string());
    }
    Ok(read_u16(packet, 2)? & 0x0200 != 0)
}

fn parse_dns_response(
    packet: &[u8],
    requested_type: &str,
    resolver: &str,
    query_id: u16,
) -> Result<DnsLookupResult, String> {
    if packet.len() < 12 {
        return Err("DNS 响应过短".to_string());
    }

    let response_id = read_u16(packet, 0)?;
    if response_id != query_id {
        return Err("DNS 响应 ID 不匹配".to_string());
    }

    let flags = read_u16(packet, 2)?;
    let rcode = flags & 0x000f;
    let qdcount = read_u16(packet, 4)? as usize;
    let ancount = read_u16(packet, 6)? as usize;
    let nscount = read_u16(packet, 8)? as usize;
    let arcount = read_u16(packet, 10)? as usize;
    let mut offset = 12;

    for _ in 0..qdcount {
        let _ = read_dns_name(packet, &mut offset)?;
        offset = offset
            .checked_add(4)
            .ok_or_else(|| "DNS 问题区偏移溢出".to_string())?;
        ensure_available(packet, offset, 0)?;
    }

    let mut records = Vec::new();
    for index in 0..(ancount + nscount + arcount) {
        let record = parse_dns_resource_record(packet, &mut offset, resolver)?;
        if index < ancount && record.record_type == requested_type {
            records.push(record);
        }
    }

    let status_text = if records.is_empty() {
        rcode_to_status_text(rcode).to_string()
    } else {
        "OK".to_string()
    };

    Ok(DnsLookupResult {
        domain: String::new(),
        record_type: requested_type.to_string(),
        records,
        trace: Vec::new(),
        elapsed_ms: 1,
        source: "system".to_string(),
        resolver: resolver.to_string(),
        status_text,
    })
}

fn parse_dns_resource_record(
    packet: &[u8],
    offset: &mut usize,
    resolver: &str,
) -> Result<DnsRecord, String> {
    let host = read_dns_name(packet, offset)?;
    ensure_available(packet, *offset, 10)?;
    let record_code = read_u16(packet, *offset)?;
    let ttl = read_u32(packet, *offset + 4)?;
    let rdlength = read_u16(packet, *offset + 8)? as usize;
    *offset += 10;
    ensure_available(packet, *offset, rdlength)?;

    let rdata_offset = *offset;
    let rdata_end = rdata_offset + rdlength;
    *offset = rdata_end;
    let record_type = dns_type_name(record_code).unwrap_or("UNKNOWN").to_string();
    let (value, priority) = parse_dns_record_value(packet, record_code, rdata_offset, rdlength)?;

    Ok(DnsRecord {
        record_type,
        host,
        value,
        ttl: Some(ttl),
        source: resolver.to_string(),
        priority,
    })
}

fn parse_dns_record_value(
    packet: &[u8],
    record_code: u16,
    offset: usize,
    length: usize,
) -> Result<(String, Option<u16>), String> {
    match record_code {
        1 => {
            ensure_available(packet, offset, 4)?;
            Ok((
                Ipv4Addr::new(
                    packet[offset],
                    packet[offset + 1],
                    packet[offset + 2],
                    packet[offset + 3],
                )
                .to_string(),
                None,
            ))
        }
        28 => {
            ensure_available(packet, offset, 16)?;
            let mut bytes = [0u8; 16];
            bytes.copy_from_slice(&packet[offset..offset + 16]);
            Ok((Ipv6Addr::from(bytes).to_string(), None))
        }
        5 => {
            let mut name_offset = offset;
            Ok((read_dns_name(packet, &mut name_offset)?, None))
        }
        15 => {
            ensure_available(packet, offset, 2)?;
            let priority = read_u16(packet, offset)?;
            let mut name_offset = offset + 2;
            Ok((read_dns_name(packet, &mut name_offset)?, Some(priority)))
        }
        16 => Ok((parse_dns_txt_value(packet, offset, length)?, None)),
        _ => Ok((String::new(), None)),
    }
}

fn parse_dns_txt_value(packet: &[u8], offset: usize, length: usize) -> Result<String, String> {
    ensure_available(packet, offset, length)?;
    let end = offset + length;
    let mut cursor = offset;
    let mut chunks = Vec::new();
    while cursor < end {
        let chunk_len = packet[cursor] as usize;
        cursor += 1;
        if cursor + chunk_len > end {
            return Err("TXT 记录长度无效".to_string());
        }
        chunks.push(String::from_utf8_lossy(&packet[cursor..cursor + chunk_len]).to_string());
        cursor += chunk_len;
    }
    Ok(chunks.join(""))
}

fn read_dns_name(packet: &[u8], offset: &mut usize) -> Result<String, String> {
    let mut labels = Vec::new();
    let mut cursor = *offset;
    let mut jumped = false;
    let mut jumps = 0;

    loop {
        ensure_available(packet, cursor, 1)?;
        let length = packet[cursor];

        if length & 0xc0 == 0xc0 {
            ensure_available(packet, cursor, 2)?;
            let pointer = (((length & 0x3f) as usize) << 8) | packet[cursor + 1] as usize;
            if pointer >= packet.len() {
                return Err("DNS 压缩指针越界".to_string());
            }
            if !jumped {
                *offset = cursor + 2;
            }
            cursor = pointer;
            jumped = true;
            jumps += 1;
            if jumps > 16 {
                return Err("DNS 压缩指针循环".to_string());
            }
            continue;
        }

        if length & 0xc0 != 0 {
            return Err("不支持的 DNS 标签编码".to_string());
        }

        cursor += 1;
        if length == 0 {
            if !jumped {
                *offset = cursor;
            }
            break;
        }

        let label_len = length as usize;
        ensure_available(packet, cursor, label_len)?;
        labels.push(String::from_utf8_lossy(&packet[cursor..cursor + label_len]).to_string());
        cursor += label_len;
    }

    Ok(labels.join("."))
}

fn read_u16(packet: &[u8], offset: usize) -> Result<u16, String> {
    ensure_available(packet, offset, 2)?;
    Ok(u16::from_be_bytes([packet[offset], packet[offset + 1]]))
}

fn read_u32(packet: &[u8], offset: usize) -> Result<u32, String> {
    ensure_available(packet, offset, 4)?;
    Ok(u32::from_be_bytes([
        packet[offset],
        packet[offset + 1],
        packet[offset + 2],
        packet[offset + 3],
    ]))
}

fn ensure_available(packet: &[u8], offset: usize, length: usize) -> Result<(), String> {
    if offset
        .checked_add(length)
        .is_some_and(|end| end <= packet.len())
    {
        Ok(())
    } else {
        Err("DNS 响应格式无效".to_string())
    }
}

fn rcode_to_status_text(rcode: u16) -> &'static str {
    match rcode {
        0 => "No Answer",
        1 => "Format Error",
        2 => "Server Failure",
        3 => "NXDOMAIN",
        4 => "Not Implemented",
        5 => "Refused",
        _ => "DNS Error",
    }
}

fn build_dns_trace(resolver: &str, record_count: usize, elapsed_ms: u128) -> Vec<DnsTraceStep> {
    vec![
        DnsTraceStep {
            name: "backend".to_string(),
            value: "native DNS".to_string(),
        },
        DnsTraceStep {
            name: "resolver".to_string(),
            value: resolver.to_string(),
        },
        DnsTraceStep {
            name: "answer".to_string(),
            value: format!("{record_count} 项"),
        },
        DnsTraceStep {
            name: "elapsed".to_string(),
            value: format!("{elapsed_ms}ms"),
        },
    ]
}

fn get_local_network_ip_blocking() -> Result<LocalNetworkIpInfo, String> {
    #[cfg(target_os = "macos")]
    {
        let hardware_ports = read_macos_hardware_ports();
        let default_interface = read_default_route_interface();
        let ifconfig_output = Command::new("ifconfig")
            .output()
            .map_err(|error| format!("无法执行 ifconfig：{error}"))?;
        let interfaces =
            parse_ifconfig_interfaces(&String::from_utf8_lossy(&ifconfig_output.stdout));

        if let Some(interface_name) = default_interface.as_deref() {
            if let Some(info) = build_local_network_ip_info(
                interface_name,
                true,
                interfaces.iter().find(|item| item.name == interface_name),
                &hardware_ports,
            ) {
                return Ok(info);
            }
        }

        if let Some(info) = interfaces
            .iter()
            .filter(|interface| interface.is_usable_local_ipv4())
            .filter_map(|interface| {
                build_local_network_ip_info(
                    &interface.name,
                    default_interface.as_deref() == Some(interface.name.as_str()),
                    Some(interface),
                    &hardware_ports,
                )
            })
            .min_by_key(|info| match info.connection_type.as_str() {
                "wifi" => 0,
                "ethernet" => 1,
                _ => 2,
            })
        {
            return Ok(info);
        }

        Ok(unavailable_local_network_ip_info(
            "未识别到 active 的 Wi-Fi 或有线 IPv4",
            "system",
        ))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(unavailable_local_network_ip_info(
            "当前平台暂不支持读取本机网卡 IP",
            "unsupported",
        ))
    }
}

fn unavailable_local_network_ip_info(status_text: &str, source: &str) -> LocalNetworkIpInfo {
    LocalNetworkIpInfo {
        ip: "--".to_string(),
        interface_name: "--".to_string(),
        connection_type: "unavailable".to_string(),
        hardware_port: "--".to_string(),
        mac_address: "--".to_string(),
        netmask: "--".to_string(),
        broadcast: "--".to_string(),
        is_default_route: false,
        source: source.to_string(),
        updated_at: local_time_text(),
        status_text: status_text.to_string(),
    }
}

fn local_time_text() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HardwarePortInfo {
    hardware_port: String,
    mac_address: String,
    connection_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct IfconfigInterface {
    name: String,
    is_active: bool,
    ip: Option<String>,
    netmask: Option<String>,
    broadcast: Option<String>,
    mac_address: Option<String>,
}

impl IfconfigInterface {
    fn is_usable_local_ipv4(&self) -> bool {
        self.is_active
            && !is_ignored_interface_name(&self.name)
            && self
                .ip
                .as_deref()
                .is_some_and(|ip| !ip.starts_with("127.") && !ip.starts_with("169.254."))
    }
}

fn build_local_network_ip_info(
    interface_name: &str,
    is_default_route: bool,
    interface: Option<&IfconfigInterface>,
    hardware_ports: &HashMap<String, HardwarePortInfo>,
) -> Option<LocalNetworkIpInfo> {
    let interface = interface?;
    if !interface.is_usable_local_ipv4() {
        return None;
    }
    let hardware = hardware_ports.get(interface_name);
    let connection_type = hardware
        .map(|item| item.connection_type.as_str())
        .unwrap_or("unknown");
    if connection_type == "unknown" && !looks_like_physical_interface(interface_name) {
        return None;
    }

    Some(LocalNetworkIpInfo {
        ip: interface.ip.clone().unwrap_or_else(|| "--".to_string()),
        interface_name: interface.name.clone(),
        connection_type: connection_type.to_string(),
        hardware_port: hardware
            .map(|item| item.hardware_port.clone())
            .unwrap_or_else(|| "未知网卡".to_string()),
        mac_address: hardware
            .map(|item| item.mac_address.clone())
            .or_else(|| interface.mac_address.clone())
            .unwrap_or_else(|| "--".to_string()),
        netmask: interface
            .netmask
            .clone()
            .unwrap_or_else(|| "--".to_string()),
        broadcast: interface
            .broadcast
            .clone()
            .unwrap_or_else(|| "--".to_string()),
        is_default_route,
        source: "system".to_string(),
        updated_at: local_time_text(),
        status_text: if is_default_route {
            "默认出口网卡".to_string()
        } else {
            "默认路由不可用，使用 active 网卡".to_string()
        },
    })
}

#[cfg(target_os = "macos")]
fn read_default_route_interface() -> Option<String> {
    let output = Command::new("route")
        .args(["-n", "get", "default"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_default_route_interface(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "macos")]
fn read_macos_hardware_ports() -> HashMap<String, HardwarePortInfo> {
    let output = match Command::new("networksetup")
        .arg("-listallhardwareports")
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return HashMap::new(),
    };
    parse_macos_hardware_ports(&String::from_utf8_lossy(&output.stdout))
}

fn parse_default_route_interface(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let (key, value) = line.trim().split_once(':')?;
        (key.trim() == "interface").then(|| value.trim().to_string())
    })
}

fn parse_macos_hardware_ports(output: &str) -> HashMap<String, HardwarePortInfo> {
    let mut ports = HashMap::new();
    let mut hardware_port = String::new();
    let mut device = String::new();
    let mut mac_address = String::new();

    for line in output.lines().chain(std::iter::once("")) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !device.is_empty() {
                let connection_type = classify_hardware_port(&hardware_port);
                ports.insert(
                    device.clone(),
                    HardwarePortInfo {
                        hardware_port: hardware_port.clone(),
                        mac_address: if mac_address.is_empty() {
                            "--".to_string()
                        } else {
                            mac_address.clone()
                        },
                        connection_type,
                    },
                );
            }
            hardware_port.clear();
            device.clear();
            mac_address.clear();
            continue;
        }

        if let Some(value) = trimmed.strip_prefix("Hardware Port:") {
            hardware_port = value.trim().to_string();
        } else if let Some(value) = trimmed.strip_prefix("Device:") {
            device = value.trim().to_string();
        } else if let Some(value) = trimmed.strip_prefix("Ethernet Address:") {
            mac_address = value.trim().to_string();
        }
    }

    ports
}

fn classify_hardware_port(value: &str) -> String {
    let lowered = value.to_ascii_lowercase();
    if lowered.contains("wi-fi") || lowered.contains("wifi") || lowered.contains("airport") {
        "wifi".to_string()
    } else if lowered.contains("ethernet")
        || lowered.contains("lan")
        || lowered.contains("thunderbolt")
        || lowered.contains("usb")
    {
        "ethernet".to_string()
    } else {
        "unknown".to_string()
    }
}

fn parse_ifconfig_interfaces(output: &str) -> Vec<IfconfigInterface> {
    let mut interfaces = Vec::new();
    let mut current: Option<IfconfigInterface> = None;

    for line in output.lines() {
        if !line.starts_with('\t') && !line.starts_with(' ') && line.contains(": flags=") {
            if let Some(interface) = current.take() {
                interfaces.push(interface);
            }
            let name = line.split(':').next().unwrap_or_default().to_string();
            let flags = line
                .split("flags=")
                .nth(1)
                .and_then(|value| value.split('<').nth(1))
                .and_then(|value| value.split('>').next())
                .unwrap_or_default();
            current = Some(IfconfigInterface {
                name,
                is_active: flags.split(',').any(|flag| flag == "UP")
                    && flags.split(',').any(|flag| flag == "RUNNING"),
                ip: None,
                netmask: None,
                broadcast: None,
                mac_address: None,
            });
            continue;
        }

        if let Some(interface) = current.as_mut() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("inet ") {
                let columns: Vec<&str> = rest.split_whitespace().collect();
                if let Some(ip) = columns.first() {
                    interface.ip = Some((*ip).to_string());
                }
                if let Some(index) = columns.iter().position(|column| *column == "netmask") {
                    interface.netmask = columns.get(index + 1).map(|value| (*value).to_string());
                }
                if let Some(index) = columns.iter().position(|column| *column == "broadcast") {
                    interface.broadcast = columns.get(index + 1).map(|value| (*value).to_string());
                }
            } else if let Some(value) = trimmed.strip_prefix("ether ") {
                interface.mac_address = value
                    .split_whitespace()
                    .next()
                    .map(|value| value.to_string());
            } else if trimmed == "status: inactive" {
                interface.is_active = false;
            }
        }
    }

    if let Some(interface) = current {
        interfaces.push(interface);
    }
    interfaces
}

fn is_ignored_interface_name(name: &str) -> bool {
    name == "lo0"
        || name.starts_with("utun")
        || name.starts_with("awdl")
        || name.starts_with("llw")
        || name.starts_with("bridge")
        || name.starts_with("gif")
        || name.starts_with("stf")
}

fn looks_like_physical_interface(name: &str) -> bool {
    name.starts_with("en")
}

fn scan_lsof(args: &[&str], protocol: &str) -> Result<Vec<PortEntry>, String> {
    let output = Command::new("lsof")
        .args(args)
        .output()
        .map_err(|error| format!("无法执行 lsof：{error}"))?;

    if !output.status.success() && output.stdout.is_empty() {
        return Ok(Vec::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_lsof_output(&text, protocol))
}

fn parse_lsof_output(output: &str, protocol: &str) -> Vec<PortEntry> {
    output
        .lines()
        .skip(1)
        .filter_map(|line| parse_lsof_line(line, protocol))
        .collect()
}

fn parse_lsof_line(line: &str, protocol_hint: &str) -> Option<PortEntry> {
    let columns: Vec<&str> = line.split_whitespace().collect();
    if columns.len() < 9 {
        return None;
    }

    let process = unescape_process_name(columns[0]);
    let pid = columns.get(1)?.parse::<u32>().ok()?;
    let protocol_index = columns
        .iter()
        .position(|column| *column == "TCP" || *column == "UDP")?;
    let protocol = columns.get(protocol_index)?.to_string();
    if protocol != protocol_hint {
        return None;
    }

    let name = columns.get(protocol_index + 1..)?.join(" ");
    let (address, port, status) = parse_lsof_name(&name, &protocol)?;

    Some(PortEntry {
        port,
        protocol,
        address,
        status,
        pid,
        group: classify_process(&process, port),
        process,
    })
}

fn parse_lsof_name(name: &str, protocol: &str) -> Option<(String, u16, String)> {
    let local = name.split("->").next()?.trim();
    let status = if let Some(start) = local.rfind('(') {
        local
            .get(start + 1..local.len().saturating_sub(1))
            .unwrap_or("")
            .trim()
            .to_string()
    } else if protocol == "UDP" {
        "BOUND".to_string()
    } else {
        "ESTABLISHED".to_string()
    };

    let endpoint = local.split_whitespace().next()?;
    let (address, port) = split_endpoint(endpoint)?;
    if protocol == "UDP" && port == 0 {
        return None;
    }
    Some((address, port, status))
}

fn split_endpoint(endpoint: &str) -> Option<(String, u16)> {
    if endpoint == "*:*" {
        return None;
    }

    if let Some(rest) = endpoint.strip_prefix('[') {
        let close = rest.rfind(']')?;
        let address = rest.get(..close)?.to_string();
        let port_text = rest.get(close + 2..)?;
        let port = parse_port(port_text)?;
        return Some((address, port));
    }

    let (address, port_text) = endpoint.rsplit_once(':')?;
    let port = parse_port(port_text)?;
    Some((normalize_address(address), port))
}

fn parse_port(port_text: &str) -> Option<u16> {
    if port_text == "*" {
        return Some(0);
    }
    port_text.parse::<u16>().ok()
}

fn normalize_address(address: &str) -> String {
    match address {
        "*" => "*".to_string(),
        "localhost" => "localhost".to_string(),
        value => value.to_string(),
    }
}

fn unescape_process_name(value: &str) -> String {
    value.replace("\\x20", " ")
}

fn classify_process(process: &str, port: u16) -> String {
    let lower = process.to_lowercase();
    if matches!(port, 3306 | 5432 | 6379 | 11211)
        || lower.contains("mysql")
        || lower.contains("postgres")
        || lower.contains("redis")
    {
        return "database".to_string();
    }
    if matches!(port, 3000 | 5173 | 1420 | 8080 | 8000 | 9000)
        || lower.contains("node")
        || lower.contains("vite")
        || lower.contains("java")
    {
        return "dev".to_string();
    }
    if lower.contains("mdns")
        || lower.contains("controlcenter")
        || lower.contains("rapportd")
        || lower.contains("system")
    {
        return "system".to_string();
    }
    "app".to_string()
}

fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show DevForge", true, None::<&str>)?;
    let command = MenuItem::with_id(app, "command", "Open Launcher", true, None::<&str>)?;
    let dashboard = MenuItem::with_id(app, "dashboard", "Dashboard", true, None::<&str>)?;
    let json = MenuItem::with_id(app, "json-yaml", "JSON / YAML", true, None::<&str>)?;
    let base64 = MenuItem::with_id(app, "base64", "Base64", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &command, &dashboard, &json, &base64, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "command" => {
                let _ = show_launcher_window(app);
            }
            "dashboard" | "json-yaml" | "base64" => {
                show_main_window(app);
                let _ = app.emit("devforge://open-tool", event.id.as_ref());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
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

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    restore_regular_activation_policy();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_launcher_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let app = app.clone();
    app.clone()
        .run_on_main_thread(move || {
            if let Err(error) = show_launcher_window_on_main_thread(&app) {
                log_launcher_debug(format!("show launcher failed: {error}"));
            }
        })
        .map_err(|error| error.to_string())
}

fn show_launcher_window_on_main_thread<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some(window) = app.get_webview_window(LAUNCHER_WINDOW_LABEL) else {
        return Err("启动器窗口不存在".to_string());
    };
    prepare_launcher_activation_policy();
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
    position_launcher_window(app, &window)?;
    #[cfg(target_os = "macos")]
    show_and_front_launcher_window_macos(&window).map_err(|error| error.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    app.emit("devforge://focus-launcher", ())
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn configure_launcher_workspace_behavior<R: Runtime>(window: &WebviewWindow<R>) {
    if let Err(error) = window.set_visible_on_all_workspaces(true) {
        log_launcher_debug(format!("set_visible_on_all_workspaces failed: {error}"));
    }
    if let Err(error) = configure_launcher_fullscreen_auxiliary(window) {
        log_launcher_debug(format!("configure fullscreen auxiliary failed: {error}"));
    }
    if let Err(error) = window.set_focusable(true) {
        log_launcher_debug(format!("set launcher focusable failed: {error}"));
    }
}

#[cfg(target_os = "macos")]
fn configure_launcher_fullscreen_auxiliary<R: Runtime>(
    window: &WebviewWindow<R>,
) -> tauri::Result<()> {
    let ns_window = window.ns_window()?;
    run_appkit_launcher_step("configure fullscreen auxiliary", || unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        ns_window.setCollectionBehavior(launcher_fullscreen_collection_behavior(
            ns_window.collectionBehavior(),
        ));
        ns_window.setStyleMask(launcher_floating_panel_style_mask(ns_window.styleMask()));
        ns_window.setHidesOnDeactivate(false);
        ns_window.setCanHide(false);
        ns_window.setAnimationBehavior(NSWindowAnimationBehavior::UtilityWindow);
        ns_window.setLevel(NSPopUpMenuWindowLevel);
    })?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn configure_launcher_fullscreen_auxiliary<R: Runtime>(
    _window: &WebviewWindow<R>,
) -> tauri::Result<()> {
    Ok(())
}

fn position_launcher_window<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        position_launcher_window_macos(window).map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(frame) = launcher_monitor_frame(app, window)? {
            let position = launcher_position_for_monitor_frame(
                frame,
                LAUNCHER_WINDOW_WIDTH,
                LAUNCHER_WINDOW_HEIGHT,
            );
            window
                .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                    position.x.round() as i32,
                    position.y.round() as i32,
                )))
                .map_err(|error| error.to_string())?;
        } else {
            window.center().map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn position_launcher_window_macos<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let ns_window = window.ns_window()?;
    run_appkit_launcher_step("position launcher", || unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        let mouse_location = NSEvent::mouseLocation();
        let screen_frame = launcher_screen_frame_for_mouse(mouse_location)
            .or_else(launcher_main_screen_frame)
            .unwrap_or(LauncherMonitorFrame {
                x: 0.0,
                y: 0.0,
                width: LAUNCHER_WINDOW_WIDTH,
                height: LAUNCHER_WINDOW_HEIGHT,
            });
        let window_frame = launcher_position_for_monitor_frame(
            screen_frame,
            LAUNCHER_WINDOW_WIDTH,
            LAUNCHER_WINDOW_HEIGHT,
        );
        let frame = NSRect::new(
            NSPoint::new(window_frame.x, window_frame.y),
            NSSize::new(LAUNCHER_WINDOW_WIDTH, LAUNCHER_WINDOW_HEIGHT),
        );

        if launcher_debug_enabled() {
            eprintln!(
                "devforge launcher: mouse=({}, {}), screen=({}, {}, {}, {}), frame=({}, {}, {}, {}), behavior={:?}, level={}",
                mouse_location.x,
                mouse_location.y,
                screen_frame.x,
                screen_frame.y,
                screen_frame.width,
                screen_frame.height,
                frame.origin.x,
                frame.origin.y,
                frame.size.width,
                frame.size.height,
                ns_window.collectionBehavior(),
                ns_window.level(),
            );
        }

        ns_window.setFrame_display(frame, true);
    })?;
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

#[cfg(target_os = "macos")]
fn show_and_front_launcher_window_macos<R: Runtime>(
    window: &WebviewWindow<R>,
) -> tauri::Result<()> {
    let ns_window = window.ns_window()?;
    run_appkit_launcher_step("show and front launcher", || unsafe {
        let ns_window = &*(ns_window.cast::<NSWindow>());
        if ns_window.isMiniaturized() {
            ns_window.deminiaturize(None::<&AnyObject>);
        }
        ns_window.orderFrontRegardless();
        activate_current_macos_app();
        if ns_window.canBecomeKeyWindow() {
            ns_window.makeKeyWindow();
        }
        if ns_window.canBecomeMainWindow() {
            ns_window.makeMainWindow();
        }
        ns_window.makeKeyAndOrderFront(None::<&AnyObject>);
        ns_window.orderFrontRegardless();
        if launcher_debug_enabled() {
            eprintln!(
                "devforge launcher: shown on active space={}, visible={}, key={}, main={}, can_key={}, can_main={}, miniaturized={}, behavior={:?}, level={}",
                ns_window.isOnActiveSpace(),
                ns_window.isVisible(),
                ns_window.isKeyWindow(),
                ns_window.isMainWindow(),
                ns_window.canBecomeKeyWindow(),
                ns_window.canBecomeMainWindow(),
                ns_window.isMiniaturized(),
                ns_window.collectionBehavior(),
                ns_window.level(),
            );
        }
    })?;
    if let Err(error) = window.set_focus() {
        log_launcher_debug(format!("set launcher window focus failed: {error}"));
    }
    if let Err(error) = window.as_ref().set_focus() {
        log_launcher_debug(format!("set launcher webview focus failed: {error}"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn activate_current_macos_app() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    app.activate();
    #[allow(deprecated)]
    app.activateIgnoringOtherApps(true);
    let running_app = NSRunningApplication::currentApplication();
    if !running_app.activateWithOptions(launcher_activation_options()) {
        log_launcher_debug("activate current application returned false");
    }
}

#[cfg(target_os = "macos")]
fn launcher_activation_options() -> NSApplicationActivationOptions {
    let mut options = NSApplicationActivationOptions::ActivateAllWindows;
    #[allow(deprecated)]
    options.insert(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    options
}

#[cfg(target_os = "macos")]
fn prepare_launcher_activation_policy() {
    set_macos_activation_policy(
        NSApplicationActivationPolicy::Accessory,
        "set launcher activation policy",
    );
}

#[cfg(not(target_os = "macos"))]
fn prepare_launcher_activation_policy() {}

#[cfg(target_os = "macos")]
fn restore_regular_activation_policy() {
    set_macos_activation_policy(
        NSApplicationActivationPolicy::Regular,
        "restore regular activation policy",
    );
}

#[cfg(not(target_os = "macos"))]
fn restore_regular_activation_policy() {}

#[cfg(target_os = "macos")]
fn set_macos_activation_policy(policy: NSApplicationActivationPolicy, label: &'static str) {
    if let Err(error) = run_appkit_launcher_step(label, || {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let app = NSApplication::sharedApplication(mtm);
        if !app.setActivationPolicy(policy) {
            log_launcher_debug(format!("{label} returned false"));
        }
    }) {
        log_launcher_debug(format!("{label} failed: {error}"));
    }
}

#[cfg(target_os = "macos")]
fn run_appkit_launcher_step(
    label: &str,
    step: impl FnOnce() + std::panic::UnwindSafe,
) -> tauri::Result<()> {
    exception::catch(step).map_err(|exception| {
        let detail = exception
            .as_deref()
            .map(|exception| format!("{exception:?}"))
            .unwrap_or_else(|| "nil Objective-C exception".to_string());
        let message = format!("{label} raised Objective-C exception: {detail}");
        log_launcher_debug(&message);
        tauri::Error::Io(std::io::Error::other(message))
    })
}

#[cfg(target_os = "macos")]
fn launcher_screen_frame_for_mouse(mouse_location: NSPoint) -> Option<LauncherMonitorFrame> {
    let mtm = MainThreadMarker::new()?;
    let screens = NSScreen::screens(mtm);
    for screen in screens.iter() {
        let frame = screen.frame();
        if NSPointInRect(mouse_location, frame) {
            return Some(launcher_monitor_frame_from_ns_rect(frame));
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn launcher_main_screen_frame() -> Option<LauncherMonitorFrame> {
    let mtm = MainThreadMarker::new()?;
    NSScreen::mainScreen(mtm).map(|screen| launcher_monitor_frame_from_ns_rect(screen.frame()))
}

#[cfg(target_os = "macos")]
fn launcher_monitor_frame_from_ns_rect(frame: NSRect) -> LauncherMonitorFrame {
    LauncherMonitorFrame {
        x: frame.origin.x,
        y: frame.origin.y,
        width: frame.size.width,
        height: frame.size.height,
    }
}

fn launcher_debug_enabled() -> bool {
    std::env::var("DEVFORGE_LAUNCHER_DEBUG").is_ok_and(|value| value != "0")
}

fn log_launcher_debug(message: impl AsRef<str>) {
    if launcher_debug_enabled() {
        eprintln!("devforge launcher: {}", message.as_ref());
    }
}

#[cfg(not(target_os = "macos"))]
fn launcher_monitor_frame<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<Option<LauncherMonitorFrame>, String> {
    let cursor_monitor = app
        .cursor_position()
        .ok()
        .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten());
    let monitor = cursor_monitor
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());

    Ok(monitor.map(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        LauncherMonitorFrame {
            x: f64::from(position.x),
            y: f64::from(position.y),
            width: f64::from(size.width),
            height: f64::from(size.height),
        }
    }))
}

fn launcher_position_for_monitor_frame(
    frame: LauncherMonitorFrame,
    window_width: f64,
    window_height: f64,
) -> tauri::LogicalPosition<f64> {
    let window_width = window_width.max(1.0);
    let window_height = window_height.max(1.0);
    let available_x = (frame.width - window_width).max(0.0);
    let available_y = (frame.height - window_height).max(0.0);
    let centered_x = frame.x + ((frame.width - window_width) / 2.0);
    let centered_y = frame.y + ((frame.height - window_height) / 2.0);
    let min_x = frame.x;
    let min_y = frame.y;
    let max_x = frame.x + available_x;
    let max_y = frame.y + available_y;

    tauri::LogicalPosition::new(
        centered_x.clamp(min_x, max_x),
        centered_y.clamp(min_y, max_y),
    )
}

fn hide_launcher_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LAUNCHER_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn request_show_launcher_window<R: Runtime + 'static>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = show_launcher_window(&app) {
            log_launcher_debug(format!("queue show launcher failed: {error}"));
        }
    });
}

fn setup_global_shortcut<R: Runtime + 'static>(app: &tauri::App<R>) -> Result<(), String> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let handle = app.handle().clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                if event.state() == ShortcutState::Pressed {
                    request_show_launcher_window(handle.clone());
                }
            }));
            if result.is_err() {
                log_launcher_debug("global shortcut handler panicked");
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state(LAUNCHER_WINDOW_LABEL)
                .with_filter(|label| label != LAUNCHER_WINDOW_LABEL)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    DB_URL,
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "create DevForge preference and usage tables",
                            sql: include_str!("migrations/001_init.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 2,
                            description: "create authenticator vault tables",
                            sql: include_str!("migrations/002_authenticator.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            app.manage(MainWindowReopenGuard::default());
            setup_tray(app)?;
            setup_launcher_window(app)?;
            let _ = setup_global_shortcut(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database_url,
            default_settings,
            emit_command_palette,
            show_launcher,
            hide_launcher,
            open_tool_from_launcher,
            list_applications,
            open_application,
            application_icon_data_url,
            capture_screen_selection,
            list_ports,
            get_local_network_ip,
            lookup_dns,
            evaluate_regex
        ])
        .build(tauri::generate_context!())
        .expect("failed to build DevForge")
        .run(|app, event| {
            if let tauri::RunEvent::Reopen { .. } = event {
                if !app.state::<MainWindowReopenGuard>().consume_if_active() {
                    show_main_window(app);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tcp_wildcard_listener() {
        let row = parse_lsof_line(
            "mysqld 2486 user 10u IPv4 0x0 0t0 TCP *:3306 (LISTEN)",
            "TCP",
        )
        .expect("row");
        assert_eq!(row.port, 3306);
        assert_eq!(row.protocol, "TCP");
        assert_eq!(row.address, "*");
        assert_eq!(row.status, "LISTEN");
        assert_eq!(row.pid, 2486);
        assert_eq!(row.process, "mysqld");
        assert_eq!(row.group, "database");
    }

    #[test]
    fn parses_tcp_localhost_listener() {
        let row = parse_lsof_line(
            "DingTalk 794 user 45u IPv4 0x0 0t0 TCP 127.0.0.1:8440 (LISTEN)",
            "TCP",
        )
        .expect("row");
        assert_eq!(row.port, 8440);
        assert_eq!(row.address, "127.0.0.1");
        assert_eq!(row.status, "LISTEN");
    }

    #[test]
    fn parses_application_bundle_entry() {
        let entry =
            application_entry_from_path(Path::new("/Applications/Safari.app"), "filesystem")
                .expect("application entry");

        assert_eq!(entry.id, "/Applications/Safari.app");
        assert_eq!(entry.name, "Safari");
        assert_eq!(entry.localized_name, "Safari");
        assert_eq!(entry.path, "/Applications/Safari.app");
        assert_eq!(entry.display_path, "/Applications/Safari.app");
        assert_eq!(entry.source, "filesystem");
        assert!(entry.aliases.contains(&"Safari".to_string()));
    }

    #[test]
    fn main_window_reopen_guard_suppresses_once_within_duration() {
        let guard = MainWindowReopenGuard::default();

        guard.suppress_for(Duration::from_secs(2));

        assert!(guard.consume_if_active());
        assert!(!guard.consume_if_active());
    }

    #[test]
    fn main_window_reopen_guard_does_not_suppress_after_expiration() {
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
    fn centers_launcher_on_primary_monitor() {
        let frame = LauncherMonitorFrame {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };

        let position = launcher_position_for_monitor_frame(
            frame,
            LAUNCHER_WINDOW_WIDTH,
            LAUNCHER_WINDOW_HEIGHT,
        );

        assert_eq!(position.x, 570.0);
        assert_eq!(position.y, 295.0);
    }

    #[test]
    fn centers_launcher_on_left_secondary_monitor() {
        let frame = LauncherMonitorFrame {
            x: -1920.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };

        let position = launcher_position_for_monitor_frame(
            frame,
            LAUNCHER_WINDOW_WIDTH,
            LAUNCHER_WINDOW_HEIGHT,
        );

        assert_eq!(position.x, -1350.0);
        assert_eq!(position.y, 295.0);
    }

    #[test]
    fn centers_launcher_on_upper_monitor() {
        let frame = LauncherMonitorFrame {
            x: 0.0,
            y: 1080.0,
            width: 1920.0,
            height: 1080.0,
        };

        let position = launcher_position_for_monitor_frame(
            frame,
            LAUNCHER_WINDOW_WIDTH,
            LAUNCHER_WINDOW_HEIGHT,
        );

        assert_eq!(position.x, 570.0);
        assert_eq!(position.y, 1375.0);
    }

    #[test]
    fn centers_launcher_on_lower_monitor() {
        let frame = LauncherMonitorFrame {
            x: 0.0,
            y: -900.0,
            width: 1600.0,
            height: 900.0,
        };

        let position = launcher_position_for_monitor_frame(
            frame,
            LAUNCHER_WINDOW_WIDTH,
            LAUNCHER_WINDOW_HEIGHT,
        );

        assert_eq!(position.x, 410.0);
        assert_eq!(position.y, -695.0);
    }

    #[test]
    fn clamps_launcher_position_inside_small_monitor() {
        let frame = LauncherMonitorFrame {
            x: 100.0,
            y: 50.0,
            width: 640.0,
            height: 400.0,
        };

        let position = launcher_position_for_monitor_frame(
            frame,
            LAUNCHER_WINDOW_WIDTH,
            LAUNCHER_WINDOW_HEIGHT,
        );

        assert_eq!(position.x, 100.0);
        assert_eq!(position.y, 50.0);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn launcher_fullscreen_behavior_keeps_only_valid_space_modes() {
        let initial = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Managed
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::FullScreenPrimary
            | NSWindowCollectionBehavior::FullScreenNone;

        let behavior = launcher_fullscreen_collection_behavior(initial);

        assert!(behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces));
        assert!(behavior.contains(NSWindowCollectionBehavior::Auxiliary));
        assert!(behavior.contains(NSWindowCollectionBehavior::Transient));
        assert!(behavior.contains(NSWindowCollectionBehavior::FullScreenAuxiliary));
        assert!(!behavior.contains(NSWindowCollectionBehavior::MoveToActiveSpace));
        assert!(!behavior.contains(NSWindowCollectionBehavior::Primary));
        assert!(!behavior.contains(NSWindowCollectionBehavior::CanJoinAllApplications));
        assert!(!behavior.contains(NSWindowCollectionBehavior::Managed));
        assert!(!behavior.contains(NSWindowCollectionBehavior::Stationary));
        assert!(!behavior.contains(NSWindowCollectionBehavior::FullScreenPrimary));
        assert!(!behavior.contains(NSWindowCollectionBehavior::FullScreenNone));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn launcher_activation_options_force_foreground_activation() {
        let options = launcher_activation_options();

        assert!(options.contains(NSApplicationActivationOptions::ActivateAllWindows));
        #[allow(deprecated)]
        {
            assert!(options.contains(NSApplicationActivationOptions::ActivateIgnoringOtherApps));
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn launcher_style_mask_stays_focusable() {
        let style_mask = launcher_floating_panel_style_mask(
            NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
        );

        assert!(style_mask.contains(NSWindowStyleMask::UtilityWindow));
        assert!(!style_mask.contains(NSWindowStyleMask::NonactivatingPanel));
        assert!(!style_mask.contains(NSWindowStyleMask::Miniaturizable));
    }

    #[test]
    fn matches_builtin_localized_application_aliases() {
        let entry = application_entry_from_path(
            Path::new("/System/Applications/Calendar.app"),
            "filesystem",
        )
        .expect("application entry");

        assert_eq!(entry.name, "日历");
        assert_eq!(entry.localized_name, "日历");
        assert!(entry.aliases.contains(&"日历".to_string()));
        assert!(application_matches_query(&entry, "日历"));
        assert!(application_score(&entry, "日历") > 0);
    }

    #[test]
    fn matches_activity_monitor_by_pinyin_alias() {
        let entry = application_entry_from_path(
            Path::new("/System/Applications/Utilities/Activity Monitor.app"),
            "filesystem",
        )
        .expect("application entry");

        assert_eq!(entry.name, "活动监视器");
        assert_eq!(entry.localized_name, "活动监视器");
        assert!(entry.aliases.contains(&"huo dong jian shi qi".to_string()));
        assert!(entry.aliases.contains(&"huodongjianshiqi".to_string()));
        assert!(application_matches_query(&entry, "huodong"));
        assert!(application_score(&entry, "huodong") > 0);
    }

    #[test]
    fn reads_localized_application_names_from_info_plist_strings() {
        let root = unique_test_dir("localized-app");
        let app = root.join("PyCharm.app");
        fs::create_dir_all(app.join("Contents/Resources/zh-Hans.lproj"))
            .expect("create app bundle");
        fs::write(
            app.join("Contents/Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>PyCharm</string>
  <key>CFBundleIdentifier</key>
  <string>com.jetbrains.pycharm</string>
</dict>
</plist>"#,
        )
        .expect("write info plist");
        fs::write(
            app.join("Contents/Resources/zh-Hans.lproj/InfoPlist.strings"),
            r#""CFBundleDisplayName" = "PyCharm 中文版";
"CFBundleName" = "PyCharm";"#,
        )
        .expect("write localized strings");

        let entry = application_entry_from_path(&app, "filesystem").expect("application entry");

        assert_eq!(entry.name, "PyCharm 中文版");
        assert_eq!(entry.localized_name, "PyCharm 中文版");
        assert!(entry.aliases.contains(&"PyCharm 中文版".to_string()));
        assert!(entry.aliases.contains(&"com.jetbrains.pycharm".to_string()));
        assert!(application_matches_query(&entry, "pycharm"));
        assert!(application_matches_query(&entry, "中文版"));

        fs::remove_dir_all(root).expect("remove test dir");
    }

    #[test]
    fn matches_localized_application_names_by_generated_pinyin_aliases() {
        let root = unique_test_dir("pinyin-app");
        let app = root.join("Demo.app");
        fs::create_dir_all(app.join("Contents/Resources/zh-Hans.lproj"))
            .expect("create app bundle");
        fs::write(
            app.join("Contents/Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Demo</string>
</dict>
</plist>"#,
        )
        .expect("write info plist");
        fs::write(
            app.join("Contents/Resources/zh-Hans.lproj/InfoPlist.strings"),
            r#""CFBundleDisplayName" = "中文测试";"#,
        )
        .expect("write localized strings");

        let entry = application_entry_from_path(&app, "filesystem").expect("application entry");

        assert_eq!(entry.name, "中文测试");
        assert!(entry.aliases.contains(&"zhongwenceshi".to_string()));
        assert!(entry.aliases.contains(&"zhong wen ce shi".to_string()));
        assert!(application_matches_query(&entry, "zhongwen"));

        fs::remove_dir_all(root).expect("remove test dir");
    }

    #[test]
    fn reads_utf16_localized_info_plist_strings() {
        let root = unique_test_dir("utf16-app");
        let app = root.join("Calendar.app");
        fs::create_dir_all(app.join("Contents/Resources/zh-Hans.lproj"))
            .expect("create app bundle");
        let contents = r#""CFBundleDisplayName" = "日历";"#;
        let mut bytes = vec![0xFF, 0xFE];
        for unit in contents.encode_utf16() {
            bytes.extend(unit.to_le_bytes());
        }
        fs::write(
            app.join("Contents/Resources/zh-Hans.lproj/InfoPlist.strings"),
            bytes,
        )
        .expect("write utf16 strings");

        let entry = application_entry_from_path(&app, "filesystem").expect("application entry");

        assert_eq!(entry.name, "日历");
        assert_eq!(entry.localized_name, "日历");
        assert!(application_matches_query(&entry, "日历"));

        fs::remove_dir_all(root).expect("remove test dir");
    }

    #[test]
    fn resolves_application_icon_path_from_info_plist() {
        let root = unique_test_dir("icon-app");
        let app = root.join("IconDemo.app");
        fs::create_dir_all(app.join("Contents/Resources")).expect("create app bundle");
        fs::write(
            app.join("Contents/Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>IconDemo</string>
  <key>CFBundleIconFile</key>
  <string>IconAsset</string>
</dict>
</plist>"#,
        )
        .expect("write info plist");
        fs::write(app.join("Contents/Resources/IconAsset.icns"), b"icns").expect("write icon");

        let entry = application_entry_from_path(&app, "filesystem").expect("application entry");

        assert_eq!(
            entry.icon_path.as_deref(),
            Some(
                app.join("Contents/Resources/IconAsset.icns")
                    .to_string_lossy()
                    .as_ref()
            )
        );

        fs::remove_dir_all(root).expect("remove test dir");
    }

    #[test]
    fn encodes_base64_without_external_dependencies() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
    }

    #[test]
    fn scans_deeply_nested_application_bundles() {
        let root = unique_test_dir("nested-app");
        let app = root
            .join("JetBrains")
            .join("Toolbox")
            .join("apps")
            .join("PyCharm")
            .join("ch-0")
            .join("261.123")
            .join("PyCharm.app");
        fs::create_dir_all(app.join("Contents")).expect("create app bundle");

        let results = scan_application_directory(&root, "pycharm", 8);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "PyCharm");

        fs::remove_dir_all(root).expect("remove test dir");
    }

    #[test]
    fn rejects_non_application_paths() {
        assert!(
            application_entry_from_path(Path::new("/Applications/Notes.txt"), "filesystem")
                .is_none()
        );
        assert!(
            application_entry_from_path(Path::new("/Applications/Utilities"), "filesystem")
                .is_none()
        );
    }

    #[test]
    fn sorts_and_deduplicates_applications_by_match_quality() {
        let entries = vec![
            application_entry_from_path(
                Path::new("/Applications/BetterTerminal.app"),
                "filesystem",
            )
            .unwrap(),
            application_entry_from_path(
                Path::new("/System/Applications/Utilities/Terminal.app"),
                "spotlight",
            )
            .unwrap(),
            application_entry_from_path(
                Path::new("/System/Applications/Utilities/Terminal.app"),
                "filesystem",
            )
            .unwrap(),
        ];

        let sorted = sort_and_deduplicate_applications(entries, "term");

        assert_eq!(sorted.len(), 2);
        assert_eq!(sorted[0].name, "终端");
        assert_eq!(sorted[1].name, "BetterTerminal");
    }

    fn unique_test_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        std::env::temp_dir().join(format!("devforge-{prefix}-{unique}"))
    }

    #[test]
    fn parses_default_route_interface() {
        let output = r#"
   route to: default
destination: default
       mask: default
    gateway: 192.168.60.1
  interface: en0
"#;

        assert_eq!(
            parse_default_route_interface(output).as_deref(),
            Some("en0")
        );
    }

    #[test]
    fn parses_macos_hardware_ports() {
        let output = r#"
Hardware Port: USB 10/100/1000 LAN
Device: en6
Ethernet Address: c8:4b:d6:b8:6e:ab

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: 90:9b:6f:15:bc:93
"#;

        let ports = parse_macos_hardware_ports(output);

        assert_eq!(ports["en0"].hardware_port, "Wi-Fi");
        assert_eq!(ports["en0"].connection_type, "wifi");
        assert_eq!(ports["en6"].hardware_port, "USB 10/100/1000 LAN");
        assert_eq!(ports["en6"].connection_type, "ethernet");
    }

    #[test]
    fn parses_active_ifconfig_ipv4_details() {
        let output = r#"
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether 32:5b:15:e9:dc:e3
	inet 192.168.60.211 netmask 0xffffff00 broadcast 192.168.60.255
	media: autoselect
	status: active
"#;

        let interfaces = parse_ifconfig_interfaces(output);

        assert_eq!(interfaces.len(), 1);
        assert_eq!(interfaces[0].name, "en0");
        assert!(interfaces[0].is_active);
        assert_eq!(interfaces[0].ip.as_deref(), Some("192.168.60.211"));
        assert_eq!(interfaces[0].netmask.as_deref(), Some("0xffffff00"));
        assert_eq!(interfaces[0].broadcast.as_deref(), Some("192.168.60.255"));
    }

    #[test]
    fn builds_default_route_wifi_local_ip() {
        let hardware_ports = parse_macos_hardware_ports(
            r#"
Hardware Port: USB 10/100/1000 LAN
Device: en6
Ethernet Address: c8:4b:d6:b8:6e:ab

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: 90:9b:6f:15:bc:93
"#,
        );
        let interfaces = parse_ifconfig_interfaces(
            r#"
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether 32:5b:15:e9:dc:e3
	inet 192.168.60.211 netmask 0xffffff00 broadcast 192.168.60.255
	status: active
en6: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether c8:4b:d6:b8:6e:ab
	inet 10.0.0.18 netmask 0xffffff00 broadcast 10.0.0.255
	status: active
"#,
        );

        let info = build_local_network_ip_info(
            "en0",
            true,
            interfaces.iter().find(|item| item.name == "en0"),
            &hardware_ports,
        )
        .expect("local ip");

        assert_eq!(info.ip, "192.168.60.211");
        assert_eq!(info.connection_type, "wifi");
        assert_eq!(info.hardware_port, "Wi-Fi");
        assert!(info.is_default_route);
    }

    #[test]
    fn builds_default_route_ethernet_local_ip() {
        let hardware_ports = parse_macos_hardware_ports(
            r#"
Hardware Port: USB 10/100/1000 LAN
Device: en6
Ethernet Address: c8:4b:d6:b8:6e:ab

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: 90:9b:6f:15:bc:93
"#,
        );
        let interfaces = parse_ifconfig_interfaces(
            r#"
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	inet 192.168.60.211 netmask 0xffffff00 broadcast 192.168.60.255
	status: active
en6: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	inet 10.0.0.18 netmask 0xffffff00 broadcast 10.0.0.255
	status: active
"#,
        );

        let info = build_local_network_ip_info(
            "en6",
            true,
            interfaces.iter().find(|item| item.name == "en6"),
            &hardware_ports,
        )
        .expect("local ip");

        assert_eq!(info.ip, "10.0.0.18");
        assert_eq!(info.connection_type, "ethernet");
        assert_eq!(info.hardware_port, "USB 10/100/1000 LAN");
        assert!(info.is_default_route);
    }

    #[test]
    fn ignores_vpn_loopback_link_local_and_inactive_interfaces() {
        let interfaces = parse_ifconfig_interfaces(
            r#"
lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
	inet 127.0.0.1 netmask 0xff000000
utun7: flags=8051<UP,POINTOPOINT,RUNNING,MULTICAST> mtu 1500
	inet 10.8.0.2 --> 10.8.0.1 netmask 0xffffff00
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	inet 169.254.1.2 netmask 0xffff0000 broadcast 169.254.255.255
	status: active
en6: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	inet 10.0.0.18 netmask 0xffffff00 broadcast 10.0.0.255
	status: inactive
"#,
        );

        assert!(interfaces
            .iter()
            .all(|interface| !interface.is_usable_local_ipv4()));
    }

    #[test]
    fn parses_ipv6_listener() {
        let row = parse_lsof_line(
            "full-line 62710 user 12u IPv6 0x0 0t0 TCP [::1]:61431 (LISTEN)",
            "TCP",
        )
        .expect("row");
        assert_eq!(row.port, 61431);
        assert_eq!(row.address, "::1");
        assert_eq!(row.status, "LISTEN");
    }

    #[test]
    fn evaluates_regex101_style_nginx_log_pattern() {
        let pattern = r#"^(\S+)\s-\s\[([^]]+)]\s-\s(\S+)\s\[(\S+)\s\S+\s"(\w+)\s(\S+)\s([^"]+)"\s(\d+)\s(\d+)\s"([^"]*)"\s"([^"]*)"\s(\S+)\s(\S+)+\s\[([^]]*)]\s(\S+?(?:,\s\S+?)*)\s(\S+?(?:,\s\S+?)*)\s(\S+?(?:,\s\S+?)*)\s(\S+?(?:,\s\S+?)*)\s(\S+)\s*(\S*)\s*\[*([^]]*)\]\s?(\S*)\s?(\S*)"#;
        let text = r#"47.91.14.51 - [47.91.14.51] - - [15/Jun/2026:02:06:58 +0000] "POST /api/v1/data/abnormalOrders HTTP/1.1" 200 120 "-" "Go-http-client/1.1" 418 0.012 [api-center-operator-api-8080] 10.60.39.102:8080 120 0.009 200 c359b0fa76fb0466469619d7d62a1cd3 operatorapi.joyaras.com [] a4aa0319b1e845eaba4ee48d55dce66e application/json"#;
        let result = evaluate_regex_blocking(RegexOptions {
            pattern: pattern.to_string(),
            flags: vec!["g".to_string()],
            text: text.to_string(),
            replacement: Some("$1 $5 $6".to_string()),
        })
        .expect("regex result");

        assert!(result.ok);
        assert_eq!(result.engine, "Rust fancy-regex");
        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.matches[0].groups[0].value, "47.91.14.51");
        assert_eq!(
            result.replace_output,
            "47.91.14.51 POST /api/v1/data/abnormalOrders"
        );
    }

    #[test]
    fn evaluates_regex_literal_with_rust_lookbehind() {
        let result = evaluate_regex_blocking(RegexOptions {
            pattern: r#"/(?<=id=)\d+/g"#.to_string(),
            flags: Vec::new(),
            text: "id=42 id=77".to_string(),
            replacement: Some("#$&".to_string()),
        })
        .expect("regex result");

        assert!(result.ok);
        assert_eq!(result.flags, "g");
        assert_eq!(result.matches.len(), 2);
        assert_eq!(result.matches[0].text, "42");
        assert_eq!(result.replace_output, "id=#42 id=#77");
    }

    #[test]
    fn parses_udp_bound_port() {
        let row = parse_lsof_line("mDNSResponder 391 user 18u IPv4 0x0 0t0 UDP *:5353", "UDP")
            .expect("row");
        assert_eq!(row.port, 5353);
        assert_eq!(row.protocol, "UDP");
        assert_eq!(row.address, "*");
        assert_eq!(row.status, "BOUND");
    }

    #[test]
    fn parses_arrow_line_from_local_endpoint() {
        let row = parse_lsof_line("rapportd 881 user 12u IPv4 0x0 0t0 TCP 192.168.31.12:62078->17.253.37.203:443 (ESTABLISHED)", "TCP").expect("row");
        assert_eq!(row.port, 62078);
        assert_eq!(row.address, "192.168.31.12");
        assert_eq!(row.status, "ESTABLISHED");
    }

    #[test]
    fn skips_udp_without_parseable_local_port() {
        assert!(
            parse_lsof_line("mDNSResponder 391 user 18u IPv4 0x0 0t0 UDP *:*", "UDP").is_none()
        );
    }

    #[test]
    fn normalizes_dns_inputs() {
        assert_eq!(
            normalize_dns_domain("https://API.DevForge.App/path").unwrap(),
            "api.devforge.app"
        );
        assert!(normalize_dns_domain("-bad.example").is_err());
        assert_eq!(normalize_dns_record_type("txt").unwrap(), "TXT");
        assert!(normalize_dns_record_type("NS").is_err());
    }

    #[test]
    fn parses_native_dns_a_response() {
        let mut packet = dns_response_header(0x1234, 2);
        write_dns_name(&mut packet, "devforge.app").expect("question name");
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&0xc00cu16.to_be_bytes());
        packet.extend_from_slice(&5u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&300u32.to_be_bytes());
        let mut cname_rdata = Vec::new();
        write_dns_name(&mut cname_rdata, "edge.devforge.app").expect("cname name");
        packet.extend_from_slice(&(cname_rdata.len() as u16).to_be_bytes());
        packet.extend_from_slice(&cname_rdata);
        packet.extend_from_slice(&0xc00cu16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&300u32.to_be_bytes());
        packet.extend_from_slice(&4u16.to_be_bytes());
        packet.extend_from_slice(&[104, 21, 32, 18]);

        let result = parse_dns_response(&packet, "A", "192.168.1.1", 0x1234).expect("dns response");
        assert_eq!(result.records.len(), 1);
        assert_eq!(result.status_text, "OK");
        let record = &result.records[0];
        assert_eq!(record.record_type, "A");
        assert_eq!(record.host, "devforge.app");
        assert_eq!(record.ttl, Some(300));
        assert_eq!(record.value, "104.21.32.18");
        assert_eq!(record.source, "192.168.1.1");
    }

    #[test]
    fn parses_native_dns_mx_and_txt_values() {
        let mut packet = dns_response_header(0x4321, 2);
        write_dns_name(&mut packet, "example.com").expect("question name");
        packet.extend_from_slice(&15u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());

        packet.extend_from_slice(&0xc00cu16.to_be_bytes());
        packet.extend_from_slice(&15u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&300u32.to_be_bytes());
        let mut mx_rdata = Vec::new();
        mx_rdata.extend_from_slice(&10u16.to_be_bytes());
        write_dns_name(&mut mx_rdata, "mx1.example.com").expect("mx name");
        packet.extend_from_slice(&(mx_rdata.len() as u16).to_be_bytes());
        packet.extend_from_slice(&mx_rdata);

        packet.extend_from_slice(&0xc00cu16.to_be_bytes());
        packet.extend_from_slice(&16u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&300u32.to_be_bytes());
        let txt_first = b"v=spf1 include:_spf.example.com";
        let txt_second = b" ~all";
        let txt_len = 1 + txt_first.len() + 1 + txt_second.len();
        packet.extend_from_slice(&(txt_len as u16).to_be_bytes());
        packet.push(txt_first.len() as u8);
        packet.extend_from_slice(txt_first);
        packet.push(txt_second.len() as u8);
        packet.extend_from_slice(txt_second);

        let result = parse_dns_response(&packet, "MX", "8.8.8.8", 0x4321).expect("dns response");
        assert_eq!(result.records.len(), 1);
        assert_eq!(result.records[0].record_type, "MX");
        assert_eq!(result.records[0].priority, Some(10));
        assert_eq!(result.records[0].value, "mx1.example.com");

        let txt = parse_dns_record_value(&packet, 16, packet.len() - txt_len, txt_len)
            .expect("txt value")
            .0;
        assert_eq!(txt, "v=spf1 include:_spf.example.com ~all");
    }

    #[test]
    fn parses_resolv_conf_nameservers() {
        let resolvers = parse_resolv_conf_nameservers(
            r#"
nameserver 192.168.1.1
nameserver 2001:4860:4860::8888
nameserver 192.168.1.1
"#,
        );
        assert_eq!(resolvers.len(), 2);
        assert_eq!(resolvers[0], "192.168.1.1".parse::<IpAddr>().unwrap());
        assert_eq!(
            resolvers[1],
            "2001:4860:4860::8888".parse::<IpAddr>().unwrap()
        );
    }

    #[test]
    #[ignore = "requires outbound DNS access"]
    fn lookup_dns_real_network() {
        let result = lookup_dns_blocking("devforge.app".to_string(), "A".to_string())
            .expect("real dns lookup");
        assert_eq!(result.source, "system");
        assert_eq!(result.record_type, "A");
        assert!(!result.records.is_empty());
        assert!(result
            .records
            .iter()
            .any(|record| record.record_type == "A"));
    }

    fn dns_response_header(query_id: u16, answer_count: u16) -> Vec<u8> {
        let mut packet = Vec::new();
        packet.extend_from_slice(&query_id.to_be_bytes());
        packet.extend_from_slice(&0x8180u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&answer_count.to_be_bytes());
        packet.extend_from_slice(&0u16.to_be_bytes());
        packet.extend_from_slice(&0u16.to_be_bytes());
        packet
    }
}
