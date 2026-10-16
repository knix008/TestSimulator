// 그림 한 장. Electron 의 nativeImage 대신 쓴다 (RGBA, 곱하지 않은 알파).

use base64::Engine;
use image::{imageops::FilterType, ImageFormat, RgbaImage};
use std::io::Cursor;

#[derive(Clone, PartialEq)]
pub struct Picture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

impl std::fmt::Debug for Picture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Picture({}x{})", self.width, self.height)
    }
}

impl Picture {
    pub fn new(width: u32, height: u32, rgba: Vec<u8>) -> Option<Self> {
        if width == 0 || height == 0 || rgba.len() != (width * height * 4) as usize {
            return None;
        }
        Some(Self { width, height, rgba })
    }

    // Windows 비트맵(BGRA)에서.
    pub fn from_bgra(width: u32, height: u32, mut data: Vec<u8>) -> Option<Self> {
        for px in data.chunks_exact_mut(4) {
            px.swap(0, 2);
        }
        Self::new(width, height, data)
    }

    pub fn solid(width: u32, height: u32, value: u8) -> Self {
        Self { width, height, rgba: vec![value; (width * height * 4) as usize] }
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let img = image::load_from_memory(bytes).ok()?.to_rgba8();
        Self::new(img.width(), img.height(), img.into_raw())
    }

    pub fn from_file(path: &str) -> Option<Self> {
        let bytes = std::fs::read(path).ok()?;
        Self::from_bytes(&bytes)
    }

    fn buffer(&self) -> RgbaImage {
        RgbaImage::from_raw(self.width, self.height, self.rgba.clone()).unwrap()
    }

    // quality 'best' 는 Lanczos, 'good' 은 삼각 필터.
    pub fn resize(&self, width: u32, height: u32, best: bool) -> Picture {
        if width == self.width && height == self.height {
            return self.clone();
        }
        let filter = if best { FilterType::Lanczos3 } else { FilterType::Triangle };
        let out = image::imageops::resize(&self.buffer(), width.max(1), height.max(1), filter);
        Picture { width: out.width(), height: out.height(), rgba: out.into_raw() }
    }

    pub fn png(&self) -> Vec<u8> {
        let mut out = Vec::new();
        let _ = self.buffer().write_to(&mut Cursor::new(&mut out), ImageFormat::Png);
        out
    }

    pub fn data_url(&self) -> String {
        format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(self.png()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_png() {
        let pic = Picture::from_bgra(2, 1, vec![1, 2, 3, 255, 4, 5, 6, 0]).unwrap();
        assert_eq!(&pic.rgba[..4], &[3, 2, 1, 255]);
        let back = Picture::from_bytes(&pic.png()).unwrap();
        assert_eq!(back, pic);
        assert!(pic.data_url().starts_with("data:image/png;base64,"));
        assert_eq!(pic.resize(4, 2, true).width, 4);
        assert!(Picture::new(0, 0, vec![]).is_none());
    }
}
