using System.ComponentModel;
using ImageRembgWinV10.Localization;
using ImageRembgWinV10.Resources;

namespace ImageRembgWinV10;

internal sealed class CanvasContextMenuBindings
{
    public required EventHandler Open { get; init; }
    public required EventHandler Save { get; init; }
    public required EventHandler Exit { get; init; }
    public required EventHandler Preview { get; init; }
    public required EventHandler RemoveBackground { get; init; }
    public required EventHandler Reset { get; init; }
    public required EventHandler ZoomIn { get; init; }
    public required EventHandler ZoomOut { get; init; }
    public required EventHandler Fit { get; init; }
    public required EventHandler ShowMaskCheckedChanged { get; init; }
    public required EventHandler ShowResultCheckedChanged { get; init; }
    public required EventHandler SelectFreehand { get; init; }
    public required EventHandler SelectRect { get; init; }
    public required EventHandler Foreground { get; init; }
    public required EventHandler Background { get; init; }
    public required EventHandler Pan { get; init; }
    public required EventHandler AlgoRembg { get; init; }
    public required EventHandler AlgoGrabCut { get; init; }
    public required EventHandler AlgoColorKey { get; init; }
    public required EventHandler AlgoEdgeFill { get; init; }
    public required EventHandler AlgoThreshold { get; init; }
}

internal sealed class CanvasContextMenuBuilder
{
    public ContextMenuStrip Menu { get; }

    public ToolStripMenuItem FileMenu { get; }
    public ToolStripMenuItem EditMenu { get; }
    public ToolStripMenuItem AlgorithmMenu { get; }
    public ToolStripMenuItem ViewMenu { get; }
    public ToolStripMenuItem ToolsMenu { get; }

    public ToolStripMenuItem Open { get; }
    public ToolStripMenuItem Save { get; }
    public ToolStripMenuItem Exit { get; }
    public ToolStripMenuItem Preview { get; }
    public ToolStripMenuItem RemoveBackground { get; }
    public ToolStripMenuItem Reset { get; }
    public ToolStripMenuItem ZoomIn { get; }
    public ToolStripMenuItem ZoomOut { get; }
    public ToolStripMenuItem Fit { get; }
    public ToolStripMenuItem ShowMask { get; }
    public ToolStripMenuItem ShowResult { get; }
    public ToolStripMenuItem SelectFreehand { get; }
    public ToolStripMenuItem SelectRect { get; }
    public ToolStripMenuItem Foreground { get; }
    public ToolStripMenuItem Background { get; }
    public ToolStripMenuItem Pan { get; }
    public ToolStripMenuItem AlgoRembg { get; }
    public ToolStripMenuItem AlgoGrabCut { get; }
    public ToolStripMenuItem AlgoColorKey { get; }
    public ToolStripMenuItem AlgoEdgeFill { get; }
    public ToolStripMenuItem AlgoThreshold { get; }

