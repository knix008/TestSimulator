# MyNetManager Tutorial

This tutorial walks through MyNetManager hands-on, in the same 9 chapters and 39 steps as the tour built into the
program (**Help › Tutorial**, F11). Every step has a picture of the program at that point and tells you what to do
yourself. You need no network access or permissions: everything uses the sample captures that come with the
program and the simulated demo interface.

- Samples used: **Mixed office LAN** (30 seconds of a small office network), **HTTP page load** and **TCP
  retransmissions and dup ACKs** — all on the **Sample captures** card of the start page and in **File › Open
  Sample Capture**.
- Every part is described in detail in the [User's Guide](UserGuide.en.md). 한국어: [튜토리얼](Tutorial.md).

> **The built-in tour.** Press **Start the tutorial** on the start page (or F11). A card at the bottom right shows
> the chapter, the step's text, ◀ (*Previous step*), ▶ (*Auto play*), **Next** and a chapter list; ✕ or Esc ends
> it. The part of the window each step is about is outlined in orange — as in the pictures below. The tour opens
> its own sample tabs and puts back every setting it changed when it ends.

## Chapter 1 — Start

### Step 1. Welcome to MyNetManager

![Step 1](images/en/60-tutorial-welcome.png)

The start page is the program's home. The large card at the top (the program-info card, which stays fixed) holds the
**User's Guide**, **Tutorial Document**, **Help** and **Start the tutorial** buttons.

**Try it:** press **Start the tutorial** to follow along inside the program, or keep reading here and do the steps by
hand.

### Step 2. Home button

![Step 2](images/en/61-tutorial-home.png)

The **Home** button at the start of the menu bar (Ctrl+Shift+H) brings you back to the start page from anywhere.
Open captures stay in their tabs, and pressing **Home** again returns to them.

### Step 3. Capture card

![Step 3](images/en/62-tutorial-capture-card.png)

The **Capture** card lists the network interfaces. **Demo traffic (simulated)** is always there: it produces LAN
traffic without permissions. The box above the list is the BPF **Capture filter**; ▶ or a double-click on an
interface starts capturing.

**Try it:** point at the ▶ of the demo interface to see its tooltip (*Start capturing on Demo traffic (simulated)*).
You will capture with it in chapter 7.

### Step 4. Sample captures

![Step 4](images/en/63-tutorial-samples-card.png)

The **Sample captures** card groups ready-made captures by topic — Basics, Web, Name services, Troubleshooting,
Routing & LAN, IoT & industrial, VoIP. A click opens one in a new tab.

### Step 5. Recent

![Step 5](images/en/64-tutorial-recent-card.png)

The **Recent** card lists recently opened files and folders. Every card except the program-info card can be moved
by its handle (top-left) and resized by its bottom-right corner; **Arrange** tidies them up again.

**Try it:** drag the **Recent** card by its handle to another place, then press **Arrange**.

## Chapter 2 — Open a capture

### Step 6. The capture window

![Step 6](images/en/65-tutorial-sample.png)

**Try it:** click **Mixed office LAN** on the Sample captures card.

The capture opens in a tab. From the top: the display filter bar, the packet list, the packet details and the packet
bytes. The **Navigator** on the left and the **Problems / Log / Analysis** panel at the bottom already show what the
automatic analysis found.

### Step 7. Packet list

![Step 7](images/en/66-tutorial-packet-list.png)

One row per packet, coloured by the coloring rules (ARP yellow, DNS light blue, TCP connection set-up grey, …).

**Try it:** click packet 3. Click the **Protocol** heading to sort by protocol, click it again to reverse the order,
then click **No.** to go back. Right-click a heading to see the column menu.

### Step 8. Packet details

![Step 8](images/en/67-tutorial-details.png)

The selected packet, dissected layer by layer. [Bracketed] lines are computed by the program; yellow and red lines are
expert information.

**Try it:** select packet 5 (a DNS query) and expand **Domain Name System**. Use **View › Details Tree › Expand
All** (Ctrl+Shift+Right) to open everything.

### Step 9. Packet bytes

![Step 9](images/en/68-tutorial-bytes.png)

Selecting a field highlights its bytes in the **Packet Bytes** pane, and clicking a byte selects its field.

**Try it:** in packet 5, click **Source Address** under *Internet Protocol Version 4* and watch four bytes light up;
then click a byte in the text column of the bytes pane.

### Step 10. Columns

![Step 10](images/en/69-tutorial-columns.png)

**View › Time Display Format** changes the Time column (for example *Time of Day*), and right-click a field ›
**Apply as Column** shows any value as a column of its own.

**Try it:** right-click **Frame Length** under *Frame* (or any field) › **Apply as Column**. Remove the new column again
from the heading's right-click menu.

## Chapter 3 — Filters

### Step 11. Display filter

![Step 11](images/en/70-tutorial-filter-bar.png)

The display filter bar uses Wireshark's syntax. While you type, it turns green (valid) or red (invalid) and suggests
field names.

**Try it:** click the bar (or press Ctrl+/) and type `dns`.

### Step 12. Applying a filter

![Step 12](images/en/71-tutorial-filter-apply.png)

**Try it:** press **Enter**. Only the DNS packets remain; the bar and the status bar show *Displayed N of 957*.
▾ lists recent filters and the bookmark button keeps filters you save.

### Step 13. An invalid filter

![Step 13](images/en/72-tutorial-filter-invalid.png)

**Try it:** type `tcp.port == ` (with nothing after `==`). The bar turns red; point at it to read why. Complete it as
`tcp.port == 443` and it turns green.

### Step 14. Filters from fields

![Step 14](images/en/73-tutorial-filter-from-field.png)

Right-click a field › **Apply as Filter** (or **Prepare as Filter**) builds a filter from its value, and the
*…and Selected* / *…or Selected* variants combine it with the current one.

**Try it:** clear the filter (✕), select packet 5, right-click **Destination Address** in the details ›
**Apply as Filter** › **Selected**. The bar now holds `ip.dst == 192.168.0.1`.

### Step 15. Filter expressions

![Step 15](images/en/74-tutorial-filter-expression.png)

**Analyze › Display Filter Expression…** (or the {+} button) lets you pick a protocol, a field, a relation and a
value; every registered field can be browsed here.

**Try it:** choose **dns**, **dns.qry.name**, **contains**, type `wikipedia` as the value, then **Apply as
Filter**.

### Step 16. Coloring rules

![Step 16](images/en/75-tutorial-coloring.png)

This step opens **TCP retransmissions and dup ACKs** and **View › Coloring Rules…**. The first matching rule from the
top wins; Wireshark *colorfilters* files can be imported and exported.

**Try it:** open the sample **TCP retransmissions and dup ACKs**, open the coloring rules, turn off the rule that
colours bad TCP and see the black rows of the packet list change. Press **Default rules** to undo.

## Chapter 4 — Analyze

### Step 17. Expert information

![Step 17](images/en/76-tutorial-expert.png)

**Analyze › Expert Information** (Ctrl+Shift+E) collects retransmissions, duplicate ACKs, zero windows, malformed
packets and more, by severity. Double-click a row to go to the packet. The **Problems** tab of the bottom panel lists
the same items packet by packet.

**Try it:** in **TCP retransmissions and dup ACKs**, open the bottom panel's **Problems** tab and click a
*Warning* row.

### Step 18. Follow stream

![Step 18](images/en/77-tutorial-follow.png)

**Try it:** open **HTTP page load**, select the first packet whose Info starts with `GET`, and choose **Analyze ›
Follow › TCP Stream** (Ctrl+Alt+Shift+T).

The data of the TCP connection is put together: the client (browser) in red, the server in blue. **Show data as**
switches to Hex Dump, C Arrays, YAML and more.

### Step 19. Conversation filter

![Step 19](images/en/78-tutorial-conversation-filter.png)

Right-click a packet › **Conversation Filter** › **TCP** keeps only the packets of that TCP connection — here
`ip.addr==192.168.0.10 && tcp.port==52344 && ip.addr==192.168.0.20 && tcp.port==80`. Choose **IPv4** for all traffic between the two hosts.

### Step 20. Decode As

![Step 20](images/en/79-tutorial-decode-as.png)

**Analyze › Decode As…** makes traffic on a non-standard port dissect as the protocol you choose — for example a web
server on port 8081 as HTTP. The values of the selected packet are offered first.

## Chapter 5 — Statistics

### Step 21. Capture file properties

![Step 21](images/en/80-tutorial-properties.png)

**Statistics › Capture File Properties** — file format, time span, interfaces, packet counts and average rates.

### Step 22. Protocol hierarchy

![Step 22](images/en/81-tutorial-hierarchy.png)

**Statistics › Protocol Hierarchy** — packets and bytes per protocol, as a tree.

**Try it:** select the **Domain Name System** row and press **Apply as Filter**: the packet list shows only DNS.

### Step 23. Conversations

![Step 23](images/en/82-tutorial-conversations.png)

**Statistics › Conversations** — packets, bytes and durations per **Ethernet**, **IPv4**, **IPv6**, **TCP** and
**UDP** conversation; the tabs switch the kind. Click a heading to sort, for example by **Bytes**.

### Step 24. I/O graphs

![Step 24](images/en/83-tutorial-io-graph.png)

**Statistics › I/O Graphs** — packets or bytes over time. Each graph has its own display filter and calculation
(SUM, MAX, AVG …).

**Try it:** press **Add**, give the new graph the filter `dns` and a colour, and press **Draw**.

### Step 25. Flow graph

![Step 25](images/en/84-tutorial-flow-graph.png)

**Statistics › Flow Graph** (here for **HTTP page load**) shows the packets between hosts as a sequence diagram: the
TCP handshake, each `GET` and its `200 OK`. Click a row to go to its packet.

## Chapter 6 — Network map

### Step 26. Network map

![Step 26](images/en/85-tutorial-net-map.png)

**Try it:** open **Mixed office LAN** again and press **Network Map** on the toolbar (Ctrl+Shift+N).

Hosts, the gateway, servers and external hosts found in the traffic are drawn with their links, grouped by subnet
around the gateway. **Layout** and **Labels** at the top of the map change how it is drawn.

### Step 27. Filtering by a node

![Step 27](images/en/86-tutorial-net-map-select.png)

**Try it:** click the router (the gateway in the middle). Only that device's packets stay in the packet list; the
filter bar shows the filter. Click it again, or **Show all packets**, to go back.

### Step 28. Filtering by a link

![Step 28](images/en/87-tutorial-net-map-link.png)

**Try it:** click the thickest line. Only the packets between its two devices remain. The wheel zooms, dragging the
background pans, and nodes can be dragged.

## Chapter 7 — Live capture

### Step 29. Capture options

![Step 29](images/en/88-tutorial-capture-options.png)

**Capture › Capture Options…** (Ctrl+K) — interface, capture filter, promiscuous mode, snapshot length and, on the
**Options** tab, auto-stop conditions.

**Try it:** choose **Demo traffic (simulated)**, set **Stop after time** to 10 seconds on the **Options** tab and
press **Start Capture**.

### Step 30. Live capture

![Step 30](images/en/89-tutorial-capture-demo.png)

Capturing from the demo interface: packets are dissected as they arrive and the list scrolls to the end. The status
bar shows *Capturing on Demo traffic (simulated)*.

### Step 31. Stopping

![Step 31](images/en/90-tutorial-capture-stop.png)

The **Stop Capture** button (or Ctrl+E) stops the capture; **Capture › Restart Capture** begins a new capture on the
same interface. The **Capture** button (outlined) starts it again.

## Chapter 8 — Files

### Step 32. Saving

![Step 32](images/en/91-tutorial-save.png)

**File › Save** (Ctrl+S) saves as pcapng, keeping comments; **Save as pcap…** writes classic pcap. Wireshark opens
both as they are.

**Try it:** save the demo capture from chapter 7, close its tab, and open it again from the **Recent** card.

### Step 33. Exporting

![Step 33](images/en/92-tutorial-export.png)

**File › Export Packet Dissections** — choose a range (all, displayed, marked, a range) and export as text, CSV, JSON,
PDML or C arrays. **File › Export Specified Packets…** writes a smaller capture file.

### Step 34. Export objects

![Step 34](images/en/93-tutorial-objects.png)

**File › Export Objects › HTTP Objects…** (here for **HTTP page load**) finds the files carried over HTTP — the HTML
page, the style sheet, the PNG logo, JSON — and saves one or all of them.

## Chapter 9 — Customize

### Step 35. Themes

![Step 35](images/en/94-tutorial-theme.png)

The dice button picks a random theme, ▾ chooses one. In dark themes the packet colours get darker too.

### Step 36. Pane layout

![Step 36](images/en/95-tutorial-layout.png)

**View › Panes and Bars** puts details and bytes side by side (**Details | Bytes**, **Bytes | Details**) or hides
them; drag the dividers to resize. The panel buttons at the right of the title row show and hide the navigator, the
bottom panel and the network map.

### Step 37. Settings

![Step 37](images/en/96-tutorial-settings.png)

**Edit › Settings…** — General, Start page, Theme, Font, Background, Layout, Capture, Resolution & analysis,
Protocols, Recent and Shortcuts, tab by tab. Changes apply at once.

### Step 38. Help

![Step 38](images/en/97-tutorial-help.png)

The **Help** menu opens the user's guide, this tutorial document, the display filter reference and the keyboard
shortcuts.

### Step 39. Done

![Step 39](images/en/98-tutorial-finish.png)

That is the whole tour. The **Tutorial** button on the toolbar (F11) runs it again any time. Next, try your own
capture files — or, in the desktop program, a real interface (see *Requirements for capturing real interfaces* in the
[User's Guide](UserGuide.en.md#requirements-for-capturing-real-interfaces)).
