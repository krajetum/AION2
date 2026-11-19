//! Your currencies (companion code): Kina and bound Kina, Abyss Points, Nightmare Coins and Shugo Coins, as items of the
//! inventory. From the packet recordings of 2026-10-26/27, checked against what the player read in game:
//!
//! ```text
//! <len> 11 56 ...           the whole inventory, on entering the world (before the map load and the self record)
//! <len> 1b 56 <count> count x 40 bytes                       items that changed, each:
//!       <action> 00 <slot u32> ... <item u32 @+10> <amount u64 @+14> ...
//! ```
//!
//! Each item is `<slot u32> 00 <place u16> 00 <code u32> <amount u64>`, a currency an item with its own code. The
//! place is a u16: from 256 on its high byte is not 0 (`14 01`, a friend's Kina, 2026-10-27 14:00), so the bytes
//! before the code are `00 ?? ?? 00`, not `00 00` (read that way, that Kina was missed):
//! - 930100031 Kina (unbound): 5,238,554 -> 5,239,061 on a kill (2026-10-27 11:49), the same +507 as the daily counter `a6 ff`;
//!   5,143,092 -> 5,061,092 at a shop (12:47).
//! - 930100001 bound Kina: 12,000 + 500 Kina paid a 12,500 potion (14:00: 1,946,232 in all -> Kina 1,933,732);
//!   30,000 on 2026-10-26; to 0 in the same record as that Kina, a buy of "101k Kina"
//!   paid with the bound Kina first (the player: "about 19k", = 101k - 82,000) and 82,000 of the unbound.
//! - 930100003 Abyss Points: "about 300k", 300,795 -> 300,824 on kills, -75,000 at a shop to 225,824.
//! - 930100017 Nightmare Coins: "38k", -3,000 at a shop to 35,085.
//! - 930100011 Shugo Coins: "255", -20 at a shop to 235.
//!
//! The inventory comes before the game says who you are (`33 36`), so a full inventory is put on the character
//! of the next self record, not on the one played before a character change.
//!
//! The same records carry every other item (a loot of the day's common item, 2026-10-27 11:49, has the layout too):
//! the `<slot u32>` is the stack's own id (it stays when the stack moves), so the inventory's stacks of the item codes
//! the app asks for (`set_item_codes`: the Crafting page's items) are kept by it, summed per code in `Wallet::items`
//! once a whole inventory was read (on entering the world: a meter started in game sees only the changes).
//!
//! The byte after the amount is where the stack is, the next one its slot there (recordings of 2026-11-19, checked with
//! the player): `0f` the warehouse, `01` the bag (also the currencies), `0b` worn gear, `10` not known (two daggers).
//! The login inventory holds the warehouse too; opening it at the NPC sends its stacks again (a `1b 56` of 75 stacks),
//! opening it from the bag's button (subscription) sends nothing. A move between them is `45 56` (warehouse to bag)
//! or `43 56` (bag to warehouse), with the stack's `1b 56`: the same id, its new place (a split gets a new id).
//! Worn gear is not counted; the warehouse goes in `Wallet::stored`, the rest in `Wallet::items`.

use std::collections::{BTreeMap, HashSet};

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
    /// Abyss Points gained since the inventory was read, each with the map it came on (the last MAX_AP_GAINS).
    pub ap_gains: Vec<ApGain>,
    /// Pieces in the inventory per item code asked for (`set_item_codes`), none before a whole inventory was read.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<BTreeMap<u32, u64>>,
    /// The same in the warehouse.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stored: Option<BTreeMap<u32, u64>>,
}

/// Where a stack is: the byte after its amount.
const WAREHOUSE: u8 = 0x0f;
const WORN: u8 = 0x0b;

/// Abyss Points gained in one change (spending is not counted), on the map you were on (`position::map_id`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApGain {
    pub amount: u64,
    pub map_id: Option<i32>,
    pub at_ms: i64,
}
const MAX_AP_GAINS: usize = 500;

