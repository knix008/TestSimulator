using System.Xml.Serialization;

namespace LVLGEditor1._0
{
    [XmlRoot("LvglScreen")]
    public class ScreenData
    {
        public string TitleText      { get; set; }
        public int    TitleFontSize  { get; set; }
        public string TitleAlignment { get; set; } // "Left" | "Center" | "Right"

        // Title bar icons
        public string TitleLeftIconPath  { get; set; }
        public string TitleRightIconPath { get; set; }

        // Colors (HTML hex, e.g. "#1A1A70")
        public string TitleBarBgColor   { get; set; }
        public string TitleBarFgColor   { get; set; }
        public string ContentBgColor    { get; set; }
        public string ContentFgColor    { get; set; }
        public string ShortcutBarBgColor { get; set; }

        [XmlArray("Rows")]
        [XmlArrayItem("Row")]
        public RowData[] Rows { get; set; }

        [XmlArray("ShortcutIcons")]
        [XmlArrayItem("Icon")]
        public IconData[] ShortcutIcons { get; set; }

        [XmlElement("Popup")]
        public PopupData Popup { get; set; }
    }

    public class RowData
    {
        public string Text        { get; set; }
        public int    FontSize    { get; set; }
        public string Alignment   { get; set; } // "Left" | "Center" | "Right"
        public string BgColor     { get; set; }
        public string BorderColor { get; set; }
        public int    BorderWidth { get; set; }

        [XmlArray("Icons")]
        [XmlArrayItem("Icon")]
        public IconData[] Icons { get; set; }

        [XmlArray("Buttons")]
        [XmlArrayItem("Button")]
        public ButtonData[] Buttons { get; set; }
    }

    public class ButtonData
    {
        public string Text        { get; set; }
        public int    X           { get; set; }
        public int    Y           { get; set; }
        public string BgColor     { get; set; }
        public string FgColor     { get; set; }
        public string BorderColor { get; set; }
        public int    BorderWidth { get; set; }
    }

    public class IconData
    {
        public string FilePath { get; set; }
        public int    X        { get; set; }
        public int    Y        { get; set; }
    }

    [XmlType("PopupData")]
    public class PopupData
    {
        public string PopupTitleText { get; set; } = "";
        public int    Columns        { get; set; } = 3;
        public int    Rows           { get; set; } = 4;
        public int    OverlayOpacity { get; set; } = 55;   // 0-100 percent
        public string PopupBgColor   { get; set; } = "#F0F0F0";
        public string BorderColor    { get; set; } = "#333333";
        public int    BorderWidth    { get; set; } = 2;
        public int    TextFontSize   { get; set; } = 24;
        public int    TextRows       { get; set; } = 1;
        public string TextBgColor    { get; set; } = "#F5F5F5";
        public string TextFgColor    { get; set; } = "#000000";
        public string GridBgColor    { get; set; } = "#C8C8D7";

        [XmlArray("Buttons")]
        [XmlArrayItem("Button")]
        public ButtonData[] Buttons { get; set; }
    }
}
