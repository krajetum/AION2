//! Other targets (macOS): no capture.

pub mod pcap {
    pub const LIBRARIES: &[&str] = &["libpcap.so.1"];
    pub const MISSING_HELP: &str = "Packet capture is not supported on this platform.";
    pub const READ_TIMES_OUT_WHEN_IDLE: bool = false;
    pub const FILTER_CHANGE_KEEPS_QUEUE: bool = false;
    pub fn prepare() {}
    pub fn library_available() -> bool {
        false
    }
    pub fn skip_device(_name: &str) -> bool {
        false
    }
}

pub mod window_detector {
    pub fn find_aion2_window_title() -> Option<String> {
        None
    }
    pub fn is_aion2_foreground() -> bool {
        true
    }
    pub fn describe_candidates() -> Vec<String> {
        Vec::new()
    }
}
