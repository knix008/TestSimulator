using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace MidiSheetMusic
{
    public partial class LyricsEditForm : Form
    {
        public bool Confirmed;
        public int X;
        public int Y;
        public int startTimeSymbol;
        public string lyrics;

        public LyricsEditForm()
        {
            InitializeComponent();
        }

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
        
        private void btnConfirm_Click(object sender, EventArgs e)
        {
            Confirmed = true;
            lyrics = GetNormalStr(textLyrics.Text);
        	Close();
        }

        private void btnCancel_Click(object sender, EventArgs e)
        {
            Close();
        }

        private void btnNewLine_Click(object sender, EventArgs e)
        {
            textLyrics.Text += "/n";
            textLyrics.Focus();
            textLyrics.Select(textLyrics.Text.Length, 0); 
        }

        private void LyricsEditForm_FormClosing(object sender, FormClosingEventArgs e)
        {

        }

        private void LyricsEditForm_Shown(object sender, EventArgs e)
        { 
          //  textStartTime.Text = startTimeSymbol.ToString();
            textStartTime.Text = string.Format("{0:n0}", startTimeSymbol); 
            textLyrics.Text = lyrics;
            textLyrics.Focus();
            textLyrics.Select(textLyrics.Text.Length, 0);  
        }

        private void LyricsEditForm_Load(object sender, EventArgs e)
        {
            Confirmed = false;
            this.Left = X;
            this.Top = Y;
        }

        private void btnAddSpace_Click(object sender, EventArgs e)
        {
            textLyrics.Text += "/b";
            textLyrics.Focus();
            textLyrics.Select(textLyrics.Text.Length, 0); 
        }

        private void textLyrics_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
                btnConfirm_Click(sender, e);
            else
                if (e.KeyCode == Keys.Escape)
                    btnCancel_Click(sender, e);
        }

    }
}
