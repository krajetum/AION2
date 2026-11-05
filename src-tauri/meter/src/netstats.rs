//! Packet loss on the game connection (companion code), from TCP retransmissions in both directions.
//!
//! The meter only reads a copy of the traffic, so it counts what TCP does about lost packets: a segment that
//! starts before the end of what was already seen in its direction is a retransmission. A packet lost on the
//! way to you shows as a gap that its resend later fills; one lost on the way to the server is captured
//! leaving and again when it is resent. Packets the capture itself dropped (Npcap's queue full) leave no
//! resend, so they are not counted. A resend TCP makes needlessly (a late ACK) counts too, so this reads as
//! "resent", an upper bound for the loss. The game's ping (`combat/ping_tracker.rs`) is A2Tools'.

use parking_lot::Mutex;
use std::collections::VecDeque;

/// Loss is the share of resent segments over this window.
pub const WINDOW_MS: i64 = 60_000;
/// Fewer segments than this in the window: no figure yet.
pub const MIN_SEGMENTS: usize = 50;

#[derive(Default)]
struct Side {
    /// Sequence number just after the furthest byte seen.
    end: Option<u32>,
}

#[derive(Default)]
struct State {
    /// The connection the counts are of: (server port, client port).
    conn: Option<(u16, u16)>,
    up: Side,
    down: Side,
    /// (capture time, resent) of every data segment in the window, both directions.
    seen: VecDeque<(i64, bool)>,
}

static STATE: Mutex<State> = parking_lot::const_mutex(State { conn: None, up: Side { end: None }, down: Side { end: None }, seen: VecDeque::new() });

/// `a - b` in sequence space (wraps at 2^32).
fn diff(a: u32, b: u32) -> i64 {
    a.wrapping_sub(b) as i32 as i64
}

impl State {
    fn segment(&mut self, conn: (u16, u16), to_server: bool, seq: u32, len: usize, at_ms: i64) {
        if len == 0 {
            return;
        }
        if self.conn != Some(conn) {
            *self = State { conn: Some(conn), ..State::default() };
        }
        let side = if to_server { &mut self.up } else { &mut self.down };
        let end = seq.wrapping_add(len as u32);
        let resent = side.end.is_some_and(|e| diff(seq, e) < 0);
        if side.end.is_none_or(|e| diff(end, e) > 0) {
            side.end = Some(end);
        }
        self.seen.push_back((at_ms, resent));
        while self.seen.front().is_some_and(|&(t, _)| at_ms - t > WINDOW_MS) {
            self.seen.pop_front();
        }
    }

    fn loss_pct(&self, now_ms: i64) -> Option<f64> {
        let recent = self.seen.iter().filter(|&&(t, _)| now_ms - t <= WINDOW_MS);
        let (n, resent) = recent.fold((0usize, 0usize), |(n, r), &(_, x)| (n + 1, r + x as usize));
        (n >= MIN_SEGMENTS).then(|| resent as f64 * 100.0 / n as f64)
    }
}

/// A data segment of the game's connection: `server_port` is the locked game port, `to_server` its direction.
pub fn segment(server_port: u16, client_port: u16, to_server: bool, seq: u32, len: usize, at_ms: i64) {
    STATE.lock().segment((server_port, client_port), to_server, seq, len, at_ms);
}

/// Resent segments over the last minute, in %; None until enough traffic.
pub fn loss_pct(now_ms: i64) -> Option<f64> {
    STATE.lock().loss_pct(now_ms)
}

pub fn reset() {
    *STATE.lock() = State::default();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resends_in_either_direction_count_reordered_ones_too() {
        let mut s = State::default();
        let c = (13328, 51000);
        for i in 0..98u32 {
            s.segment(c, i % 2 == 0, 1000 + (i / 2) * 100, 100, 1_000 + i as i64);
        }
        assert_eq!(s.loss_pct(2_000), Some(0.0));
        // The server resends a segment (lost on the way to you, or its ACK lost), you resend one.
        s.segment(c, false, 1000, 100, 2_000);
        s.segment(c, true, 1500, 100, 2_001);
        assert_eq!(s.loss_pct(2_001), Some(2.0));
        // A minute later they are out of the window, and too little traffic is left for a figure.
        assert_eq!(s.loss_pct(62_500), None);
    }

    #[test]
    fn a_new_connection_starts_over_and_sequence_numbers_wrap() {
        let mut s = State::default();
        s.segment((13328, 51000), false, u32::MAX - 50, 100, 0);
        s.segment((13328, 51000), false, 49, 100, 1); // after the wrap: new bytes
        assert!(s.seen.iter().all(|&(_, r)| !r));
        s.segment((13328, 52000), false, 5, 100, 2);
        assert_eq!(s.seen.len(), 1);
    }
}
