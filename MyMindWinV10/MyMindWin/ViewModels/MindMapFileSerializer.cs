using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public static class MindMapFileSerializer
    {
        private static readonly JsonSerializerOptions Options = new()
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public static string Serialize(MindMapDocument document)
            => JsonSerializer.Serialize(document, Options);

        public static MindMapDocument Deserialize(string json)
        {
            var doc = JsonSerializer.Deserialize<MindMapDocument>(json, Options);
            if (doc?.Root != null)
                return doc;

            var legacyRoot = JsonSerializer.Deserialize<MindMapNode>(json, Options);
            if (legacyRoot == null)
                throw new InvalidDataException("Invalid mind map file format.");

            return new MindMapDocument { Root = legacyRoot, Layout = "tree", Version = 1 };
        }

        public static MindMapDocument CreateFromViewModel(MainViewModel vm)
        {
            if (vm.RootNode == null)
                throw new InvalidOperationException("No document to save.");

            SyncViewModelToModel(vm.RootNode);

            return new MindMapDocument
            {
                Version = 1,
                Layout = LayoutToString(vm.LayoutType),
                ConnectionLine = ConnectionLineToString(vm.ConnectionLineType),
                Root = vm.RootNode.Model
            };
        }

        public static LayoutType ParseLayout(string layout) =>
            layout.Equals("radial", StringComparison.OrdinalIgnoreCase)
                ? LayoutType.Radial
                : LayoutType.HorizontalTree;

        public static string LayoutToString(LayoutType layout) =>
            layout == LayoutType.Radial ? "radial" : "tree";

        public static ConnectionLineType ParseConnectionLine(string? connectionLine) =>
            ConnectionLineTypeExtensions.FromJsonValue(connectionLine);

        public static string ConnectionLineToString(ConnectionLineType type) =>
            type.ToJsonValue();

        private static void SyncViewModelToModel(NodeViewModel vm)
        {
            vm.SyncToModel();
            foreach (var child in vm.Children)
                SyncViewModelToModel(child);
        }
    }
}
