//! Packet recorder (diagnostics, companion code): writes every game frame the parser reads to a
//! text file, with marks the player sets ("I hear a cube", "I opened it"), so new records can be
//! found by comparing the frames around the marks. It hangs on A2Tools' frame tap
//! (`capture::frame_tap`, through `crate::tap`): the frames are the ones the meter already reads from its passive copy
//! of the traffic. Nothing is sent anywhere; the file stays on the player's disk.
//!
//! File format, one entry per line:
//! `# ...` header, `F <ms> <frame hex>` a frame, `M <ms> <label>` a mark;
//! `<ms>` counts from the start of the recording.

use parking_lot::Mutex;
use serde::Serialize;
use std::fs::File;
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// A recording stops by itself after this long...
pub const MAX_TIME: Duration = Duration::from_secs(15 * 60);
/// ...or once the file is this big.
pub const MAX_BYTES: u64 = 200 * 1024 * 1024;

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
}

impl<W: Write> Recording<W> {
    pub fn new(mut out: W, path: Option<String>, max_time: Duration, max_bytes: u64) -> io::Result<Self> {
        let header = "# AION 2 Companion packet recording (diagnostics)\n\
                      # F <ms> <frame hex> | M <ms> <label>\n";
        out.write_all(header.as_bytes())?;
        Ok(Self {
            out,
            start: Instant::now(),
            max_time,
            max_bytes,
            status: RecorderStatus { recording: true, path, bytes: header.len() as u64, ..Default::default() },
        })
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
        if !self.status.recording {
            return;
        }
        let mut text = format!("F {} ", self.ms());
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

    fn end(&mut self, why: String) {
        let _ = self.out.flush();
        self.status.ms = self.ms();
        self.status.recording = false;
        self.status.ended = Some(why);
    }

    pub fn stop(&mut self) {
        if self.status.recording {
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

/// Starts recording into a new file in `dir` (the one before is stopped). Returns its path.
pub fn start(dir: &Path) -> io::Result<PathBuf> {
    stop();
    std::fs::create_dir_all(dir)?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let path = dir.join(format!("aion2-packets-{secs}.txt"));
    let file = BufWriter::with_capacity(1 << 20, File::create(&path)?);
    let rec = Recording::new(file, Some(path.display().to_string()), MAX_TIME, MAX_BYTES)?;
    *CURRENT.lock() = Some(rec);
    crate::tap::install();
    Ok(path)
}

/// A frame from the parser's tap (`crate::tap`): written while a recording runs.
pub fn frame(frame: &[u8]) {
    if let Some(r) = CURRENT.lock().as_mut() {
        r.frame(frame);
    }
}

pub fn mark(label: &str) {
    if let Some(r) = CURRENT.lock().as_mut() {
        r.mark(label);
    }
}

/// Stops the recording (the file is kept).
pub fn stop() -> RecorderStatus {
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
        let t = text(&r);
        let lines: Vec<&str> = t.lines().filter(|l| !l.starts_with('#')).collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("F ") && lines[0].ends_with(" 0541360aff"), "{}", lines[0]);
        assert!(lines[1].starts_with("M ") && lines[1].ends_with(" cube heard"), "{}", lines[1]);
        let s = r.status();
        assert_eq!((s.recording, s.frames, s.marks, s.bytes), (true, 1, 1, t.len() as u64));
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
