//! The companion's readers on A2Tools' frame tap (`capture::frame_tap`, one slot): every frame the
//! parser reads goes to the packet recorder (while it records) and to your position.

use std::sync::{Arc, Once};

static INSTALLED: Once = Once::new();

/// Sets the tap once (engine start, or the first recording); later calls do nothing.
pub fn install() {
    INSTALLED.call_once(|| {
        crate::capture::frame_tap::set(Some(Arc::new(|frame: &[u8]| {
            crate::position::observe(frame);
            crate::recorder::frame(frame);
        })));
    });
}
