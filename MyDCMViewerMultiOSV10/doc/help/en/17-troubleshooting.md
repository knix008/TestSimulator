# Troubleshooting

| Symptom | What to check |
| --- | --- |
| The desktop window is blank | Windows needs the WebView2 runtime. If the installer did not add it, download and install it |
| A compressed DICOM file does not open | Check the *Transfer syntax* in the info panel. Codecs are loaded from `vendor/` next to the page the first time they are needed |
| A DICOM video does not play | Browser engines cannot decode MPEG-2. HEVC needs an HEVC decoder on the computer. Save it with **Extract video** and watch it in a video player |
| No orientation markers | The file has no Image Orientation (Patient) or Patient Orientation |
| "Sort the folder as a DICOM series first" in MPR · 3D | Run Cine › Sort folder as DICOM series, then try again. All slices must be the same size |
| "WebGL2 is not available" in the 3D window | Update the graphics driver |
| Synchronised scrolling · reference lines do nothing | Both images need position information (Image Position · Orientation) |
| Image fusion comes out stretched to fit | The scans are different, so their patient coordinates do not overlap, or position information is missing |
| PACS Verify fails | Host · port · AE title (case), firewall, whether the PACS allows our AE |
| Nothing arrives with C-MOVE | The destination registered on the PACS (our AE · address · receive port). If in doubt, use C-GET |
| Batch convert output comes as a ZIP (web) | The folder is read-only. In Chrome or Edge, open the folder → allow writing |
| Cannot export to HEIC | The browser engine needs an HEVC encoder. Use AVIF or JPEG XL instead |
| Measurements are in pixels | The file has no pixel spacing. Use *Calibrate this length* |
