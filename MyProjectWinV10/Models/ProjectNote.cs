namespace MyProject.Models
{
    public class ProjectNote
    {
        public int Id { get; set; }
        public string Title { get; set; } = "New Note";
        public string Body { get; set; } = "";
        /// <summary>Rich text (RTF) content. When empty, <see cref="Body"/> is shown as plain text.</summary>
        public string BodyRtf { get; set; } = "";
        public int TaskId { get; set; } = -1;
        public DateTime AnchorDate { get; set; } = DateTime.Today;
        public int ContentY { get; set; }
        public int OffsetDays { get; set; } = 0;
    }
}
