//! The companion's readers on A2Tools' frame tap (`capture::frame_tap`, one slot): every frame the
//! parser reads goes to the packet recorder (while it records), your position, the hidden cubes, your kills' soul points and your pet collection.

use std::sync::{Arc, Once};

static INSTALLED: Once = Once::new();

/// Sets the tap once (engine start, or the first recording); later calls do nothing.
pub fn install() {
    INSTALLED.call_once(|| {
        crate::capture::frame_tap::set(Some(Arc::new(|frame: &[u8]| {
            crate::position::observe(frame);
            crate::cubes::observe(frame, crate::position::me(), crate::clock::now_ms());
            crate::souls::observe(frame, crate::position::me(), crate::clock::now_ms());
            crate::pets::observe(frame, crate::clock::now_ms());
            crate::currencies::observe(frame, crate::clock::now_ms());
            crate::recorder::frame(frame);
        })));
    });
}

/// A frame from a compressed bundle inside another packet, which A2Tools' parser opens only for your identity
/// (`scan_embedded_bundles_for_identity`). The game sends some records this way, later copies of `33 36` among
/// them, so they may be copies of frames also read normally: only the pet collection and the currencies, where
/// a copy changes nothing, are read from them; the recorder writes them all (`E` lines) to find out what else comes this way.
pub fn embedded(frame: &[u8]) {
    crate::pets::observe(frame, crate::clock::now_ms());
    crate::currencies::observe(frame, crate::clock::now_ms());
    crate::recorder::embedded(frame);
}
