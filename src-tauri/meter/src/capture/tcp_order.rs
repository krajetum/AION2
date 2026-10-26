//! TCP segments back in stream order (companion code).
//!
//! A2Tools' assembler appends each segment's payload as it is captured. A segment the server sends again
//! (a retransmission) then comes twice, and one captured out of order lands in the wrong place: the parser
//! reads from the middle of a record, frames come out as junk until it finds its way back, and every
//! record in between is lost. The packet recording of 2026-10-26 21:15 shows it on a character change:
//! from 7.9 s to 36 s the frames are pieces of other frames and text, and the map load, the self record
//! and the pet collection the game sends on entering the world never came out.
//!
//! This puts the segments of one connection in sequence order: a retransmission or the part of a segment
//! already given is dropped, and a segment after a gap waits for the missing one. If it never comes (the
//! capture lost it: Npcap's queue full, or the parser behind), the stream goes on after the gap once
//! `GAP_WAIT_MS` has passed or too much waits, as it did before: nothing is held up for long.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};

/// Gaps the stream went on after without the missing bytes, since the start (for the packet recorder).
pub static GAPS_SKIPPED: AtomicU64 = AtomicU64::new(0);

/// How long a gap may hold the stream (capture time, ms).
pub const GAP_WAIT_MS: i64 = 1_000;
/// At most this much waits behind a gap.
pub const GAP_MAX_BYTES: usize = 1024 * 1024;

/// One connection's server-to-client stream.
#[derive(Default)]
pub struct TcpOrder {
    /// The sequence number of the next byte to give.
    next: Option<u32>,
    /// Segments after a gap, by sequence number.
    waiting: BTreeMap<u32, Vec<u8>>,
    waiting_bytes: usize,
    /// When the oldest gap began holding the stream.
    gap_since: Option<i64>,
}

/// `a - b` in sequence space (wraps at 2^32).
fn diff(a: u32, b: u32) -> i64 {
    a.wrapping_sub(b) as i32 as i64
}

impl TcpOrder {
    /// The payload of the segment at `seq`, captured at `now`: the bytes to read next, in order (none,
    /// while a gap waits).
    pub fn push(&mut self, seq: u32, data: &[u8], now: i64) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        if data.is_empty() {
            return out;
        }
        let Some(next) = self.next else {
            self.next = Some(seq.wrapping_add(data.len() as u32));
            out.push(data.to_vec());
            return out;
        };
        let d = diff(seq, next);
        if d > 0 {
            // After a gap: wait for the missing bytes (a longer copy of the same segment replaces it).
            let keep = self.waiting.get(&seq).is_none_or(|w| w.len() < data.len());
            if keep {
                if let Some(old) = self.waiting.insert(seq, data.to_vec()) {
                    self.waiting_bytes -= old.len();
                }
                self.waiting_bytes += data.len();
            }
            self.gap_since.get_or_insert(now);
        } else {
            self.give(seq, data, &mut out);
        }
        self.drain(&mut out);
        // The missing bytes are not coming: go on after the gap.
        while !self.waiting.is_empty()
            && (self.waiting_bytes > GAP_MAX_BYTES || self.gap_since.is_some_and(|t| now - t >= GAP_WAIT_MS))
        {
            let next = self.next.unwrap_or(0);
            // The first waiting segment in sequence order from `next`.
            let first = *self.waiting.keys().min_by_key(|&&s| diff(s, next)).unwrap();
            self.next = Some(first);
            GAPS_SKIPPED.fetch_add(1, Ordering::Relaxed);
            self.gap_since = None;
            self.drain(&mut out);
            if !self.waiting.is_empty() {
                self.gap_since = Some(now);
            }
        }
        out
    }

    /// Gives what `[seq, seq + len)` holds beyond `next`, if anything.
    fn give(&mut self, seq: u32, data: &[u8], out: &mut Vec<Vec<u8>>) {
        let next = self.next.unwrap_or(seq);
        let skip = diff(next, seq);
        if skip < 0 || skip as usize >= data.len() {
            return; // after a gap (not this one's turn), or all of it given already
        }
        out.push(data[skip as usize..].to_vec());
        self.next = Some(seq.wrapping_add(data.len() as u32));
    }

    /// Gives the waiting segments that now follow on.
    fn drain(&mut self, out: &mut Vec<Vec<u8>>) {
        loop {
            let Some(next) = self.next else { return };
            let ready: Vec<u32> = self.waiting.keys().copied().filter(|&s| diff(s, next) <= 0).collect();
            if ready.is_empty() {
                if self.waiting.is_empty() {
                    self.gap_since = None;
                }
                return;
            }
            for s in ready {
                let data = self.waiting.remove(&s).unwrap();
                self.waiting_bytes -= data.len();
                self.give(s, &data, out);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn joined(chunks: Vec<Vec<u8>>) -> Vec<u8> {
        chunks.concat()
    }

    #[test]
    fn in_order_segments_pass_through() {
        let mut o = TcpOrder::default();
        assert_eq!(joined(o.push(100, b"abc", 0)), b"abc");
        assert_eq!(joined(o.push(103, b"def", 0)), b"def");
    }

    #[test]
    fn a_retransmission_is_read_once() {
        let mut o = TcpOrder::default();
        o.push(100, b"abc", 0);
        o.push(103, b"def", 0);
        assert!(o.push(100, b"abc", 0).is_empty(), "the same segment again");
        assert_eq!(joined(o.push(104, b"efgh", 0)), b"gh", "a longer copy gives only what is new");
    }

    #[test]
    fn a_segment_out_of_order_waits_for_the_one_before() {
        let mut o = TcpOrder::default();
        o.push(100, b"abc", 0);
        assert!(o.push(106, b"ghi", 0).is_empty());
        assert!(o.push(109, b"jk", 0).is_empty());
        assert_eq!(joined(o.push(103, b"def", 0)), b"defghijk");
    }

    #[test]
    fn a_gap_that_never_fills_holds_the_stream_only_for_a_while() {
        let mut o = TcpOrder::default();
        o.push(100, b"abc", 0);
        assert!(o.push(106, b"ghi", 10).is_empty());
        assert!(o.push(109, b"jk", 500).is_empty());
        assert_eq!(joined(o.push(111, b"l", 10 + GAP_WAIT_MS)), b"ghijkl", "goes on after the lost bytes");
        assert!(o.push(103, b"def", 2_000).is_empty(), "the lost bytes, late: behind the stream now");
        assert_eq!(joined(o.push(112, b"m", 2_000)), b"m");
    }

    #[test]
    fn too_much_waiting_goes_on_at_once() {
        let mut o = TcpOrder::default();
        o.push(0x10, b"a", 0);
        let big = vec![7u8; GAP_MAX_BYTES + 1];
        assert_eq!(o.push(0x20, &big, 0).len(), 1);
    }

    #[test]
    fn sequence_numbers_wrap() {
        let mut o = TcpOrder::default();
        o.push(u32::MAX - 1, b"ab", 0);
        assert!(o.push(2, b"cd", 0).is_empty());
        assert_eq!(joined(o.push(0, b"xy", 0)), b"xycd");
    }
}