#[derive(Default)]
struct State {
    wallet: Wallet,
    /// A whole inventory was read; its character is the one of the next self record.
    waiting_self: bool,
    /// That self record came: the profile is the inventory's character from the next update on.
    self_seen: bool,
    /// The item codes the app asks for.
    known: HashSet<u32>,
    /// The inventory's stacks of those codes: stack id -> (code, pieces).
    bag: BTreeMap<u32, (u32, u64, u8)>, // stack id -> (code, pieces, where)
    /// When the last whole-inventory record came (none yet = the bag only has changes: not sent).
    bag_ms: Option<i64>,
}

/// A whole inventory may come in several records back to back: one within this of the last adds to it.
const INVENTORY_BURST_MS: i64 = 2_000;

/// The item codes whose inventory pieces to keep (the Crafting page's items). Stacks already read of other codes go.
pub fn set_item_codes(codes: &[u32]) {
    let mut guard = STATE.lock();
    let s = guard.get_or_insert_with(State::default);
    s.known = codes.iter().copied().filter(|c| !CODES.contains(c)).collect();
    let known = &s.known;
    s.bag.retain(|_, (code, _, _)| known.contains(code));
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
    if s.wallet.owner.is_none() || s.wallet.values.is_empty() {
        return None;
    }
    let mut w = s.wallet.clone();
    if s.bag_ms.is_some() {
        let (mut items, mut stored) = (BTreeMap::new(), BTreeMap::new());
        for &(code, n, place) in s.bag.values() {
            match place {
                WORN => {}
                WAREHOUSE => *stored.entry(code).or_insert(0) += n,
                _ => *items.entry(code).or_insert(0) += n,
            }
        }
        w.items = Some(items);
        w.stored = Some(stored);
    }
    Some(w)
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
                s.wallet = Wallet { owner: None, values, at_ms: now_ms, ap_gains: Vec::new(), items: None, stored: None };
                s.waiting_self = true;
                s.self_seen = false;
            }
            if s.bag_ms.is_none_or(|t| now_ms - t > INVENTORY_BURST_MS || now_ms < t) {
                s.bag.clear();
            }
            s.bag_ms = Some(now_ms);
            let known = &s.known;
            for (id, code, n, place) in stacks(&frame[body..], |c| known.contains(&c)) {
                s.bag.insert(id, (code, n, place));
            }
        }
        [0x1B, 0x56] => {
            let known = &s.known;
            for (id, code, n, place) in stacks(&frame[body..], |c| known.contains(&c)) {
                if n == 0 {
                    s.bag.remove(&id);
                } else {
                    s.bag.insert(id, (code, n, place));
                }
            }
            let values = amounts(&frame[body..]);
            if !values.is_empty() {
                // A gain: the amount before is known (inventory or an earlier change) and the new one is higher.
                if let (Some(&before), Some(&after)) = (s.wallet.values.get(&ABYSS_POINTS), values.get(&ABYSS_POINTS)) {
                    if after > before {
                        if s.wallet.ap_gains.len() >= MAX_AP_GAINS {
                            s.wallet.ap_gains.remove(0);
                        }
                        s.wallet.ap_gains.push(ApGain { amount: after - before, map_id: crate::position::map_id(), at_ms: now_ms });
                    }
                }
                s.wallet.values.extend(values);
                s.wallet.at_ms = now_ms;
            }
        }
        [0x33, 0x36] if s.waiting_self => s.self_seen = true,
        _ => {}
    }
}

/// The currencies in a record: each code after `00 <place u16> 00`, its amount the u64 after it (less than 10^13:
/// a code's bytes inside another field give nonsense).
fn amounts(body: &[u8]) -> BTreeMap<u32, u64> {
    stacks(body, |c| CODES.contains(&c)).into_iter().map(|(_, code, n, _)| (code, n)).collect()
}

