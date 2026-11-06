//! Packet recorder (diagnostics, companion code): writes game frames the parser reads to a
//! text file, with marks the player sets ("I hear a cube", "I opened it"), so new records can be
//! found by comparing the frames around the marks. It hangs on A2Tools' frame tap
//! (`capture::frame_tap`, through `crate::tap`): the frames are the ones the meter already reads from its passive copy
//! of the traffic. Nothing is sent anywhere; the file stays on the player's disk.
//!
//! What goes in is the player's choice (`Kinds`): every frame of the game connection (`combat`), only frames
//! holding a known item code (`items`: a small file), and the game's other connections
//! (`other`: its own TCP connections only, by Windows' connection table; the bytes as they come, at most
//! `MAX_PER_CONNECTION` each, and at the end whether each looked like plain data or TLS/encrypted).
//!
//! File format, one entry per line:
//! `# ...` header and summary, `F <ms> <frame hex>` a frame, `E <ms> <frame hex>` a frame from a bundle inside another
//! packet (which the parser only scans for identity, `tap::embedded`), `I <ms> <item names>` the known items in the
//! next line's bytes, `C <ms> <s|c> <ip:port> <hex>` bytes of another game connection (`s` = from the server),
//! `M <ms> <label>` a mark; `<ms>` counts from the start of the recording.

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// A recording stops by itself after this long...
pub const MAX_TIME: Duration = Duration::from_secs(15 * 60);
/// ...or once the file is this big.
pub const MAX_BYTES: u64 = 200 * 1024 * 1024;
/// Bytes kept from each other connection (both directions together).
pub const MAX_PER_CONNECTION: u64 = 64 * 1024;

/// What a recording keeps (Settings > Diagnostics checkboxes).
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Kinds {
    /// Every frame of the game connection.
    pub combat: bool,
    /// Frames and bytes holding a known item code, with the item's name (`I` lines).
    pub items: bool,
    /// The game's other TCP connections.
    pub other: bool,
}

impl Default for Kinds {
    fn default() -> Self {
        Self { combat: true, items: false, other: false }
    }
}

/// One other connection's bytes so far.
#[derive(Default)]
struct Conn {
    bytes: u64,
    kept: u64,
    /// The client's first bytes: `16 03` = a TLS handshake.
    first_client: Option<[u8; 2]>,
    /// Byte counts of what was kept, for a randomness test.
    counts: Vec<u64>,
}

impl Conn {
    /// Plain data or encrypted: TLS by its handshake, else bytes near uniform (>= 7.5 bits each) look encrypted or compressed.
    fn verdict(&self) -> &'static str {
        if self.first_client == Some([0x16, 0x03]) {
            return "TLS (encrypted)";
        }
        let n: u64 = self.counts.iter().sum();
        if n < 256 {
            return "too little to tell";
        }
        let bits: f64 = self
            .counts
            .iter()
            .filter(|&&c| c > 0)
            .map(|&c| {
                let p = c as f64 / n as f64;
                -p * p.log2()
            })
            .sum();
        if bits >= 7.5 { "random-looking (encrypted or compressed)" } else { "plain data" }
    }
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStatus {
    pub recording: bool,
    /// The file of the current or last recording.
    pub path: Option<String>,
    pub ms: u64,
    pub frames: u64,
    pub bytes: u64,
    pub marks: u32,
    /// Other game connections seen (with `Kinds::other`).
    pub connections: u32,
    /// Why the last recording stopped by itself (time or size limit, write error).
    pub ended: Option<String>,
}

/// One recording into any writer (a file in the app, memory in the tests).
pub struct Recording<W: Write> {
    out: W,
    start: Instant,
    max_time: Duration,
    max_bytes: u64,
    status: RecorderStatus,
    kinds: Kinds,
    /// Item code -> name, for `Kinds::items`.
    items: HashMap<u32, String>,
    /// Other connections by "ip:port local-port".
    conns: HashMap<String, Conn>,
}

impl<W: Write> Recording<W> {
    pub fn new(out: W, path: Option<String>, max_time: Duration, max_bytes: u64) -> io::Result<Self> {
        Self::with(out, path, max_time, max_bytes, Kinds::default(), HashMap::new())
    }

