//! The Abyss's open-world bosses (companion code): the ones A2Tools' field-boss list leaves out.
//! On them, as on field bosses, the server sends no one else's direct hits since the Global update of
//! 2026-10-15 (`DpsCalculator::world_boss_rows`), so the meter shows you, your party and one Others row
//! from the HP the boss lost. Without this, a Watcher Kaira fight (2026-10-25, video) showed about
//! 17,000/s for everyone seen while the boss lost about 17% of its HP in 50 s.
//!
//! The NPC codes are the game data's (`data/i18n/npcs/en.json`) for the bosses the player identified in
//! the Abyss: Watcher Kaira, Guardian Lord Nahma (and Enraged), the Executors, and Argo, the Spirit King
//! (2600068 is on A2Tools' list already; its other codes are not).

/// NPC codes, sorted.
const ABYSS_WORLD_BOSSES: [i32; 15] = [
    2600068, // Argo, the Spirit King
    2600084, // Guardian Lord Nahma
    2600089, // Watcher Kaira
    2600093, // Guardian Lord Nahma
    2600094, // Guardian Lord Nahma
    2600096, // Executor Tamasa
    2600097, // Executor Argo
    2600098, // Executor Kaira
    2600150, // Enraged Guardian Lord Nahma
    2600156, // Enraged Guardian Lord Nahma
    2600368, // Argo, the Spirit King
    2600468, // Argo, the Spirit King
    2600478, // Enraged Guardian Lord Nahma
    2600479, // Enraged Guardian Lord Nahma
    2600480, // Enraged Guardian Lord Nahma
];

/// Whether an NPC code is one of the Abyss's open-world bosses.
pub fn is_abyss_world_boss(code: i32) -> bool {
    ABYSS_WORLD_BOSSES.binary_search(&code).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_list_is_sorted_and_knows_kaira() {
        assert!(ABYSS_WORLD_BOSSES.windows(2).all(|w| w[0] < w[1]));
        assert!(is_abyss_world_boss(2600089));
        assert!(!is_abyss_world_boss(2600090));
    }
}
