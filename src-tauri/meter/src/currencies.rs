//! Your currencies (companion code): Kina and bound Kina, Abyss Points, Nightmare Coins and Shugo Coins, as items of the
//! inventory. From the packet recordings of 2026-10-26/27, checked against what the player read in game:
//!
//! ```text
//! <len> 11 56 ...           the whole inventory, on entering the world (before the map load and the self record)
//! <len> 1b 56 <count> count x 40 bytes                       items that changed, each:
//!       <action> 00 <slot u32> ... <item u32 @+10> <amount u64 @+14> ...
//! ```
//!
//! Each currency is an item with its own code, preceded by `00 00`, its amount a u64 after it:
//! - 930100031 Kina (unbound): 5,238,554 -> 5,239,061 on a kill (2026-10-27 11:49), the same +507 as the daily counter `a6 ff`;
//!   5,143,092 -> 5,061,092 at a shop (12:47).
//! - 930100001 bound Kina: 30,000 on 2026-10-26; to 0 in the same record as that Kina, a buy of "101k Kina"
//!   paid with the bound Kina first (the player: "about 19k", = 101k - 82,000) and 82,000 of the unbound.
//! - 930100003 Abyss Points: "about 300k", 300,795 -> 300,824 on kills, -75,000 at a shop to 225,824.
//! - 930100017 Nightmare Coins: "38k", -3,000 at a shop to 35,085.
//! - 930100011 Shugo Coins: "255", -20 at a shop to 235.
//!
//! The inventory comes before the game says who you are (`33 36`), so a full inventory is put on the character
//! of the next self record, not on the one played before a character change.

use std::collections::BTreeMap;

use parking_lot::Mutex;
use serde::Serialize;

use crate::capture::stream_processor::read_varint;

pub const KINA: u32 = 930_100_031;
pub const BOUND_KINA: u32 = 930_100_001;
pub const ABYSS_POINTS: u32 = 930_100_003;
pub const NIGHTMARE_COINS: u32 = 930_100_017;
pub const SHUGO_COINS: u32 = 930_100_011;
const CODES: [u32; 5] = [KINA, BOUND_KINA, ABYSS_POINTS, NIGHTMARE_COINS, SHUGO_COINS];

/// A character's currencies as last seen: item code -> amount.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wallet {
    pub owner: Option<String>,
    pub values: BTreeMap<u32, u64>,
    pub at_ms: i64,
}

#[derive(Default)]
struct State {
    wallet: Wallet,
    /// A whole inventory was read; its character is the one of the next self record.
    waiting_self: bool,
    /// That self record came: the profile is the inventory's character from the next update on.
    self_seen: bool,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

/// The currencies, on their character: `profile` is who the game says you play (the engine's profile name).
pub fn latest(profile: Option<&str>) -> Option<Wallet> {
    claim(STATE.lock().as_mut()?, profile)
}

fn claim(s: &mut State, profile: Option<&str>) -> Option<Wallet> {
    if s.wallet.owner.is_none() && (!s.waiting_self || s.self_seen) {
        if let Some(name) = profile.filter(|n| !n.trim().is_empty()) {
            s.wallet.owner = Some(name.to_string());
            s.waiting_self = false;
        }
    }
    (s.wallet.owner.is_some() && !s.wallet.values.is_empty()).then(|| s.wallet.clone())
}

/// Reads one game frame (its length varint, 2-byte type, body), as the parser hands it on.
pub fn observe(frame: &[u8], now_ms: i64) {
    let mut guard = STATE.lock();
    read(guard.get_or_insert_with(State::default), frame, now_ms);
}

fn read(s: &mut State, frame: &[u8], now_ms: i64) {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return;
    }
    let body = len.length as usize + 2;
    let Some(op) = frame.get(body - 2..body) else { return };
    match op {
        [0x11, 0x56] => {
            let values = amounts(&frame[body..]);
            if !values.is_empty() {
                s.wallet = Wallet { owner: None, values, at_ms: now_ms };
                s.waiting_self = true;
                s.self_seen = false;
            }
        }
        [0x1B, 0x56] => {
            let values = amounts(&frame[body..]);
            if !values.is_empty() {
                s.wallet.values.extend(values);
                s.wallet.at_ms = now_ms;
            }
        }
        [0x33, 0x36] if s.waiting_self => s.self_seen = true,
        _ => {}
    }
}

/// The currencies in a record: each code preceded by `00 00`, its amount the u64 after it.
fn amounts(body: &[u8]) -> BTreeMap<u32, u64> {
    let mut out = BTreeMap::new();
    for i in 2..body.len().saturating_sub(12) {
        let code = u32::from_le_bytes(body[i..i + 4].try_into().unwrap());
        if CODES.contains(&code) && body[i - 2..i] == [0, 0] {
            out.insert(code, u64::from_le_bytes(body[i + 4..i + 12].try_into().unwrap()));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// 2026-10-27 12:47, the shop: Nightmare Coins 35,085 (spent 3k of "38k"), then a record of three items: the
    /// bound Kina used up, Kina 5,061,092, and another item.
    #[test]
    fn changed_items_update_the_amounts() {
        let mut s = State::default();
        read(&mut s, &hex("561b56020100d595080000240000313370370d89000000000000010700000000000000000000000000000f000000f8a40200007e00006a26b41f02000000000000000400000000000000000000000000130000"), 1);
        read(&mut s, &hex("7d1b560302003e0f05000024000021337037000000000000000001010000000000000000000000000000420001000af10100008300003f337037e4394d00000000000100000000000000000000000000004200010046b90200006900002455a71fea0100000000000001200000000000000000000000002f0000"), 2);
        assert_eq!(s.wallet.values, BTreeMap::from([(NIGHTMARE_COINS, 35_085), (BOUND_KINA, 0), (KINA, 5_061_092)]));
        assert_eq!(s.wallet.at_ms, 2);
        assert_eq!(claim(&mut s, Some("Randronirk")).unwrap().owner.as_deref(), Some("Randronirk"), "mid-session: the character played");
    }

    /// A whole inventory goes on the character of the next self record, not the one played before it.
    #[test]
    fn an_inventory_waits_for_its_character() {
        let mut s = State::default();
        s.wallet = Wallet { owner: Some("Old".into()), values: BTreeMap::from([(KINA, 1)]), at_ms: 1 };
        let mut inv = vec![0u8, 0x11, 0x56, 0x10, 0x02, 0x01, 0x00, 0, 0, 0, 0, 0, 0, 0, 0];
        inv.extend(ABYSS_POINTS.to_le_bytes());
        inv.extend(300_795u64.to_le_bytes());
        inv.extend([0u8; 16]);
        inv[0] = (inv.len() + 2) as u8;
        read(&mut s, &inv, 5);
        assert_eq!(s.wallet.values, BTreeMap::from([(ABYSS_POINTS, 300_795)]), "the old character's amounts are not kept");
        assert!(claim(&mut s, Some("Old")).is_none(), "the profile still says the old character");
        read(&mut s, &[0x06, 0x33, 0x36, 0, 0, 0], 6);
        assert_eq!(claim(&mut s, Some("New")).unwrap().owner.as_deref(), Some("New"));
    }

    #[test]
    fn other_items_are_no_currency() {
        // Your loot of the day's common item, 2026-10-27 11:49.
        assert!(amounts(&hex("0100009c710c0000a300001a44de1f0100000000000000040000000000000000000000000000050000")).is_empty());
    }
}
