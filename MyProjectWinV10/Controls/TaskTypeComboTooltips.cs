using MyProject.Models;

namespace MyProject.Controls
{
    internal static class TaskTypeComboTooltips
    {
        public static void Attach(ComboBox combo)
        {
            var toolTip = new ToolTip
            {
                ShowAlways = true,
                AutomaticDelay = 300,
                AutoPopDelay = 8000,
                InitialDelay = 300
            };

            int hoverIndex = -1;

            combo.Disposed += (_, _) => toolTip.Dispose();
            combo.MouseMove += (_, e) =>
            {
                int index = GetItemIndexAtPoint(combo, e.Location);
                if (index == hoverIndex)
                    return;

                hoverIndex = index;
                if (index >= 0)
                    UpdateTooltip(combo, toolTip, index);
            };
            combo.SelectedIndexChanged += (_, _) =>
            {
                hoverIndex = combo.SelectedIndex;
                UpdateTooltip(combo, toolTip, combo.SelectedIndex);
            };
            combo.DropDownClosed += (_, _) =>
            {
                hoverIndex = -1;
                UpdateTooltip(combo, toolTip, combo.SelectedIndex);
            };

            if (combo.SelectedIndex >= 0)
                UpdateTooltip(combo, toolTip, combo.SelectedIndex);
        }

        private static void UpdateTooltip(ComboBox combo, ToolTip toolTip, int index)
        {
            if (index < 0 || index >= combo.Items.Count)
                return;

            toolTip.SetToolTip(combo, TaskTypeInfo.GetTooltipText((TaskType)index));
        }

        private static int GetItemIndexAtPoint(ComboBox combo, Point clientPoint)
        {
            if (!combo.DroppedDown)
                return combo.SelectedIndex;

            if (clientPoint.Y < combo.Height)
                return combo.SelectedIndex;

            int itemHeight = Math.Max(combo.ItemHeight, 1);
            int index = (clientPoint.Y - combo.Height) / itemHeight;
            if (index < 0 || index >= combo.Items.Count)
                return -1;

            return index;
        }
    }
}
