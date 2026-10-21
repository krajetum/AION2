//! OS-specific bits the capture needs: which libpcap to load, and whether the game window is open.
//! Adapted from A2Tools (GPL-3.0), `platform/{win32,linux,unsupported}`.

#[cfg(windows)]
#[path = "win32.rs"]
mod os;

#[cfg(target_os = "linux")]
#[path = "linux.rs"]
mod os;

#[cfg(not(any(windows, target_os = "linux")))]
#[path = "unsupported.rs"]
mod os;

pub use os::{pcap, window_detector};