    public CanvasContextMenuBuilder(IContainer container, ImageList imageList, CanvasContextMenuBindings bindings)
    {
        Menu = new ContextMenuStrip(container);
        AppIconProvider.ConfigureToolStrip(Menu);

        FileMenu = CreateParent(L.Get("Menu.File"), "file", imageList);
        Open = CreateItem(L.Get("Menu.Open"), "open", imageList, bindings.Open, Keys.Control | Keys.O);
        Save = CreateItem(L.Get("Menu.Save"), "save", imageList, bindings.Save, Keys.Control | Keys.S);
        Exit = CreateItem(L.Get("Menu.Exit"), "exit", imageList, bindings.Exit);
        FileMenu.DropDownItems.AddRange([Open, Save, new ToolStripSeparator(), Exit]);

        EditMenu = CreateParent(L.Get("Menu.Edit"), "edit", imageList);
        Preview = CreateItem(L.Get("Menu.Preview"), "preview", imageList, bindings.Preview);
        RemoveBackground = CreateItem(L.Get("Menu.RemoveBackground"), "remove", imageList, bindings.RemoveBackground);
        Reset = CreateItem(L.Get("Menu.Reset"), "reset", imageList, bindings.Reset);
        EditMenu.DropDownItems.AddRange([Preview, RemoveBackground, Reset]);

        AlgorithmMenu = CreateParent(L.Get("Menu.Algorithm"), "algorithm", imageList);
        AlgoRembg = CreateCheckItem(L.Get("Algo.Rembg.Name"), "remove", imageList, bindings.AlgoRembg);
        AlgoGrabCut = CreateCheckItem(L.Get("Algo.GrabCut.Name"), "preview", imageList, bindings.AlgoGrabCut);
        AlgoColorKey = CreateCheckItem(L.Get("Algo.ColorKey.Name"), "background", imageList, bindings.AlgoColorKey);
        AlgoEdgeFill = CreateCheckItem(L.Get("Algo.EdgeFill.Name"), "select-rect", imageList, bindings.AlgoEdgeFill);
        AlgoThreshold = CreateCheckItem(L.Get("Algo.Threshold.Name"), "mask", imageList, bindings.AlgoThreshold);
        AlgorithmMenu.DropDownItems.AddRange([AlgoRembg, AlgoGrabCut, AlgoColorKey, AlgoEdgeFill, AlgoThreshold]);

        ViewMenu = CreateParent(L.Get("Menu.View"), "view", imageList);
        ZoomIn = CreateItem(L.Get("Menu.ZoomIn"), "zoom-in", imageList, bindings.ZoomIn);
        ZoomOut = CreateItem(L.Get("Menu.ZoomOut"), "zoom-out", imageList, bindings.ZoomOut);
        Fit = CreateItem(L.Get("Menu.Fit"), "fit", imageList, bindings.Fit);
        ShowMask = CreateCheckItem(L.Get("Menu.ShowMask"), "mask", imageList, bindings.ShowMaskCheckedChanged);
        ShowMask.Checked = true;
        ShowResult = CreateCheckItem(L.Get("Menu.ShowResult"), "result", imageList, bindings.ShowResultCheckedChanged);
        ViewMenu.DropDownItems.AddRange([ZoomIn, ZoomOut, Fit, new ToolStripSeparator(), ShowMask, ShowResult]);

        ToolsMenu = CreateParent(L.Get("Menu.Tools"), "tools", imageList);
        Pan = CreateCheckItem(L.Get("Menu.PanDrag"), "pan", imageList, bindings.Pan);
        Pan.Checked = true;
        SelectFreehand = CreateCheckItem(L.Get("Menu.SelectFreehand"), "select-freehand", imageList, bindings.SelectFreehand);
        SelectRect = CreateCheckItem(L.Get("Menu.SelectRect"), "select-rect", imageList, bindings.SelectRect);
        Foreground = CreateCheckItem(L.Get("Menu.Foreground"), "foreground", imageList, bindings.Foreground);
        Background = CreateCheckItem(L.Get("Menu.Background"), "background", imageList, bindings.Background);

        ToolsMenu.DropDownItems.AddRange([Foreground, Background]);

        Menu.Items.AddRange([
            Pan,
            SelectFreehand,
            SelectRect,
            new ToolStripSeparator(),
            FileMenu,
            EditMenu,
            AlgorithmMenu,
            ViewMenu,
            ToolsMenu
        ]);
    }

    public void ApplyLocalization()
    {
        FileMenu.Text = L.Get("Menu.File");
        Open.Text = L.Get("Menu.Open");
        Save.Text = L.Get("Menu.Save");
        Exit.Text = L.Get("Menu.Exit");
        EditMenu.Text = L.Get("Menu.Edit");
        Preview.Text = L.Get("Menu.Preview");
        RemoveBackground.Text = L.Get("Menu.RemoveBackground");
        Reset.Text = L.Get("Menu.Reset");
        AlgorithmMenu.Text = L.Get("Menu.Algorithm");
        AlgoRembg.Text = L.Get("Algo.Rembg.Name");
        AlgoGrabCut.Text = L.Get("Algo.GrabCut.Name");
        AlgoColorKey.Text = L.Get("Algo.ColorKey.Name");
        AlgoEdgeFill.Text = L.Get("Algo.EdgeFill.Name");
        AlgoThreshold.Text = L.Get("Algo.Threshold.Name");
        ViewMenu.Text = L.Get("Menu.View");
        ZoomIn.Text = L.Get("Menu.ZoomIn");
        ZoomOut.Text = L.Get("Menu.ZoomOut");
        Fit.Text = L.Get("Menu.Fit");
        ShowMask.Text = L.Get("Menu.ShowMask");
        ShowResult.Text = L.Get("Menu.ShowResult");
        ToolsMenu.Text = L.Get("Menu.Tools");
        Pan.Text = L.Get("Menu.PanDrag");
        SelectFreehand.Text = L.Get("Menu.SelectFreehand");
        SelectRect.Text = L.Get("Menu.SelectRect");
        Foreground.Text = L.Get("Menu.Foreground");
        Background.Text = L.Get("Menu.Background");
    }

    private static ToolStripMenuItem CreateParent(string text, string iconKey, ImageList imageList)
    {
        var item = new ToolStripMenuItem(text);
        AppIconProvider.ApplyMenuItem(item, imageList, iconKey);
        return item;
    }

    private static ToolStripMenuItem CreateItem(
        string text,
        string iconKey,
        ImageList imageList,
        EventHandler handler,
        Keys shortcutKeys = Keys.None)
    {
        var item = new ToolStripMenuItem(text);
        item.Click += handler;
        if (shortcutKeys != Keys.None)
        {
            item.ShortcutKeys = shortcutKeys;
        }

        AppIconProvider.ApplyMenuItem(item, imageList, iconKey);
        return item;
    }

    private static ToolStripMenuItem CreateCheckItem(
        string text,
        string iconKey,
        ImageList imageList,
        EventHandler handler)
    {
        var item = CreateItem(text, iconKey, imageList, handler);
        item.CheckOnClick = true;
        return item;
    }
}
