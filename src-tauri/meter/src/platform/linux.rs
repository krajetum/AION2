//! Linux (the game under Proton): libpcap and the AION2.exe process.
//! Adapted from A2Tools (GPL-3.0), `platform/linux` and `platform/procfs.rs`.

pub mod pcap {
    /// Distributions disagree on the soname: Arch/Fedora ship `.so.1`, Debian/Ubuntu `.so.0.8`.
    pub const LIBRARIES: &[&str] = &["libpcap.so.1", "libpcap.so.0.8", "libpcap.so"];
    pub const MISSING_HELP: &str =
        "Install libpcap (e.g. `sudo apt install libpcap0.8`), then allow capture: `sudo setcap cap_net_raw=ep <path to the app>`";
    pub const READ_TIMES_OUT_WHEN_IDLE: bool = false;
    pub const FILTER_CHANGE_KEEPS_QUEUE: bool = true;

    pub fn prepare() {}

    pub fn library_available() -> bool {
        // SAFETY: loading libpcap runs no initialisation we depend on not running.
        LIBRARIES.iter().any(|name| unsafe { libloading::Library::new(name).is_ok() })
    }

    /// libpcap's pseudo-devices and container networking carry no game traffic.
    pub fn skip_device(name: &str) -> bool {
        name == "any"
            || ["nflog", "nfqueue", "usbmon", "dbus", "bluetooth", "veth", "docker", "br-", "podman"]
                .iter()
                .any(|prefix| name.starts_with(prefix))
    }
}

pub mod window_detector {
    fn is_aion2_process(comm: &str, cmdline: &[u8]) -> bool {
        let is_game = |name: &str| name.trim().eq_ignore_ascii_case("AION2.exe");
        if is_game(comm) {
            return true;
        }
        let argv0 = String::from_utf8_lossy(cmdline.split(|&b| b == 0).next().unwrap_or(&[])).to_string();
        argv0.rsplit(['/', '\\']).next().is_some_and(is_game)
    }

    fn processes() -> impl Iterator<Item = (String, Vec<u8>)> {
        std::fs::read_dir("/proc").into_iter().flatten().flatten().filter_map(|e| {
            let dir = e.path();
            let numeric = dir.file_name()?.to_str()?.bytes().all(|b| b.is_ascii_digit());
            numeric.then(|| {
                (std::fs::read_to_string(dir.join("comm")).unwrap_or_default(), std::fs::read(dir.join("cmdline")).unwrap_or_default())
            })
        })
    }

    pub fn find_aion2_window_title() -> Option<String> {
        processes().any(|(comm, cmd)| is_aion2_process(&comm, &cmd)).then(|| "AION2".to_string())
    }

    /// Not knowable in general on Linux (Wayland): reported as in front, so nothing hides.
    pub fn is_aion2_foreground() -> bool {
        true
    }

    pub fn describe_candidates() -> Vec<String> {
        processes()
            .filter(|(comm, _)| comm.to_lowercase().contains("aion"))
            .take(8)
            .map(|(comm, _)| format!("comm={:?}", comm.trim()))
            .collect()
    }
}
