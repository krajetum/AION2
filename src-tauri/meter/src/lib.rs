//! AION 2 Companion DPS meter core: passive packet capture, the game protocol parser
//! and combat aggregation.
//!
//! Vendored from A2Tools DPS Meter by taengu (https://github.com/taengu/a2tools-dps-meter),
//! GPL-3.0. The capture/, combat/, entity/ and i18n/ modules and clock.rs are A2Tools'
//! files with only the changes listed in NOTICE.md; supporters.rs and platform/ are
//! cut-down versions for the companion.
//!
//! The capture only reads a copy of the game's network traffic through Npcap/libpcap.
//! It never reads or writes the game's memory or files and never sends anything.

pub mod capture;
pub mod clock;
pub mod combat;
pub mod entity;
pub mod i18n;
pub mod supporters;

#[cfg(feature = "live")]
pub mod platform;

pub mod snapshot;
pub mod arena;
/// Packet recorder for finding new records (diagnostics).
pub mod recorder;
/// Your own position from the traffic.
pub mod position;
/// Your PvP kills and deaths.
pub mod kills;
/// Hidden cubes from the traffic.
pub mod cubes;
/// Your mob kills that gave soul points, and where.
pub mod souls;
/// The Abyss's open-world bosses (the Others row on them).
pub mod abyss_bosses;
/// Your pet collection (levels and soul points), when the Pets menu opens.
pub mod pets;
/// Your currencies (Kina, Abyss Points, Nightmare and Shugo Coins).
pub mod currencies;
/// The companion's readers on the parser's frame tap.
pub mod tap;

#[cfg(feature = "live")]
pub mod engine;
