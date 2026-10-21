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

#[cfg(feature = "live")]
pub mod engine;
