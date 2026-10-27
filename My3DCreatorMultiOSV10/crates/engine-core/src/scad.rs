use crate::types::Vec3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScadNode {
    Cube {
        size: Vec3,
        center: bool,
    },
    Sphere {
        radius: f32,
    },
    Cylinder {
        height: f32,
        r1: f32,
        r2: f32,
        center: bool,
    },
    Translate {
        offset: Vec3,
        children: Vec<ScadNode>,
    },
    Rotate {
        angles: Vec3,
        children: Vec<ScadNode>,
    },
    Scale {
        factor: Vec3,
        children: Vec<ScadNode>,
    },
    Union {
        children: Vec<ScadNode>,
    },
    Difference {
        children: Vec<ScadNode>,
    },
    Intersection {
        children: Vec<ScadNode>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScadParser;

impl ScadParser {
    pub fn parse_simple(code: &str) -> Vec<ScadNode> {
        let mut nodes = Vec::new();
        let cleaned = code.lines()
            .map(|l| {
                if let Some(idx) = l.find("//") {
                    &l[..idx]
                } else {
                    l
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        let mut pos = 0;
        let bytes = cleaned.as_bytes();

        while pos < bytes.len() {
            while pos < bytes.len() && bytes[pos].is_ascii_whitespace() {
                pos += 1;
            }
            if pos >= bytes.len() {
                break;
            }

            // Parse statements
            if let Some((node, next_pos)) = Self::parse_node(&cleaned, pos) {
                nodes.push(node);
                pos = next_pos;
            } else {
                pos += 1;
            }
        }

        nodes
    }

    fn parse_node(s: &str, start: usize) -> Option<(ScadNode, usize)> {
        let remaining = &s[start..];
        let trimmed = remaining.trim_start();
        let offset = start + (remaining.len() - trimmed.len());

        if trimmed.starts_with("cube(") {
            let end_paren = trimmed.find(')')?;
            let args = &trimmed[5..end_paren];
            let size = Self::parse_vec3(args).unwrap_or(Vec3::new(10.0, 10.0, 10.0));
            let center = args.contains("center=true") || args.contains("center = true");
            let mut end_pos = offset + end_paren + 1;
            if end_pos < s.len() && s.as_bytes()[end_pos] == b';' {
                end_pos += 1;
            }
            return Some((ScadNode::Cube { size, center }, end_pos));
        }

        if trimmed.starts_with("sphere(") {
            let end_paren = trimmed.find(')')?;
            let args = &trimmed[7..end_paren];
            let radius = Self::parse_float_arg(args, "r").or_else(|| Self::parse_float_arg(args, "d").map(|d| d * 0.5)).unwrap_or(10.0);
            let mut end_pos = offset + end_paren + 1;
            if end_pos < s.len() && s.as_bytes()[end_pos] == b';' {
                end_pos += 1;
            }
            return Some((ScadNode::Sphere { radius }, end_pos));
        }

        if trimmed.starts_with("cylinder(") {
            let end_paren = trimmed.find(')')?;
            let args = &trimmed[9..end_paren];
            let height = Self::parse_float_arg(args, "h").unwrap_or(10.0);
            let r = Self::parse_float_arg(args, "r").unwrap_or(5.0);
            let r1 = Self::parse_float_arg(args, "r1").unwrap_or(r);
            let r2 = Self::parse_float_arg(args, "r2").unwrap_or(r);
            let center = args.contains("center=true");
            let mut end_pos = offset + end_paren + 1;
            if end_pos < s.len() && s.as_bytes()[end_pos] == b';' {
                end_pos += 1;
            }
            return Some((ScadNode::Cylinder { height, r1, r2, center }, end_pos));
        }

        // Transforms with children block: translate([x, y, z]) { ... }
        if trimmed.starts_with("translate(") {
            let end_paren = trimmed.find(')')?;
            let args = &trimmed[10..end_paren];
            let offset_vec = Self::parse_vec3(args).unwrap_or(Vec3::ZERO);
            let _after_paren = &trimmed[end_paren + 1..].trim_start();
            let (children, end_pos) = Self::parse_children_or_single(s, offset + end_paren + 1)?;
            return Some((ScadNode::Translate { offset: offset_vec, children }, end_pos));
        }

        // CSG groups
        if trimmed.starts_with("difference()") {
            let (children, end_pos) = Self::parse_children_or_single(s, offset + 12)?;
            return Some((ScadNode::Difference { children }, end_pos));
        }

        if trimmed.starts_with("union()") {
            let (children, end_pos) = Self::parse_children_or_single(s, offset + 7)?;
            return Some((ScadNode::Union { children }, end_pos));
        }

        if trimmed.starts_with("intersection()") {
            let (children, end_pos) = Self::parse_children_or_single(s, offset + 14)?;
            return Some((ScadNode::Intersection { children }, end_pos));
        }

        None
    }

    fn parse_children_or_single(s: &str, mut pos: usize) -> Option<(Vec<ScadNode>, usize)> {
        while pos < s.len() && s.as_bytes()[pos].is_ascii_whitespace() {
            pos += 1;
        }
        if pos >= s.len() {
            return None;
        }

        if s.as_bytes()[pos] == b'{' {
            pos += 1;
            let mut children = Vec::new();
            while pos < s.len() {
                while pos < s.len() && s.as_bytes()[pos].is_ascii_whitespace() {
                    pos += 1;
                }
                if pos >= s.len() || s.as_bytes()[pos] == b'}' {
                    pos += 1;
                    break;
                }
                if let Some((child, next_pos)) = Self::parse_node(s, pos) {
                    children.push(child);
                    pos = next_pos;
                } else {
                    pos += 1;
                }
            }
            Some((children, pos))
        } else {
            // Single statement
            let (child, next_pos) = Self::parse_node(s, pos)?;
            Some((vec![child], next_pos))
        }
    }

    fn parse_vec3(args: &str) -> Option<Vec3> {
        let open = args.find('[')?;
        let close = args.find(']')?;
        let nums: Vec<f32> = args[open + 1..close]
            .split(',')
            .filter_map(|p| p.trim().parse::<f32>().ok())
            .collect();
        if nums.len() >= 3 {
            Some(Vec3::new(nums[0], nums[1], nums[2]))
        } else if nums.len() == 1 {
            Some(Vec3::new(nums[0], nums[0], nums[0]))
        } else {
            None
        }
    }

    fn parse_float_arg(args: &str, key: &str) -> Option<f32> {
        for part in args.split(',') {
            let p = part.trim();
            if let Some(rest) = p.strip_prefix(key) {
                let rest = rest.trim_start();
                if let Some(val_str) = rest.strip_prefix('=') {
                    if let Ok(val) = val_str.trim().parse::<f32>() {
                        return Some(val);
                    }
                }
            } else if let Ok(val) = p.parse::<f32>() {
                return Some(val);
            }
        }
        None
    }
}
