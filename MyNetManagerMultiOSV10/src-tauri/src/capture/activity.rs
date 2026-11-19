//! Packet counters of the network interfaces, from the operating system (no capture needed): the start page
//! polls them and blinks an interface green while its counter grows, red while it stands still.
//!
//! Names match the capture interface list: Windows `\Device\NPF_{GUID}` (Npcap) and `\Device\NPF_Loopback`,
//! elsewhere the interface name libpcap uses (`eth0`, `en0`, `lo` …).

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Activity {
    pub name: String,
    /// Packets received and sent since the interface came up (only the change matters).
    pub packets: u64,
}

#[cfg(windows)]
pub fn activity() -> Vec<Activity> {
    use std::collections::HashMap;
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
    const IF_TYPE_SOFTWARE_LOOPBACK: u32 = 24;
    let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
    if unsafe { GetIfTable2(&mut table) }.is_err() || table.is_null() {
        return Vec::new();
    }
    // One adapter has several rows (its filter and driver layers): keep the largest counter per GUID.
    let mut by_name: HashMap<String, u64> = HashMap::new();
    unsafe {
        let count = (*table).NumEntries as usize;
        let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), count);
        for row in rows {
            let packets = row.InUcastPkts + row.InNUcastPkts + row.OutUcastPkts + row.OutNUcastPkts;
            let name = if row.Type == IF_TYPE_SOFTWARE_LOOPBACK {
                r"\Device\NPF_Loopback".to_string()
            } else {
                let g = row.InterfaceGuid;
                format!(
                    r"\Device\NPF_{{{:08X}-{:04X}-{:04X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}}}",
                    g.data1, g.data2, g.data3, g.data4[0], g.data4[1], g.data4[2], g.data4[3], g.data4[4], g.data4[5], g.data4[6], g.data4[7]
                )
            };
            let entry = by_name.entry(name).or_insert(0);
            *entry = (*entry).max(packets);
        }
        FreeMibTable(table as *const _);
    }
    by_name.into_iter().map(|(name, packets)| Activity { name, packets }).collect()
}

/// Linux: `/proc/net/dev` — after "name:", 8 receive fields then 8 transmit fields; packets are the 2nd of each.
#[cfg(target_os = "linux")]
pub fn activity() -> Vec<Activity> {
    std::fs::read_to_string("/proc/net/dev").map(|text| parse_proc_net_dev(&text)).unwrap_or_default()
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn parse_proc_net_dev(text: &str) -> Vec<Activity> {
    text.lines()
        .filter_map(|line| {
            let (name, rest) = line.split_once(':')?;
            let fields: Vec<u64> = rest.split_whitespace().filter_map(|f| f.parse().ok()).collect();
            if fields.len() < 10 {
                return None;
            }
            Some(Activity { name: name.trim().to_string(), packets: fields[1] + fields[9] })
        })
        .collect()
}

/// macOS / BSD: `netstat -ibn` — the link-level row of each interface has Ipkts and Opkts.
#[cfg(all(unix, not(target_os = "linux")))]
pub fn activity() -> Vec<Activity> {
    std::process::Command::new("netstat")
        .args(["-ibn"])
        .output()
        .ok()
        .map(|out| parse_netstat_ibn(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or_default()
}

#[cfg_attr(not(all(unix, not(target_os = "linux"))), allow(dead_code))]
pub fn parse_netstat_ibn(text: &str) -> Vec<Activity> {
    let mut lines = text.lines();
    let Some(head) = lines.next() else { return Vec::new() };
    let cols: Vec<&str> = head.split_whitespace().collect();
    let (Some(ip), Some(op)) = (cols.iter().position(|c| *c == "Ipkts"), cols.iter().position(|c| *c == "Opkts")) else { return Vec::new() };
    let mut out: Vec<Activity> = Vec::new();
    for line in lines {
        // Link rows have "<Link#n>" as the network; they carry the interface totals.
        if !line.contains("<Link#") {
            continue;
        }
        let f: Vec<&str> = line.split_whitespace().collect();
        // A link row may have no address column: count from the right, where Ipkts / Opkts sit at fixed places.
        let shift = cols.len().saturating_sub(f.len());
        let get = |i: usize| f.get(i.saturating_sub(shift)).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
        let name = f.first().map(|n| n.trim_end_matches('*').to_string()).unwrap_or_default();
        if !out.iter().any(|a| a.name == name) {
            out.push(Activity { name, packets: get(ip) + get(op) });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proc_net_dev_sums_received_and_sent_packets() {
        let text = "Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n    lo:  1000      10    0    0    0     0          0         0     1000      10    0    0    0     0       0          0\n  eth0: 98765     321    0    0    0     0          0         5    43210     123    0    0    0     0       0          0\n";
        let list = parse_proc_net_dev(text);
        assert_eq!(list, vec![Activity { name: "lo".into(), packets: 20 }, Activity { name: "eth0".into(), packets: 444 }]);
    }

    #[test]
    fn netstat_link_rows_give_the_interface_totals() {
        let text = "Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll\nlo0        16384 <Link#1>                        5000     0    500000     5000     0    500000     0\nlo0        16384 127           127.0.0.1          5000     -    500000     5000     -    500000     -\nen0        1500  <Link#6>    a4:83:e7:12:34:56   12345     0   9999999     6789     0    888888     0\n";
        let list = parse_netstat_ibn(text);
        assert_eq!(list, vec![Activity { name: "lo0".into(), packets: 10000 }, Activity { name: "en0".into(), packets: 19134 }]);
    }

    #[test]
    fn the_counters_can_be_read() {
        // Every system the program runs on has at least a loopback interface with a counter.
        let list = activity();
        assert!(!list.is_empty(), "no interface counters");
    }
}