    pub fn with(
        mut out: W,
        path: Option<String>,
        max_time: Duration,
        max_bytes: u64,
        kinds: Kinds,
        items: HashMap<u32, String>,
    ) -> io::Result<Self> {
        let kept: Vec<&str> = [(kinds.combat, "game connection"), (kinds.items, "known items"), (kinds.other, "other game connections")]
            .into_iter()
            .filter_map(|(on, name)| on.then_some(name))
            .collect();
        let header = format!(
            "# AION 2 Companion packet recording (diagnostics)\n\
             # F <ms> <frame hex> | E <ms> <frame hex> | I <ms> <items in the next line> | C <ms> <s|c> <ip:port> <hex> | M <ms> <label>\n\
             # kept: {} ({} item names known)\n",
            kept.join(", "),
            items.len(),
        );
        out.write_all(header.as_bytes())?;
        Ok(Self {
            out,
            start: Instant::now(),
            max_time,
            max_bytes,
            status: RecorderStatus { recording: true, path, bytes: header.len() as u64, ..Default::default() },
            kinds,
            items,
            conns: HashMap::new(),
        })
    }

    /// The known items in `bytes` (a u32 item code at any offset), names joined, or None.
    fn item_names(&self, bytes: &[u8]) -> Option<String> {
        if !self.kinds.items || self.items.is_empty() {
            return None;
        }
        let mut names: Vec<&str> = Vec::new();
        for w in bytes.windows(4) {
            if let Some(n) = self.items.get(&u32::from_le_bytes([w[0], w[1], w[2], w[3]])) {
                if !names.contains(&n.as_str()) {
                    names.push(n);
                }
            }
        }
        (!names.is_empty()).then(|| names.join(" | "))
    }

    fn items_line(&mut self, names: &str) {
        let text = format!("I {} {}\n", self.ms(), names.replace(['\n', '\r'], " "));
        self.line(&text);
    }

    /// Bytes of another game connection: `from_server` and the server's address. Kept up to MAX_PER_CONNECTION
    /// per connection, past it only counted.
    pub fn connection(&mut self, from_server: bool, server: &str, local_port: u16, data: &[u8]) {
        if !self.status.recording || !self.kinds.other || data.is_empty() {
            return;
        }
        let c = self.conns.entry(format!("{server} (local port {local_port})")).or_default();
        if c.counts.is_empty() {
            c.counts = vec![0; 256];
            self.status.connections += 1;
        }
        c.bytes += data.len() as u64;
        if !from_server && c.first_client.is_none() && data.len() >= 2 {
            c.first_client = Some([data[0], data[1]]);
        }
        if c.kept >= MAX_PER_CONNECTION {
            return;
        }
        let take = data.len().min((MAX_PER_CONNECTION - c.kept) as usize);
        c.kept += take as u64;
        for &b in &data[..take] {
            c.counts[b as usize] += 1;
        }
        if let Some(names) = self.item_names(&data[..take]) {
            self.items_line(&names);
        }
        let mut text = format!("C {} {} {server} ", self.ms(), if from_server { 's' } else { 'c' });
        for b in &data[..take] {
            text.push_str(&format!("{b:02x}"));
        }
        text.push('\n');
        self.line(&text);
    }

    fn ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }

    fn line(&mut self, text: &str) {
        if !self.status.recording {
            return;
        }
        if let Err(e) = self.out.write_all(text.as_bytes()) {
            self.end(format!("Could not write the file: {e}"));
            return;
        }
        self.status.bytes += text.len() as u64;
        if self.status.bytes >= self.max_bytes {
            self.end(format!("Size limit reached ({} MB)", self.max_bytes / (1024 * 1024)));
        } else if self.start.elapsed() >= self.max_time {
            self.end(format!("Time limit reached ({} min)", self.max_time.as_secs() / 60));
        }
    }

    /// A game frame (its length varint, 2-byte type and body, as the parser reads it).
    pub fn frame(&mut self, frame: &[u8]) {
        self.frame_as('F', frame);
    }

    /// A frame from a bundle inside another packet (`E` lines).
    pub fn embedded(&mut self, frame: &[u8]) {
        self.frame_as('E', frame);
    }

    fn frame_as(&mut self, kind: char, frame: &[u8]) {
        if !self.status.recording {
            return;
        }
        let names = self.item_names(frame);
        if let Some(n) = &names {
            self.items_line(n);
        }
        if !self.kinds.combat && names.is_none() {
            return;
        }
        let mut text = format!("{kind} {} ", self.ms());
        text.reserve(frame.len() * 2 + 1);
        for b in frame {
            text.push_str(&format!("{b:02x}"));
        }
        text.push('\n');
        self.status.frames += 1;
        self.line(&text);
    }

    /// A mark set by the player. Line breaks in the label are flattened.
    pub fn mark(&mut self, label: &str) {
        if !self.status.recording {
            return;
        }
        let label: String = label.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
        let text = format!("M {} {}\n", self.ms(), label.trim());
        self.status.marks += 1;
        self.line(&text);
    }

    /// The other connections' summary, at the end of the file.
    fn summary(&mut self) {
        let mut lines: Vec<String> =
            self.conns.iter().map(|(k, c)| format!("# connection {k}: {} bytes, {} kept, {}\n", c.bytes, c.kept, c.verdict())).collect();
        lines.sort();
        for l in lines {
            let _ = self.out.write_all(l.as_bytes());
            self.status.bytes += l.len() as u64;
        }
    }

    fn end(&mut self, why: String) {
        self.summary();
        let _ = self.out.flush();
        self.status.ms = self.ms();
        self.status.recording = false;
        self.status.ended = Some(why);
    }

    pub fn stop(&mut self) {
        if self.status.recording {
            self.summary();
            let _ = self.out.flush();
            self.status.ms = self.ms();
            self.status.recording = false;
        }
    }

    pub fn status(&self) -> RecorderStatus {
        let mut s = self.status.clone();
        if s.recording {
            s.ms = self.ms();
        }
        s
    }
}

