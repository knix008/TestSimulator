//! Damaged files, thousands of ways. Each must end in a result or an error: never a hang or a crash
//! that takes the program with it. Panics inside a decoder are caught at the door the app uses, so
//! that door is what is exercised.

mod common;
use common::*;
use std::path::Path;
use zipmaster_core::dispatch_envelope;

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

fn hammer(format: &str, ext: &str, password: Option<&str>) {
    let dir = scratch(&format!("fuzz-{}", ext.replace('.', "_")));
    let src = dir.join("src");
    std::fs::create_dir_all(&src).unwrap();
    std::fs::write(src.join("text.txt"), text(6000)).unwrap();
    std::fs::write(src.join("noise.bin"), noise(3000, 2)).unwrap();
    let good = dir.join(format!("good.{ext}"));
    pack(&good, format, &[&src], |o| o.password = password.map(String::from));
    let original = std::fs::read(&good).unwrap();
    // Silence the default hook: a caught panic in a damaged file is expected, not news.
    let c = ctx();
    let mut rng = Rng(0x1234_5678_9ABC_DEF1 ^ original.len() as u64);
    let path = dir.join(format!("bad.{ext}"));
    let out = dir.join("out");
    for round in 0..120 {
        let mut data = original.clone();
        match round % 4 {
            // A few flipped bytes.
            0 => {
                for _ in 0..1 + rng.below(8) {
                    let at = rng.below(data.len());
                    data[at] ^= 1 << rng.below(8);
                }
            }
            // A run of noise.
            1 => {
                let at = rng.below(data.len());
                let len = (1 + rng.below(64)).min(data.len() - at);
                for b in &mut data[at..at + len] {
                    *b = rng.next() as u8;
                }
            }
            // Cut short.
            2 => data.truncate(rng.below(data.len())),
            // Headers hit where it hurts: the start and the end.
            _ => {
                let span = data.len().min(128);
                for _ in 0..3 {
                    let at = rng.below(span);
                    data[at] = rng.next() as u8;
                    let end = data.len() - 1 - rng.below(span);
                    data[end] = rng.next() as u8;
                }
            }
        }
        std::fs::write(&path, &data).unwrap();
        let p = s(&path);
        let opts = |extra: serde_json::Value| {
            let mut o = serde_json::json!({ "path": p, "password": password });
            o.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
            o.to_string()
        };
        for op in ["list", "test"] {
            let reply: serde_json::Value = serde_json::from_str(&dispatch_envelope(&c, op, &opts(serde_json::json!({})))).expect("a JSON reply");
            assert!(reply.get("ok").is_some(), "{reply}");
        }
        let _ = std::fs::remove_dir_all(&out);
        let reply = dispatch_envelope(&c, "extract", &opts(serde_json::json!({ "dest": s(Path::new(&out)) })));
        assert!(serde_json::from_str::<serde_json::Value>(&reply).is_ok());
        // Whatever it thought of the file, nothing lands outside the destination.
        let stray: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|i| i.unwrap().file_name().to_string_lossy().into_owned()).collect();
        for name in stray {
            assert!(["src", "out"].contains(&name.as_str()) || name.starts_with("good.") || name.starts_with("bad."), "stray {name}");
        }
    }
}

#[test] fn zip_survives_damage() { hammer("zip", "zip", None); }
#[test] fn zip_aes_survives_damage() { hammer("zip", "zip", Some("pw")); }
#[test] fn sevenz_survives_damage() { hammer("7z", "7z", None); }
#[test] fn sevenz_aes_survives_damage() { hammer("7z", "7z", Some("pw")); }
#[test] fn rar_survives_damage() { hammer("rar", "rar", None); }
#[test] fn tar_survives_damage() { hammer("tar", "tar", None); }
#[test] fn tar_gz_survives_damage() { hammer("tar.gz", "tar.gz", None); }
#[test] fn tar_bz2_survives_damage() { hammer("tar.bz2", "tar.bz2", None); }
#[test] fn tar_xz_survives_damage() { hammer("tar.xz", "tar.xz", None); }
#[test] fn tar_zst_survives_damage() { hammer("tar.zst", "tar.zst", None); }

#[test]
fn zip_repair_survives_damage() {
    let dir = scratch("fuzz-repair");
    let src = dir.join("src");
    std::fs::create_dir_all(&src).unwrap();
    std::fs::write(src.join("a.txt"), text(5000)).unwrap();
    std::fs::write(src.join("b.bin"), noise(5000, 3)).unwrap();
    let good = dir.join("g.zip");
    pack(&good, "zip", &[&src], |_| {});
    let original = std::fs::read(&good).unwrap();
    let c = ctx();
    let mut rng = Rng(77);
    let bad = dir.join("b.zip");
    for _ in 0..200 {
        let mut data = original.clone();
        for _ in 0..1 + rng.below(30) {
            let at = rng.below(data.len());
            data[at] = rng.next() as u8;
        }
        std::fs::write(&bad, &data).unwrap();
        let reply = dispatch_envelope(&c, "repair", &serde_json::json!({ "path": s(&bad), "output": s(&dir.join("r.zip")) }).to_string());
        assert!(serde_json::from_str::<serde_json::Value>(&reply).is_ok());
    }
}