/// Every item of a code `wanted` takes in a record: (stack id, code, pieces, where), the id the u32 before `00 <place u16> 00`
/// (0 when the record starts too close to read it), where the byte after the amount.
fn stacks(body: &[u8], wanted: impl Fn(u32) -> bool) -> Vec<(u32, u32, u64, u8)> {
    let mut out = Vec::new();
    for i in 4..body.len().saturating_sub(11) {
        let code = u32::from_le_bytes(body[i..i + 4].try_into().unwrap());
        let amount = u64::from_le_bytes(body[i + 4..i + 12].try_into().unwrap());
        if wanted(code) && body[i - 4] == 0 && body[i - 1] == 0 && amount < 10_000_000_000_000 {
            let id = if i >= 8 { u32::from_le_bytes(body[i - 8..i - 4].try_into().unwrap()) } else { 0 };
            out.push((id, code, amount, body.get(i + 12).copied().unwrap_or(0)));
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
        s.wallet = Wallet { owner: Some("Old".into()), values: BTreeMap::from([(KINA, 1)]), at_ms: 1, ap_gains: Vec::new(), items: None, stored: None };
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

    /// 2026-10-27 14:00, a friend buys a 12,500 Kina potion: 12,000 bound Kina used up, then Kina (in place 276,
    /// `14 01`) from 1,934,232 to 1,933,732. The game showed 1,946,232 before: both together.
    #[test]
    fn an_item_placed_past_255_is_read_too() {
        let mut s = State::default();
        read(&mut s, &hex("7d1b560302000fab110000f3000021337037000000000000000001010000000000000000000000000000420001006f030f00001401003f337037a4811d000000000001000000000000000000000000000042000000eda6130000080100b314991f320000000000000001010000000000000000000000002f0000"), 1);
        assert_eq!(s.wallet.values, BTreeMap::from([(BOUND_KINA, 0), (KINA, 1_933_732)]));
        // The same Kina in the inventory read on entering the world.
        assert_eq!(amounts(&hex("6f030f00001401003f33703798831d000000000001000000000000000000000000000004ec140000da0000a6ed981f37")), BTreeMap::from([(KINA, 1_934_232)]));
    }

    #[test]
    fn other_items_are_no_currency() {
        // Your loot of the day's common item, 2026-10-27 11:49.
        assert!(amounts(&hex("0100009c710c0000a300001a44de1f0100000000000000040000000000000000000000000000050000")).is_empty());
    }

    /// 2026-10-27 12:47: kills gave 300,795 then 300,824 Abyss Points (+29), and the shop took 75,000: one gain.
    #[test]
    fn abyss_points_gained_are_kept_spending_is_not() {
        let mut s = State::default();
        s.wallet.values.insert(ABYSS_POINTS, 300_795);
        let change = |s: &mut State, ap: u64, at: i64| {
            let mut f = vec![0u8, 0x1b, 0x56, 0x01, 0x01, 0x00, 1, 2, 3, 4, 0, 5, 0, 0];
            f.extend(ABYSS_POINTS.to_le_bytes());
            f.extend(ap.to_le_bytes());
            f.extend([0u8; 18]);
            f[0] = (f.len() + 1) as u8;
            read(s, &f, at);
        };
        change(&mut s, 300_824, 10);
        change(&mut s, 225_824, 20);
        assert_eq!(s.wallet.ap_gains.iter().map(|g| (g.amount, g.at_ms)).collect::<Vec<_>>(), [(29, 10)]);
        assert_eq!(s.wallet.values[&ABYSS_POINTS], 225_824);
    }

    /// One item: `<id u32> 00 <place u16> 00 <code u32> <amount u64>` and 16 bytes after, as in the records above.
    fn item(id: u32, place: u16, code: u32, n: u64) -> Vec<u8> {
        stack(id, place, code, n, 0x01)
    }
    /// One item, `at` = where it is (the byte after the amount).
    fn stack(id: u32, place: u16, code: u32, n: u64, at: u8) -> Vec<u8> {
        let mut b = id.to_le_bytes().to_vec();
        b.push(0);
        b.extend(place.to_le_bytes());
        b.push(0);
        b.extend(code.to_le_bytes());
        b.extend(n.to_le_bytes());
        b.push(at);
        b.extend([0u8; 15]);
        b
    }
    fn record(op: [u8; 2], items: &[Vec<u8>]) -> Vec<u8> {
        let mut f = vec![op[0], op[1], items.len() as u8, 0x01, 0x00];
        for i in items {
            f.extend(i);
        }
        let n = f.len() + 2; // the length as a two-byte varint
        assert!(n < 1 << 14);
        [vec![(n & 0x7f) as u8 | 0x80, (n >> 7) as u8], f].concat()
    }

    #[test]
    fn the_inventorys_crafting_items_are_summed_per_code() {
        const ORE: u32 = 610_100_001;
        const OTHER: u32 = 610_100_002;
        let mut s = State { known: HashSet::from([ORE]), ..State::default() };
        // Changes before any whole inventory: kept, not sent.
        read(&mut s, &record([0x1b, 0x56], &[item(9, 1, ORE, 3)]), 1);
        read(&mut s, &record([0x11, 0x56], &[item(1, 2, KINA, 500), item(2, 3, ORE, 40), item(3, 4, ORE, 25)]), 10);
        read(&mut s, &record([0x11, 0x56], &[item(4, 5, OTHER, 7)]), 11);
        read(&mut s, &[0x06, 0x33, 0x36, 0, 0, 0], 12);
        let w = claim(&mut s, Some("Me")).unwrap();
        assert_eq!(w.items, Some(BTreeMap::from([(ORE, 65)])), "two stacks summed, the earlier change dropped, an unknown code ignored");
        assert_eq!(w.values, BTreeMap::from([(KINA, 500)]));
        // A stack used down, the other used up.
        read(&mut s, &record([0x1b, 0x56], &[item(2, 3, ORE, 10), item(3, 4, ORE, 0)]), 20);
        assert_eq!(claim(&mut s, Some("Me")).unwrap().items, Some(BTreeMap::from([(ORE, 10)])));
    }

    #[test]
    fn an_inventory_in_two_records_back_to_back_is_one() {
        const ORE: u32 = 610_100_001;
        let mut s = State { known: HashSet::from([ORE]), ..State::default() };
        read(&mut s, &record([0x11, 0x56], &[item(1, 2, KINA, 500), item(2, 3, ORE, 40)]), 10);
        read(&mut s, &record([0x11, 0x56], &[item(3, 4, ORE, 2)]), 500);
        assert_eq!(s.bag.len(), 2);
        read(&mut s, &record([0x11, 0x56], &[item(1, 2, KINA, 500)]), 60_000);
        assert!(s.bag.is_empty(), "a new whole inventory later replaces it");
    }

    /// The login inventory of 2026-11-19 20:31: materials in the warehouse (`0f`), scrolls in the bag (`01`), a worn
    /// dagger (`0b`); then 5 of a stack taken out of the warehouse (`45 56`, the stack's place now `01`).
    #[test]
    fn bag_and_warehouse_apart_worn_gear_not_counted() {
        const ORE: u32 = 610_620_013;
        const SCROLL: u32 = 630_000_001;
        const DAGGER: u32 = 110_330_103;
        let mut s = State { known: HashSet::from([ORE, SCROLL, DAGGER]), ..State::default() };
        read(&mut s, &record([0x11, 0x56], &[item(1, 2, KINA, 500), stack(2, 3, ORE, 118, 0x0f), stack(3, 4, SCROLL, 89, 0x01), stack(4, 5, DAGGER, 1, 0x0b)]), 10);
        read(&mut s, &[0x06, 0x33, 0x36, 0, 0, 0], 11);
        let w = claim(&mut s, Some("Me")).unwrap();
        assert_eq!((w.items.unwrap(), w.stored.unwrap()), (BTreeMap::from([(SCROLL, 89)]), BTreeMap::from([(ORE, 118)])));
        read(&mut s, &record([0x1b, 0x56], &[stack(2, 3, ORE, 118, 0x01)]), 20);
        let w = claim(&mut s, Some("Me")).unwrap();
        assert_eq!((w.items.unwrap(), w.stored.unwrap()), (BTreeMap::from([(ORE, 118), (SCROLL, 89)]), BTreeMap::new()));
    }
}