type FileRecording = Recording<BufWriter<File>>;
static CURRENT: Mutex<Option<FileRecording>> = Mutex::new(None);

/// Starts recording into a new file in `dir` (the one before is stopped), the default kinds. Returns its path.
pub fn start(dir: &Path) -> io::Result<PathBuf> {
    start_with(dir, Kinds::default(), HashMap::new())
}

/// Starts recording what `kinds` asks for; `items` = item code -> name, for `Kinds::items`. Returns its path.
pub fn start_with(dir: &Path, kinds: Kinds, items: HashMap<u32, String>) -> io::Result<PathBuf> {
    stop();
    std::fs::create_dir_all(dir)?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let path = dir.join(format!("aion2-packets-{secs}.txt"));
    let file = BufWriter::with_capacity(1 << 20, File::create(&path)?);
    let rec = Recording::with(file, Some(path.display().to_string()), MAX_TIME, MAX_BYTES, kinds, items)?;
    *CURRENT.lock() = Some(rec);
    OTHER.store(kinds.other, Ordering::Relaxed);
    crate::tap::install();
    Ok(path)
}

/// True while a recording keeps other connections: the capture then filters for all TCP (`pcap_capturer::capture_filters`).
static OTHER: AtomicBool = AtomicBool::new(false);

pub fn wants_other() -> bool {
    OTHER.load(Ordering::Relaxed)
}

type GameConns = Vec<(u16, std::net::Ipv4Addr, u16)>;
/// The game's connections, looked up at most every 2 s: (local port, remote address, remote port).
static GAME_CONNS: Mutex<Option<(Instant, GameConns)>> = Mutex::new(None);

/// A TCP segment from the capture (`capture::pcap_capturer`, each one it reads, before the dispatcher picks the game's):
/// written when it belongs to another connection of the game than the locked one. `lookup` = the game's connections
/// (`platform::window_detector::game_connections`).
pub fn segment(
    src: Option<std::net::Ipv4Addr>,
    src_port: u16,
    dst: Option<std::net::Ipv4Addr>,
    dst_port: u16,
    data: &[u8],
    locked_port: Option<u16>,
    lookup: fn() -> GameConns,
) {
    if !wants_other() || data.is_empty() {
        return;
    }
    let conns = {
        let mut cache = GAME_CONNS.lock();
        if cache.as_ref().is_none_or(|(at, _)| at.elapsed() >= Duration::from_secs(2)) {
            *cache = Some((Instant::now(), lookup()));
        }
        cache.as_ref().map(|(_, c)| c.clone()).unwrap_or_default()
    };
    let Some((from_server, ip, port, local)) = game_side(&conns, src, src_port, dst, dst_port) else { return };
    if Some(port) == locked_port {
        return; // the game connection: its frames come through the tap
    }
    if let Some(r) = CURRENT.lock().as_mut() {
        r.connection(from_server, &format!("{ip}:{port}"), local, data);
    }
}

