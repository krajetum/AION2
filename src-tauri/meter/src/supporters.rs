//! A2Tools colours the names of its Ko-fi supporters gold, from a roster it downloads.
//! The companion downloads nothing for the meter, so the roster is always empty:
//! this stub keeps the vendored calculator's calls unchanged.

#[derive(Debug, Default, Clone)]
pub struct Roster;

impl Roster {
    pub fn is_empty(&self) -> bool {
        true
    }

    pub fn contains(&self, _name: &str, _dbid: u64, _server_id: u16) -> bool {
        false
    }
}
