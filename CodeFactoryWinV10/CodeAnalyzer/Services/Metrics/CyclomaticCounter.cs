using TreeSitter;

namespace CodeAnalyzer.Services.Metrics;

internal static class CyclomaticCounter
{
    private static readonly HashSet<string> SharedDecisionNodeTypes = new(StringComparer.Ordinal)
    {
        "if_statement",
        "if",
        "for_statement",
        "for_in_statement",
        "foreach_statement",
        "while_statement",
        "do_statement",
        "do_while_statement",
        "switch_statement",
        "case_statement",
        "case",
        "catch_clause",
        "except_clause",
        "elif_clause",
        "conditional_expression",
        "ternary_expression",
        "when_statement",
        "match_arm",
        "guard_statement",
        "boolean_operator",
        "conjunction_expression",
        "disjunction_expression",
        "else_if_statement",
        "switch_case",
        "switch_default",
        "for_expression",
        "loop_expression"
    };

    public static int FromSyntaxTree(Node bodyNode, IReadOnlySet<string>? extraDecisionNodeTypes = null)
    {
        var complexity = 1;
        var stack = new Stack<Node>();
        stack.Push(bodyNode);

        while (stack.Count > 0)
        {
            var node = stack.Pop();

            if (IsDecisionNode(node, extraDecisionNodeTypes))
            {
                complexity++;
            }

            foreach (var child in node.Children)
            {
                stack.Push(child);
            }
        }

        return complexity;
    }

    private static bool IsDecisionNode(Node node, IReadOnlySet<string>? extra)
    {
        if (SharedDecisionNodeTypes.Contains(node.Type))
        {
            return true;
        }

        if (extra is not null && extra.Contains(node.Type))
        {
            return true;
        }

        if (node.Type is "binary_expression" or "binary_operator")
        {
            var text = node.Text;
            if (text.Contains("&&", StringComparison.Ordinal) || text.Contains("||", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
