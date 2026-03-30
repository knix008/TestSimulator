using System.Xml.Serialization;

namespace LVLGEditor1._0
{
    [XmlRoot("LvglScreen")]
    public class ScreenData
    {
        public string TitleText      { get; set; }
        public int    TitleFontSize  { get; set; }
        public string TitleAlignment { get; set; } // "Left" | "Center" | "Right"

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
    }

    public class RowData
    {
        public string Text      { get; set; }
        public int    FontSize  { get; set; }
        public string Alignment { get; set; } // "Left" | "Center" | "Right"

        [XmlArray("Icons")]
        [XmlArrayItem("Icon")]
        public IconData[] Icons { get; set; }
    }

    public class IconData
    {
        public string FilePath { get; set; }
        public int    X        { get; set; }
        public int    Y        { get; set; }
    }
}
