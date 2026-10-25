//! The companion's readers on A2Tools' frame tap (`capture::frame_tap`, one slot): every frame the
//! parser reads goes to the packet recorder (while it records), your position, the hidden cubes and your kills' soul points.

use std::sync::{Arc, Once};

static INSTALLED: Once = Once::new();

/// Sets the tap once (engine start, or the first recording); later calls do nothing.
pub fn install() {
    INSTALLED.call_once(|| {
        crate::capture::frame_tap::set(Some(Arc::new(|frame: &[u8]| {
            crate::position::observe(frame);
            crate::cubes::observe(frame, crate::position::me(), crate::clock::now_ms());
            crate::souls::observe(frame, crate::position::me(), crate::clock::now_ms());
            crate::recorder::frame(frame);
        })));
    });
}
