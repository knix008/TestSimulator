/*
 * Copyright (c) 2007-2012 Madhav Vaidyanathan
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License version 2.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 */

using System;
using System.IO;
using System.Collections.Generic;
using System.Text;


namespace MidiSheetMusic {

/** @class MidiTrack
 * The MidiTrack takes as input the raw MidiEvents for the track, and gets:
 * - The list of midi notes in the track.
 * - The first instrument used in the track.
 *
 * For each NoteOn event in the midi file, a new MidiNote is created
 * and added to the track, using the AddNote() method.
 * 
 * The NoteOff() method is called when a NoteOff event is encountered,
 * in order to update the duration of the MidiNote.
 */ 
public class MidiTrack {
    private int tracknum;             /** The track number */
    private List<MidiNote> notes;     /** List of Midi notes */
    private int instrument;           /** Instrument for this track */
    private List<MidiEvent> lyrics;   /** The lyrics in this track */

    /** Create an empty MidiTrack.  Used by the Clone method */
    public MidiTrack(int tracknum) {
        this.tracknum = tracknum;
        notes = new List<MidiNote>(20);
        instrument = 0;
    } 

    /** Create a MidiTrack based on the Midi events.  Extract the NoteOn/NoteOff
     *  events to gather the list of MidiNotes.
     */
    public MidiTrack(List<MidiEvent> events, int tracknum) {
        this.tracknum = tracknum;
        notes = new List<MidiNote>(events.Count);
        instrument = 0;
 
        foreach (MidiEvent mevent in events) {
            if (mevent.EventFlag == MidiFile.EventNoteOn && mevent.Velocity > 0) {
                MidiNote note = new MidiNote(mevent.StartTime, mevent.Channel, mevent.Notenumber, 0);
                AddNote(note);
            }
            else if (mevent.EventFlag == MidiFile.EventNoteOn && mevent.Velocity == 0) {
                NoteOff(mevent.Channel, mevent.Notenumber, mevent.StartTime);
            }
            else if (mevent.EventFlag == MidiFile.EventNoteOff) {
                NoteOff(mevent.Channel, mevent.Notenumber, mevent.StartTime);
            }
            else if (mevent.EventFlag == MidiFile.EventProgramChange) {
                instrument = mevent.Instrument;
            }
            else if (mevent.Metaevent == MidiFile.MetaEventLyric) {
                AddLyric(mevent);
            }
        }
        if (notes.Count > 0 && notes[0].Channel == 9)  {
            instrument = 128;  /* Percussion */
        }
        int lyriccount = 0;
        if (lyrics != null) { lyriccount = lyrics.Count; }
    }

    public int Number {
        get { return tracknum; }
    }

    public List<MidiNote> Notes {
        get { return notes; }
    }

    public int Instrument {
        get { return instrument; }
        set { instrument = value; }
    }

    public string InstrumentName {
        get { if (instrument >= 0 && instrument <= 128)
                  return MidiFile.Instruments[instrument];
              else
                  return "";
            }
    }

    public List<MidiEvent> Lyrics {
        get { return lyrics; }
        set { lyrics = value; }
    }

    /** Add a MidiNote to this track.  This is called for each NoteOn event */
    public void AddNote(MidiNote m) {
        notes.Add(m);
    }

    /** A NoteOff event occured.  Find the MidiNote of the corresponding
     * NoteOn event, and update the duration of the MidiNote.
     */
    public void NoteOff(int channel, int notenumber, int endtime) {
        for (int i = notes.Count-1; i >= 0; i--) {
            MidiNote note = notes[i];
            if (note.Channel == channel && note.Number == notenumber &&
                note.Duration == 0) {
                note.NoteOff(endtime);
                return;
            }
        }
    }

    /** Add a Lyric MidiEvent */
    public void AddLyric(MidiEvent mevent) {
        if (lyrics == null) {
            lyrics = new List<MidiEvent>();
        } 
        lyrics.Add(mevent);
    }

    /** Return a deep copy clone of this MidiTrack. */
    public MidiTrack Clone() {
        MidiTrack track = new MidiTrack(Number);
        track.instrument = instrument;
        foreach (MidiNote note in notes) {
            track.notes.Add( note.Clone() );
        }
        if (lyrics != null) {
            track.lyrics = new List<MidiEvent>();
            foreach (MidiEvent ev in lyrics) {
                track.lyrics.Add(ev);
            }
        }
        return track;
    }
    public override string ToString() {
        string result = "Track number=" + tracknum + " instrument=" + instrument + "\n";
        foreach (MidiNote n in notes) {
           result = result + n + "\n";
        }
        result += "End Track\n";
        return result;
    }
    
    // **** Added procedures for lyrics edit
    public string GetNormalStr(string FormattedText) {
       string tmpStr = FormattedText;
       if (tmpStr == "") return "";
       if (tmpStr.Length < 2) return tmpStr;

       string tmpStr2 = tmpStr.Substring(0, 2);  // Get the first character
       if (tmpStr2 == "/b") tmpStr = " " + tmpStr.Substring(2);
       else {
       	   if (tmpStr2 == "/n") tmpStr = "\n" + tmpStr.Substring(2);
       	   else
       	   if (tmpStr2 == "/r") tmpStr = "\r" + tmpStr.Substring(2);
       }
       
       if (tmpStr.Length < 2) return tmpStr;
       
       tmpStr2 = tmpStr.Substring(tmpStr.Length - 2, 2);  // Get the last character
       if (tmpStr2 == "/b") tmpStr = tmpStr.Substring(0, tmpStr.Length - 2) + " ";
       else {
           if (tmpStr2 == "/n") tmpStr = tmpStr.Substring(0, tmpStr.Length - 2) + "\n"; 
           else
           if (tmpStr2 == "/r") tmpStr = tmpStr.Substring(0, tmpStr.Length - 2) + "\r";
       }
       
       return tmpStr;
    }
    
