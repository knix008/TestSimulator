<!-- tour: pacs -->
# PACS — DICOM network

**Tools › PACS (DICOM network)…** — exchanges images over DICOM with a hospital PACS or a modality. A web page cannot open network connections, so this works **in the desktop app only**.

![PACS window](images/help-pacs.jpg)

## 1. Add a remote node

Enter the **AE title** (case-sensitive), **Host** (IP address or name) and **Port** (usually 104 or 11112) your PACS administrator gave you, give it a name and click **Save**. Keep several nodes in the list and pick one.

## 2. Verify the connection (C-ECHO)

Click **Verify** — if a response time appears, you are connected.

## 3. Search for studies (C-FIND)

Enter a patient name (with `*` · `?` wildcards, such as `DOE^*`), patient ID, date range, modality (CT, MR …) or accession number and click **Search**. Click a study to list its series below.

## 4. Retrieve

| Method | Description |
| --- | --- |
| **C-GET** | Receives directly over the same connection. Most PACS (Orthanc, dcm4chee …) support it, and nothing extra needs to be registered |
| **C-MOVE** | The PACS sends to our receive port. **The PACS must have our AE title, this computer's address and the receive port registered as a destination.** Receiving turns on automatically when you click it |

If no series is selected, the whole study is retrieved. Received files are saved to `My folder/MyDCMViewer/PACS/<date-time>/`; when it finishes, that folder opens in the tree, sorted into series. If the other side cannot send compressed images, they are received uncompressed automatically.

## 5. Send (C-STORE)

Sends the open file (the whole series, if it is a sorted series) to the chosen node. If the other side does not accept the compressed format, it is converted to uncompressed and sent.

## 6. Receive (Storage SCP)

Under **This computer**, set *Our AE title* (default `MYDCMVIEWER`) and *Receive port* (default 11112) and click **Start receiving**; images other devices send are received and saved to the same folder. Closing the PACS window stops receiving too.

## Try it out

Without a PACS, `npm run mini-pacs` starts a small PACS (AE `MINIPACS`, port 11113) holding the images in samples/, so you can try every feature. To try C-MOVE, give it a destination, as in `node scripts/mini-pacs.cjs --dest MYDCMVIEWER=127.0.0.1:11112`.

| Problem | What to check |
| --- | --- |
| Verify fails | Host · port · AE title, firewall, whether the PACS allows our AE |
| Nothing arrives with C-MOVE | The destination registered on the PACS (AE · address · port), and the receive port in this computer's firewall. If in doubt, use C-GET |
