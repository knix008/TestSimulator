<!-- tour: cine -->
# Cine playback · DICOM video · series

## Playing multi-frame images

Files with many frames, such as ultrasound, angiography or cardiac MR, show a **frame bar** below the image.

![Frame bar](images/help-cine.jpg)

| Button | Key | What it does |
| --- | --- | --- |
| ⏮ First frame | `Home` | Go to the start |
| ◀ Previous frame | `↑` | One frame back |
| ▶ Play | `Space` | Play — the button is highlighted while playing |
| ⏸ Pause | `Space` | Stop at the current frame |
| ⏹ Stop | `S` | Stop and go back to the first frame |
| ▶ Next frame | `↓` | One frame forward |
| ⏭ Last frame | `End` | Go to the end |
| Slider | | Jump to any frame |
| fps · Loop | | Playback speed and looped playback |

The same commands are in the **Cine** menu. The initial fps comes from the file's Frame Time or Cine Rate.

## DICOM video

DICOM videos (endoscopy, ultrasound, surgery and more) stored as MPEG-4 AVC (H.264), HEVC (H.265) or MPEG-2 also open.

![DICOM video](images/help-video.jpg)

- **H.264 · HEVC**: the computer's video engine handles **Play · Pause · Stop** directly, and you can step frame by frame to measure and export. Change the playback speed in the fps box.
- Formats the browser engine cannot decode, such as **MPEG-2** (or HEVC on a computer without an HEVC decoder), show an information screen instead. Use **Extract video** to save an `.m2v` or `.mp4` file and watch it in a video player such as VLC.
- **Tools › Extract the video of a DICOM video** saves H.264 and HEVC as MP4, and MPEG-2 as the original stream.

![Video that cannot be played](images/help-video-mpeg2.jpg)

## Moving through a series

When a folder holds several files, a **series bar** appears. Move through it with `←` `→`, `PgUp` `PgDn` or the series slider; zoom, pan and window stay the same as you go. Pressing play on a series of single-frame files steps through the files in turn.