/// Which of the game's connections a segment is on: (from the server, server address, server port, local port).
fn game_side(
    conns: &[(u16, std::net::Ipv4Addr, u16)],
    src: Option<std::net::Ipv4Addr>,
    src_port: u16,
    dst: Option<std::net::Ipv4Addr>,
    dst_port: u16,
) -> Option<(bool, std::net::Ipv4Addr, u16, u16)> {
    conns.iter().find_map(|&(local, ip, port)| {
        if Some(ip) == src && port == src_port && local == dst_port {
            Some((true, ip, port, local))
        } else if Some(ip) == dst && port == dst_port && local == src_port {
            Some((false, ip, port, local))
        } else {
            None
        }
    })
}

/// A frame from the parser's tap (`crate::tap`): written while a recording runs.
pub fn frame(frame: &[u8]) {
    if let Some(r) = CURRENT.lock().as_mut() {
        r.frame(frame);
    }
}

/// A frame from a bundle inside another packet (`crate::tap::embedded`).
pub fn embedded(frame: &[u8]) {
    if let Some(r) = CURRENT.lock().as_mut() {
        r.embedded(frame);
    }
}

/// What the capture went through, written as automatic marks while a recording runs when it changes: the
/// game's port, packets lost (the parser behind), TCP gaps gone past without their bytes (`tcp_order`).
pub fn note_capture(port: Option<u16>, lost: u64, gaps: u64) {
    static LAST: Mutex<Option<(Option<u16>, u64, u64)>> = Mutex::new(None);
    let mut last = LAST.lock();
    let mut current = CURRENT.lock();
    let Some(r) = current.as_mut().filter(|r| r.status.recording) else {
        *last = None;
        return;
    };
    let (p0, l0, g0) = last.unwrap_or((port, lost, gaps));
    if last.is_none() || p0 != port {
        r.mark(&format!("auto: game port {}", port.map_or("none".into(), |p| p.to_string())));
    }
    if lost > l0 {
        r.mark(&format!("auto: {} packets lost", lost - l0));
    }
    if gaps > g0 {
        r.mark(&format!("auto: {} TCP gaps skipped", gaps - g0));
    }
    *last = Some((port, lost, gaps));
}

pub fn mark(label: &str) {
    if let Some(r) = CURRENT.lock().as_mut() {
        r.mark(label);
    }
}

/// Stops the recording (the file is kept).
pub fn stop() -> RecorderStatus {
    OTHER.store(false, Ordering::Relaxed);
    match CURRENT.lock().as_mut() {
        Some(r) => {
            r.stop();
            r.status()
        }
        None => RecorderStatus::default(),
    }
}

