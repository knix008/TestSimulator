using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    /// <summary>저장 데이터·샘플 문서의 가지 색을 일관되게 맞춥니다.</summary>
    public static class NodeColorNormalizer
    {
        public static void Normalize(NodeViewModel? root)
        {
            if (root == null)
                return;

            NormalizeRootBranches(root);
            SyncBranchColorIndexRecursive(root);
        }

        private static void NormalizeRootBranches(NodeViewModel root)
        {
            if (root.Children.Count == 0)
                return;

            var branches = root.Children;
            bool allInherit = branches.All(b => b.Model.ColorIndex < 0);
            // 예전 데이터·예시 JSON처럼 모든 1단계 가지가 0(하늘색)으로만 저장된 경우
            bool allStuckOnFirstColor = branches.Count > 1
                && branches.All(b => b.Model.ColorIndex == 0);

            if (!allInherit && !allStuckOnFirstColor)
                return;

            for (int i = 0; i < branches.Count; i++)
                branches[i].NodeColorIndex = i % NodeColorPalette.PaletteCount;
        }

        private static void SyncBranchColorIndexRecursive(NodeViewModel node)
        {
            node.BranchColorIndex = node.Level == 0
                ? NodeColorPalette.InheritColorIndex
                : node.Model.ColorIndex;

            foreach (var child in node.Children)
                SyncBranchColorIndexRecursive(child);
        }
    }
}
