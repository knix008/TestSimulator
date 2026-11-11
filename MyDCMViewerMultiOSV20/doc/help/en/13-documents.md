<!-- tour: sr -->
# Document view — reports · ECG · RT · PDF

DICOM files that are not images open in the **Document view** (Tools › Document view).

## Structured report (SR)

![Structured report](images/help-sr.jpg)

Shows the report as a tree, with its title and completion and verification status. Text, codes, numbers (with units), dates, referenced images and coordinates are all shown. **Save HTML · Save text**.

<!-- tour: ecg -->
## ECG · waveforms

![ECG](images/help-ecg.jpg)

Draws DICOM waveforms such as a 12-lead ECG as one graph per channel. Change the **Speed** (mm/s), **Gain** (mm/mV) and **Columns**, then **Save CSV** (time plus each channel in physical units) or **Save PNG**.

<!-- tour: rt -->
## RT structure · plan · dose

![RT structure](images/help-rt.jpg)

| Type | What you see | Save |
| --- | --- | --- |
| RT structure set (RTSTRUCT) | ROI name · colour · type · contours · points | Contours as CSV |
| RT plan (RTPLAN) | Plan name · date · intent, fractions (count), beams (name · radiation · machine · gantry · collimator · couch angle · isocentre · MU), prescriptions | Text |
| RT dose (RTDOSE) | Multi-frame dose image — colour map, or laid over the CT with Image fusion | Image export |

## Encapsulated PDF · CDA · STL

An **Encapsulated PDF** shows as a preview; **Extract and save** gets the original PDF out. CDA, STL and similar documents are extracted as their original files.

<!-- tour: dicomdir -->
## DICOMDIR

A DICOMDIR from a CD, DVD or USB stick is listed as patient › study › series; **Load as series** opens the images.
