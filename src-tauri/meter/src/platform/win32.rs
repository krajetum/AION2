//! Windows: Npcap and the AION 2 window. Adapted from A2Tools (GPL-3.0), `platform/win32`.

pub mod pcap {
    use std::path::Path;

    /// The library `capture::pcap_capturer` loads at runtime.
    pub const LIBRARIES: &[&str] = &["wpcap.dll"];
    pub const MISSING_HELP: &str = "Is Npcap installed? Download it from https://npcap.com";
    /// Npcap's read returns at its timeout on a device with no traffic.
    pub const READ_TIMES_OUT_WHEN_IDLE: bool = true;
    /// Npcap empties its buffer on a new filter, so the filter is set once when a device opens.
    pub const FILTER_CHANGE_KEEPS_QUEUE: bool = false;

    /// Without WinPcap-compatible mode Npcap installs wpcap.dll in `System32\Npcap`,
    /// where a plain load does not look: add it to the DLL search path (Npcap's own guidance).
    pub fn prepare() {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::System::LibraryLoader::SetDllDirectoryW;
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
            let folder = Path::new(&root).join("System32").join("Npcap");
            let wide: Vec<u16> = folder.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
            // SAFETY: a NUL-terminated path that outlives the call.
            if let Err(e) = unsafe { SetDllDirectoryW(PCWSTR(wide.as_ptr())) } {
                tracing::debug!("SetDllDirectoryW({}) failed: {e}", folder.display());
            }
        });
    }

    pub fn library_available() -> bool {
        prepare();
        // SAFETY: loading Npcap runs no initialisation we depend on not running.
        LIBRARIES.iter().any(|name| unsafe { libloading::Library::new(name).is_ok() })
    }

    pub fn skip_device(_name: &str) -> bool {
        false
    }
}

/// Finds the game window by title (`AION2…`) or by the program that owns it (`AION2.exe`).
/// Reads window titles and the owning program's path only, never the game's memory.
pub mod window_detector {
    use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible};

    fn is_game_title(title: &str) -> bool {
        title.starts_with("AION2")
    }

    fn is_game_exe(path: &str) -> bool {
        path.rsplit(['\\', '/']).next().is_some_and(|name| name.eq_ignore_ascii_case("AION2.exe"))
    }

    fn window_title(hwnd: HWND) -> String {
        let mut buf = [0u16; 256];
        let len = unsafe { GetWindowTextW(hwnd, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..len])
    }

    fn exe_path(hwnd: HWND) -> Option<String> {
        use windows::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        unsafe {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), windows::core::PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(handle);
            ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    fn top_level_windows() -> Vec<HWND> {
        unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let windows = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
            windows.push(hwnd);
            BOOL(1)
        }
        let mut windows: Vec<HWND> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut windows as *mut Vec<HWND> as isize));
        }
        windows
    }

    pub fn find_aion2_window_title() -> Option<String> {
        let windows = top_level_windows();
        if let Some(title) = windows.iter().map(|&h| window_title(h)).find(|t| is_game_title(t)) {
            return Some(title);
        }
        windows.into_iter().find_map(|h| {
            if !unsafe { IsWindowVisible(h) }.as_bool() {
                return None;
            }
            let title = window_title(h);
            if title.is_empty() {
                return None;
            }
            exe_path(h).filter(|p| is_game_exe(p)).map(|_| title)
        })
    }

    /// Windows that look like the game, for the log when none is recognised.
    pub fn describe_candidates() -> Vec<String> {
        let mut out = Vec::new();
        for h in top_level_windows() {
            let title = window_title(h);
            let exe = exe_path(h).unwrap_or_default();
            let exe_name = exe.rsplit(['\\', '/']).next().unwrap_or("").to_string();
            if title.to_lowercase().contains("aion") || exe_name.to_lowercase().contains("aion") {
                let visible = unsafe { IsWindowVisible(h) }.as_bool();
                out.push(format!("title={title:?} exe={exe_name:?} visible={visible}"));
                if out.len() >= 8 {
                    break;
                }
            }
        }
        out
    }
}