pub fn status() -> RecorderStatus {
    CURRENT.lock().as_ref().map(|r| r.status()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn text(r: &Recording<Vec<u8>>) -> String {
        String::from_utf8(r.out.clone()).unwrap()
    }

    #[test]
    fn frames_and_marks_are_lines() {
        let mut r = Recording::new(Vec::new(), None, MAX_TIME, MAX_BYTES).unwrap();
        r.frame(&[0x05, 0x41, 0x36, 0x0a, 0xff]);
        r.mark("cube\nheard");
        r.embedded(&[0x0f, 0x00, 0x90]);
        let t = text(&r);
        let lines: Vec<&str> = t.lines().filter(|l| !l.starts_with('#')).collect();
        assert_eq!(lines.len(), 3);
        assert!(lines[2].starts_with("E ") && lines[2].ends_with(" 0f0090"), "{}", lines[2]);
        assert!(lines[0].starts_with("F ") && lines[0].ends_with(" 0541360aff"), "{}", lines[0]);
        assert!(lines[1].starts_with("M ") && lines[1].ends_with(" cube heard"), "{}", lines[1]);
        let s = r.status();
        assert_eq!((s.recording, s.frames, s.marks, s.bytes), (true, 2, 1, t.len() as u64));
    }

    fn items() -> HashMap<u32, String> {
        HashMap::from([(610511015, "Wrathful Ego".to_string())])
    }

    #[test]
    fn items_only_keeps_frames_with_a_known_item_named() {
        let kinds = Kinds { combat: false, items: true, other: false };
        let mut r = Recording::with(Vec::new(), None, MAX_TIME, MAX_BYTES, kinds, items()).unwrap();
        r.frame(&[0x05, 0x41, 0x36, 0x0a, 0xff]);
        let mut with = vec![0x0c, 0x1c, 0x56, 0x00];
        with.extend(610511015u32.to_le_bytes());
        r.frame(&with);
        let t = text(&r);
        let lines: Vec<&str> = t.lines().filter(|l| !l.starts_with('#')).collect();
        assert_eq!(lines.len(), 2, "{t}");
        assert!(lines[0].starts_with("I ") && lines[0].ends_with(" Wrathful Ego"), "{}", lines[0]);
        assert!(lines[1].starts_with("F ") && lines[1].ends_with(" 0c1c5600a7a86324"), "{}", lines[1]);
    }

    #[test]
    fn other_connections_are_kept_capped_and_summed_up() {
        let kinds = Kinds { combat: false, items: false, other: true };
        let mut r = Recording::with(Vec::new(), None, MAX_TIME, MAX_BYTES, kinds, HashMap::new()).unwrap();
        r.connection(false, "1.2.3.4:443", 50000, &[0x16, 0x03, 0x01]);
        r.connection(true, "1.2.3.4:443", 50000, &vec![7u8; MAX_PER_CONNECTION as usize + 10]);
        r.connection(true, "5.6.7.8:7000", 50001, b"hello hello hello");
        assert_eq!(r.status().connections, 2);
        r.stop();
        let t = text(&r);
        assert_eq!(t.lines().filter(|l| l.starts_with("C ")).count(), 3);
        assert!(t.contains(" c 1.2.3.4:443 160301\n"), "{t}");
        assert!(t.contains(&format!("# connection 1.2.3.4:443 (local port 50000): {} bytes, {} kept, TLS (encrypted)", MAX_PER_CONNECTION + 13, MAX_PER_CONNECTION)), "{t}");
        assert!(t.contains("# connection 5.6.7.8:7000 (local port 50001): 17 bytes, 17 kept, too little to tell"), "{t}");
    }

    #[test]
    fn a_segment_is_matched_to_the_game_connection_it_is_on() {
        let ip = std::net::Ipv4Addr::new(1, 2, 3, 4);
        let conns = [(50000, ip, 7000)];
        assert_eq!(game_side(&conns, Some(ip), 7000, None, 50000), Some((true, ip, 7000, 50000)));
        assert_eq!(game_side(&conns, None, 50000, Some(ip), 7000), Some((false, ip, 7000, 50000)));
        assert_eq!(game_side(&conns, Some(ip), 7000, None, 50001), None);
    }

    #[test]
    fn stops_at_the_size_limit() {
        let mut r = Recording::new(Vec::new(), None, MAX_TIME, 120).unwrap();
        for _ in 0..20 {
            r.frame(&[1, 2, 3, 4, 5, 6, 7, 8]);
        }
        let s = r.status();
        assert!(!s.recording);
        assert!(s.ended.unwrap().starts_with("Size limit"));
        assert!(s.frames < 20);
        let before = text(&r).len();
        r.mark("late");
        assert_eq!(text(&r).len(), before, "nothing is written after the end");
    }

    #[test]
    fn stops_at_the_time_limit() {
        let mut r = Recording::new(Vec::new(), None, Duration::ZERO, MAX_BYTES).unwrap();
        r.frame(&[1]);
        assert!(r.status().ended.unwrap().starts_with("Time limit"));
    }

    /// The recorder hangs on the parser's frame tap: a frame the meter reads lands in the file.
    #[test]
    fn records_the_frames_the_parser_reads() {
        use crate::capture::stream_processor::StreamProcessor;
        use crate::combat::data_storage::DataStorage;
        use crate::i18n::lookup::{NpcLookup, SkillLookup};
        let dir = std::env::temp_dir().join(format!("aion2-rec-test-{}", std::process::id()));
        let path = start(&dir).unwrap();
        let mut p = StreamProcessor::new(Arc::new(DataStorage::new()), Arc::new(SkillLookup::new()), Arc::new(NpcLookup::new()));
        let mut frame = vec![0x00, 0x04, 0x38, 0xe9, 0xde, 0x02, 0x06, 0x00, 0xc8, 0x0b];
        frame[0] = frame.len() as u8 + 3; // the length counts 3 bytes more than the frame
        p.consume_stream(&frame);
        mark("cube");
        let s = stop();
        assert!(!s.recording);
        let text = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(text.lines().any(|l| l.starts_with("F ") && l.ends_with(" 0d0438e9de020600c80b")), "{text}");
        assert!(text.lines().any(|l| l.starts_with("M ") && l.ends_with(" cube")), "{text}");
        assert_eq!((s.frames, s.marks), (1, 1));
    }
}