    public string GetFormattedStr(string SourceText) {
       string tmpStr = SourceText;
       if (tmpStr == "") return "";
       
       string tmpStr2 = tmpStr.Substring(0, 1);  // Get the first character
       if (tmpStr2 == " ") tmpStr = "/b" + tmpStr.Substring(1);
       else {
       	   if (tmpStr2 == "\n") tmpStr = "/n" + tmpStr.Substring(1);
       	   else
       	   if (tmpStr2 == "\r") tmpStr = "/r" + tmpStr.Substring(1);
       }
       tmpStr2 = tmpStr.Substring(tmpStr.Length - 1, 1);  // Get the last character
       if (tmpStr2 == " ") tmpStr = tmpStr.Substring(0, tmpStr.Length - 1) + "/b";
       else {
           if (tmpStr2 == "\n") tmpStr = tmpStr.Substring(0, tmpStr.Length - 1) + "/n"; 
           else
           if (tmpStr2 == "\r") tmpStr = tmpStr.Substring(0, tmpStr.Length - 1) + "/r";
       }
       
       return tmpStr;
    }
    
    public string GetALyric(int startTime)
    {
        string tmpStr = "";

        if (lyrics == null) {
            return tmpStr;
        }
        
        for (int i = 0; i < lyrics.Count; i++) {
        	if (lyrics[i].StartTime < startTime) {
                continue;
            }
            
        	if (lyrics[i].StartTime == startTime) {
        		tmpStr = UTF8Encoding.Default.GetString(lyrics[i].Value, 0, lyrics[i].Value.Length);
        		int k = i + 1;
        		while (k < lyrics.Count) {
        		    if (lyrics[k].StartTime == startTime)  
        		    // Merge the lyrics' with same start time	
                       tmpStr += UTF8Encoding.Default.GetString(lyrics[k].Value, 0, lyrics[k].Value.Length);   
                    else
                       break;                    	
        		    k++;   	
        		}
        	//	startTime = lyrics[i].StartTime;
                break;
            } 
        	else {    // lyrics[i].StartTime > startTime(= start time of pointed symbol) 
        	  /*  if (i > 0) {
        		    tmpStr = UTF8Encoding.Default.GetString(lyrics[i-1].Value, 0, lyrics[i].Value.Length); 
        		    deltaTime = lyrics[i-1].StartTime;
        		} */

        	    break;
            }
        }

        return GetFormattedStr(tmpStr);
    }
    
    public void SaveALyric(int startTime, string ALyric)
    {
       // if (ALyric == "") {
       //     return;
       // }
    	
    	string aLyric = GetNormalStr(ALyric);
    	if ((lyrics == null) && (ALyric != "")) {
            lyrics = new List<MidiEvent>();
            MidiEvent mevent = new MidiEvent();
            mevent.StartTime = startTime;
            mevent.Metalength = System.Text.Encoding.Default.GetByteCount(aLyric);
            Encoding defaultCodePage = System.Text.Encoding.Default;
            mevent.Value = Encoding.Convert(Encoding.UTF8, defaultCodePage, Encoding.UTF8.GetBytes(aLyric));
            lyrics.Add(mevent);
            return;
        } 
        
        for (int i = 0; i < lyrics.Count; i++) {
        	if ((lyrics[i].StartTime < startTime) ) {
    			if ((i == (lyrics.Count - 1)) && (ALyric != "")) {
        	        MidiEvent mevent = new MidiEvent();
                    mevent.StartTime = startTime;
                    mevent.Metalength = System.Text.Encoding.Default.GetByteCount(aLyric);
                    Encoding defaultCodePage = System.Text.Encoding.Default;
                    mevent.Value = Encoding.Convert(Encoding.UTF8, defaultCodePage, Encoding.UTF8.GetBytes(aLyric));
                    lyrics.Add(mevent);	
                    break;                    
        		} 
        		else
                    continue;
            }
            else
        	if (lyrics[i].StartTime == startTime) {
            	if (ALyric != "") {
                    lyrics[i].Metalength = System.Text.Encoding.Default.GetByteCount(aLyric);
                    Encoding defaultCodePage = System.Text.Encoding.Default;
                    lyrics[i].Value = Encoding.Convert(Encoding.UTF8, defaultCodePage, Encoding.UTF8.GetBytes(aLyric));
            	}
            	else {
            		lyrics.RemoveAt(i);
            	}
              	
                break;
            } 
        	else {    // lyrics[i].StartTime > startTime
            	if (ALyric != "") {
            	    MidiEvent mevent = new MidiEvent();
                    mevent.StartTime = startTime;
                    mevent.Metalength = System.Text.Encoding.Default.GetByteCount(aLyric);
                    Encoding defaultCodePage = System.Text.Encoding.Default;
                    mevent.Value = Encoding.Convert(Encoding.UTF8, defaultCodePage, Encoding.UTF8.GetBytes(aLyric));
                    lyrics.Insert(i, mevent);		
            	}
        	    break;
            }
        }

        return;
    }
    
   // **** end of added procedures 
}

}

