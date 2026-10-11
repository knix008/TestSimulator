//! Writes the Segment Info Duration into a WebM file.
//!
//! MediaRecorder streams WebM live, so it never knows the duration and leaves the
//! element out. Players then show no length and cannot seek. This rewrites only
//! the Info element; clusters are copied untouched.

use crate::tr;
const EBML_HEADER: u32 = 0x1A45_DFA3;
const SEGMENT: u32 = 0x1853_8067;
const INFO: u32 = 0x1549_A966;
const CLUSTER: u32 = 0x1F43_B675;
const TIMECODE_SCALE: u32 = 0x2A_D7B1;
const DURATION: u32 = 0x4489;

struct Element {
    id: u32,
    /// Offset of the first byte of the ID.
    start: usize,
    /// Offset of the first byte of the payload.
    data: usize,
    size_width: usize,
    /// `None` when the size is "unknown" (all value bits set).
    size: Option<u64>,
}

fn read_id(bytes: &[u8], pos: usize) -> Result<(u32, usize), String> {
    let first = *bytes.get(pos).ok_or_else(|| tr!("WebM이 중간에 끊겼습니다.", "The WebM file is truncated."))?;
    let width = first.leading_zeros() as usize + 1;
    if width > 4 {
        return Err(tr!("WebM 요소 ID가 올바르지 않습니다.", "Invalid WebM element ID."));
    }
    let slice = bytes.get(pos..pos + width).ok_or_else(|| tr!("WebM이 중간에 끊겼습니다.", "The WebM file is truncated."))?;
    Ok((slice.iter().fold(0u32, |id, byte| (id << 8) | u32::from(*byte)), width))
}

fn read_size(bytes: &[u8], pos: usize) -> Result<(Option<u64>, usize), String> {
    let first = *bytes.get(pos).ok_or_else(|| tr!("WebM이 중간에 끊겼습니다.", "The WebM file is truncated."))?;
    let width = first.leading_zeros() as usize + 1;
    if width > 8 {
        return Err(tr!("WebM 요소 크기가 올바르지 않습니다.", "Invalid WebM element size."));
    }
    let slice = bytes.get(pos..pos + width).ok_or_else(|| tr!("WebM이 중간에 끊겼습니다.", "The WebM file is truncated."))?;
    let mask = if width == 8 { 0 } else { 0xFFu8 >> width };
    let value = slice[1..]
        .iter()
        .fold(u64::from(first & mask), |value, byte| (value << 8) | u64::from(*byte));
    let unknown = value == (1u64 << (7 * width)) - 1;
    Ok((if unknown { None } else { Some(value) }, width))
}

fn read_element(bytes: &[u8], pos: usize) -> Result<Element, String> {
    let (id, id_width) = read_id(bytes, pos)?;
    let (size, size_width) = read_size(bytes, pos + id_width)?;
    Ok(Element { id, start: pos, data: pos + id_width + size_width, size_width, size })
}

fn encode_size(value: u64, min_width: usize) -> Result<Vec<u8>, String> {
    let width = (min_width.max(1)..=8)
        .find(|width| value < (1u64 << (7 * width)) - 1)
        .ok_or_else(|| tr!("WebM 요소가 너무 큽니다.", "The WebM element is too large."))?;
    let marked = value | (1u64 << (7 * width));
    Ok(marked.to_be_bytes()[8 - width..].to_vec())
}

fn id_bytes(id: u32) -> Vec<u8> {
    let bytes = id.to_be_bytes();
    let skip = bytes.iter().take_while(|byte| **byte == 0).count();
    bytes[skip..].to_vec()
}

fn read_uint(payload: &[u8]) -> u64 {
    payload.iter().fold(0u64, |value, byte| (value << 8) | u64::from(*byte))
}

/// Returns the file with Info/Duration set to `duration_ms`.
pub fn with_duration(bytes: &[u8], duration_ms: f64) -> Result<Vec<u8>, String> {
    let header = read_element(bytes, 0)?;
    if header.id != EBML_HEADER {
        return Err(tr!("WebM 파일이 아닙니다.", "Not a WebM file."));
    }
    let segment = read_element(bytes, header.data + header.size.ok_or_else(|| tr!("EBML 헤더 크기를 알 수 없습니다.", "Unknown EBML header size."))? as usize)?;
    if segment.id != SEGMENT {
        return Err(tr!("WebM Segment를 찾을 수 없습니다.", "The WebM Segment was not found."));
    }

    let mut pos = segment.data;
    let info = loop {
        let element = read_element(bytes, pos)?;
        match element.id {
            INFO => break element,
            CLUSTER => return Err(tr!("WebM Info가 Cluster보다 뒤에 있습니다.", "The WebM Info comes after a Cluster.")),
            _ => pos = element.data + element.size.ok_or_else(|| tr!("WebM 요소 크기를 알 수 없습니다.", "Unknown WebM element size."))? as usize,
        }
    };
    let info_end = info.data + info.size.ok_or_else(|| tr!("WebM Info 크기를 알 수 없습니다.", "Unknown WebM Info size."))? as usize;
    if info_end > bytes.len() {
        return Err(tr!("WebM Info가 중간에 끊겼습니다.", "The WebM Info is truncated."));
    }

    let mut body = Vec::new();
    let mut timecode_scale = 1_000_000u64;
    let mut child_pos = info.data;
    while child_pos < info_end {
        let child = read_element(bytes, child_pos)?;
        let child_end = child.data + child.size.ok_or_else(|| tr!("WebM Info 항목 크기를 알 수 없습니다.", "Unknown WebM Info entry size."))? as usize;
        if child.id == TIMECODE_SCALE {
            timecode_scale = read_uint(&bytes[child.data..child_end]).max(1);
        }
        if child.id != DURATION {
            body.extend_from_slice(&bytes[child.start..child_end]);
        }
        child_pos = child_end;
    }
    let ticks = duration_ms.max(0.0) * 1_000_000.0 / timecode_scale as f64;
    body.extend_from_slice(&id_bytes(DURATION));
    body.push(0x88);
    body.extend_from_slice(&ticks.to_be_bytes());

    let mut new_info = id_bytes(INFO);
    new_info.extend(encode_size(body.len() as u64, info.size_width)?);
    new_info.extend(body);
    let delta = new_info.len() as i64 - (info_end - info.start) as i64;

    let mut out = Vec::with_capacity(bytes.len() + new_info.len());
    out.extend_from_slice(&bytes[..segment.start]);
    out.extend(id_bytes(SEGMENT));
    match segment.size {
        Some(size) => out.extend(encode_size((size as i64 + delta) as u64, segment.size_width)?),
        None => out.extend_from_slice(&bytes[segment.data - segment.size_width..segment.data]),
    }
    out.extend_from_slice(&bytes[segment.data..info.start]);
    out.extend(new_info);
    out.extend_from_slice(&bytes[info_end..]);
    Ok(out)
}

