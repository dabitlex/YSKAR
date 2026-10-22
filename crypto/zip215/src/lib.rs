//! Ed25519-Pruefung fuer YSKAR (docs/CONSENSUS_V6.md, Abschnitt 7.8).
//!
//! Duenne Huelle um `ed25519-zebra`. Keine eigene Kryptografie: Jede Zeile
//! hier reicht nur Bytes weiter. Die Schnittstelle ist bewusst roh -- feste
//! Puffer im Speicher des Moduls, ganze Zahlen als Rueckgabe --, damit auf der
//! JavaScript-Seite kein Bindungs-Generator noetig ist.
//!
//! Einzeln:   PUFFER = Signatur(64) | Schluessel(32) | Nachricht(0..=4096)
//!            verify(laenge) -> 1 gueltig, 0 ungueltig
//! Stapel:    STAPEL = n Eintraege je 128 Byte: Signatur(64) | Schluessel(32) | Nachricht(32)
//!            SAAT   = 32 Byte Zufall von der JavaScript-Seite
//!            verify_batch(n) -> 1 alle gueltig, 0 mindestens eine ungueltig
//!
//! Die Stapelpruefung braucht unvorhersehbare Koeffizienten; sie kommen aus
//! SAAT, die der Aufrufer bei jedem Aufruf frisch aus einer kryptografischen
//! Quelle fuellt. Die Regel aus 7.8 garantiert, dass Stapel und Einzelpruefung dasselbe
//! Ergebnis liefern.

use ed25519_zebra::{batch, Signature, VerificationKey, VerificationKeyBytes};
use rand_core::SeedableRng;

pub const MAX_NACHRICHT: usize = 4096;
pub const MAX_STAPEL: usize = 8192;
const EINTRAG: usize = 128;

static mut PUFFER: [u8; 96 + MAX_NACHRICHT] = [0; 96 + MAX_NACHRICHT];
static mut STAPEL: [u8; EINTRAG * MAX_STAPEL] = [0; EINTRAG * MAX_STAPEL];
static mut SAAT: [u8; 32] = [0; 32];

#[no_mangle]
pub extern "C" fn puffer() -> *mut u8 { core::ptr::addr_of_mut!(PUFFER) as *mut u8 }
#[no_mangle]
pub extern "C" fn stapel() -> *mut u8 { core::ptr::addr_of_mut!(STAPEL) as *mut u8 }
#[no_mangle]
pub extern "C" fn saat() -> *mut u8 { core::ptr::addr_of_mut!(SAAT) as *mut u8 }
#[no_mangle]
pub extern "C" fn max_stapel() -> u32 { MAX_STAPEL as u32 }

#[no_mangle]
pub extern "C" fn verify(laenge: u32) -> u32 {
    let n = laenge as usize;
    if n > MAX_NACHRICHT { return 0; }
    // SAFETY: einziger Zugriff waehrend dieses Aufrufs; WASM ist einfaedig.
    let b = unsafe { &*core::ptr::addr_of!(PUFFER) };
    let mut sig = [0u8; 64];
    sig.copy_from_slice(&b[0..64]);
    let mut pk = [0u8; 32];
    pk.copy_from_slice(&b[64..96]);
    let vk = match VerificationKey::try_from(pk) { Ok(v) => v, Err(_) => return 0 };
    match vk.verify(&Signature::from(sig), &b[96..96 + n]) { Ok(()) => 1, Err(_) => 0 }
}

#[no_mangle]
pub extern "C" fn verify_batch(anzahl: u32) -> u32 {
    let n = anzahl as usize;
    if n > MAX_STAPEL { return 0; }
    // SAFETY: wie oben.
    let b = unsafe { &*core::ptr::addr_of!(STAPEL) };
    let s = unsafe { *core::ptr::addr_of!(SAAT) };
    let mut v = batch::Verifier::new();
    for i in 0..n {
        let e = &b[i * EINTRAG..(i + 1) * EINTRAG];
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&e[0..64]);
        let mut pk = [0u8; 32];
        pk.copy_from_slice(&e[64..96]);
        v.queue((VerificationKeyBytes::from(pk), Signature::from(sig), &e[96..128]));
    }
    match v.verify(rand_chacha::ChaCha20Rng::from_seed(s)) { Ok(()) => 1, Err(_) => 0 }
}