/// Reads the Duration back in milliseconds, if present.
pub fn duration_ms(bytes: &[u8]) -> Option<f64> {
    let header = read_element(bytes, 0).ok()?;
    let segment = read_element(bytes, header.data + header.size? as usize).ok()?;
    let mut pos = segment.data;
    loop {
        let element = read_element(bytes, pos).ok()?;
        if element.id == INFO {
            let end = element.data + element.size? as usize;
            let mut scale = 1_000_000u64;
            let mut ticks = None;
            let mut child_pos = element.data;
            while child_pos < end {
                let child = read_element(bytes, child_pos).ok()?;
                let child_end = child.data + child.size? as usize;
                let payload = bytes.get(child.data..child_end)?;
                match (child.id, payload.len()) {
                    (TIMECODE_SCALE, _) => scale = read_uint(payload),
                    (DURATION, 8) => ticks = Some(f64::from_be_bytes(payload.try_into().ok()?)),
                    (DURATION, 4) => ticks = Some(f64::from(f32::from_be_bytes(payload.try_into().ok()?))),
                    _ => {}
                }
                child_pos = child_end;
            }
            return ticks.map(|ticks| ticks * scale as f64 / 1_000_000.0);
        }
        pos = element.data + element.size? as usize;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn element(id: u32, payload: &[u8]) -> Vec<u8> {
        let mut bytes = id_bytes(id);
        bytes.extend(encode_size(payload.len() as u64, 1).unwrap());
        bytes.extend_from_slice(payload);
        bytes
    }

    /// Shaped like Chromium's MediaRecorder output: unknown-size Segment, Info without Duration.
    fn live_webm(segment_size: Option<u64>) -> Vec<u8> {
        let mut info = element(TIMECODE_SCALE, &[0x0F, 0x42, 0x40]);
        info.extend(element(0x4D80, b"Chrome"));
        let mut segment_body = element(INFO, &info);
        segment_body.extend(element(0x1654_AE6B, &[0xAE, 0x80]));
        segment_body.extend(element(CLUSTER, &[0xE7, 0x81, 0x00]));
        let mut bytes = element(EBML_HEADER, &element(0x4282, b"webm"));
        bytes.extend(id_bytes(SEGMENT));
        match segment_size {
            Some(_) => bytes.extend(encode_size(segment_body.len() as u64, 8).unwrap()),
            None => bytes.extend_from_slice(&[0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
        }
        bytes.extend(segment_body);
        bytes
    }

    #[test]
    fn adds_duration_to_a_live_stream() {
        let original = live_webm(None);
        assert_eq!(duration_ms(&original), None);
        let fixed = with_duration(&original, 12_345.0).unwrap();
        assert_eq!(duration_ms(&fixed), Some(12_345.0));
        assert!(fixed.ends_with(&element(CLUSTER, &[0xE7, 0x81, 0x00])), "clusters are copied as-is");
        assert_eq!(fixed.len(), original.len() + 11);
    }

    #[test]
    fn replaces_an_existing_duration_and_updates_a_known_segment_size() {
        let original = live_webm(Some(0));
        let once = with_duration(&original, 1_000.0).unwrap();
        let twice = with_duration(&once, 2_500.0).unwrap();
        assert_eq!(duration_ms(&twice), Some(2_500.0));
        assert_eq!(once.len(), twice.len());
        let header = read_element(&twice, 0).unwrap();
        let segment = read_element(&twice, header.data + header.size.unwrap() as usize).unwrap();
        assert_eq!(segment.data + segment.size.unwrap() as usize, twice.len());
    }

    #[test]
    fn rejects_non_webm_input() {
        assert!(with_duration(b"\x00\x00\x00\x18ftypmp42", 1.0).is_err());
        assert!(with_duration(&[], 1.0).is_err());
    }
}
