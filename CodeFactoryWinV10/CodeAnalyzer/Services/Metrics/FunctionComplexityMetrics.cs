using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using TreeSitter;
using CSharpSyntax = Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAnalyzer.Services.Metrics;

internal static class FunctionComplexityMetrics
{
    private static readonly Regex ReturnRegex = new(@"\breturn\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static (int Cognitive, int MaxNesting, int ReturnCount) FromCSharpMethod(SyntaxNode methodBody)
    {
        var cognitive = ComputeCSharpCognitive(methodBody);
        var maxNesting = ComputeCSharpMaxNesting(methodBody);
        var returnCount = methodBody.DescendantNodes().OfType<CSharpSyntax.ReturnStatementSyntax>().Count();
        return (cognitive, maxNesting, returnCount);
    }

    public static (int Cognitive, int MaxNesting, int ReturnCount) FromSyntaxTree(
        Node bodyNode,
        IReadOnlySet<string>? extraDecisionNodeTypes = null)
    {
        var cognitive = 0;
        var maxNesting = 0;
        var returnCount = 0;
        WalkTreeSitter(bodyNode, 0, extraDecisionNodeTypes, ref cognitive, ref maxNesting, ref returnCount);
        return (Math.Max(1, cognitive), maxNesting, returnCount);
    }

    public static (int Cognitive, int MaxNesting, int ReturnCount) FromSourceText(string body)
    {
        var cyclomatic = 1 + MetricsDecisionPatterns.KeywordDecisionRegex.Matches(body).Count;
        var cognitive = cyclomatic + CountBraceNestingPenalty(body);
        var maxNesting = ComputeBraceMaxDepth(body);
        var returnCount = ReturnRegex.Matches(body).Count;
        return (Math.Max(1, cognitive), maxNesting, returnCount);
    }

    public static int CountMagicNumbersFromText(string body)
    {
        var count = 0;
        foreach (Match match in Regex.Matches(body, @"(?<![\w.])(-?\d+\.?\d*)(?![\w.])"))
        {
            var value = match.Groups[1].Value;
            if (value is "0" or "1" or "-1")
            {
                continue;
            }

            count++;
        }

        return count;
    }

    public static int CountMagicNumbersFromCSharp(SyntaxNode methodBody)
    {
        var count = 0;

        foreach (var literal in methodBody.DescendantNodes().OfType<CSharpSyntax.LiteralExpressionSyntax>())
        {
            if (!literal.IsKind(Microsoft.CodeAnalysis.CSharp.SyntaxKind.NumericLiteralExpression))
            {
                continue;
            }

            var text = literal.Token.ValueText;
            if (text is "0" or "1" or "-1")
            {
                continue;
            }

            count++;
        }

        return count;
    }

    public static double ComputeMaintenanceIndex(int lineCount, int cyclomatic, int cognitive, int parameterCount)
    {
        if (lineCount <= 0)
        {
            return 100;
        }

        var loc = Math.Max(1, lineCount);
        var volume = loc * Math.Log2(Math.Max(2, loc));
        var mi = 171
            - 5.2 * Math.Log(Math.Max(1, volume))
            - 0.23 * cyclomatic
            - 0.21 * cognitive
            - 0.5 * parameterCount
            - 16.2 * Math.Log(loc);

        return Math.Clamp(mi, 0, 171);
    }

    private static void WalkTreeSitter(
        Node node,
        int nesting,
        IReadOnlySet<string>? extra,
        ref int cognitive,
        ref int maxNesting,
        ref int returnCount)
    {
        if (node.Type.Contains("return", StringComparison.Ordinal))
        {
            returnCount++;
        }

        if (CyclomaticCounterIsStructural(node, extra))
        {
            cognitive += 1 + nesting;
            nesting++;
            maxNesting = Math.Max(maxNesting, nesting);
        }
        else if (IsLogicalTreeSitter(node))
        {
            cognitive++;
        }

        foreach (var child in node.Children)
        {
            WalkTreeSitter(child, nesting, extra, ref cognitive, ref maxNesting, ref returnCount);
        }

        if (CyclomaticCounterIsStructural(node, extra))
        {
            nesting = Math.Max(0, nesting - 1);
        }
    }

    private static bool CyclomaticCounterIsStructural(Node node, IReadOnlySet<string>? extra)
    {
        return node.Type is "if_statement" or "if" or "for_statement" or "for_in_statement" or "foreach_statement"
            or "while_statement" or "do_statement" or "do_while_statement" or "switch_statement" or "case_statement"
            or "catch_clause" or "except_clause" or "elif_clause" or "when_statement" or "else_if_statement"
            or "for_expression" or "loop_expression"
            || (extra?.Contains(node.Type) ?? false);
    }

    private static bool IsLogicalTreeSitter(Node node)
    {
        if (node.Type is "boolean_operator" or "conjunction_expression" or "disjunction_expression")
        {
            return true;
        }

        if (node.Type is "binary_expression" or "binary_operator")
        {
            var text = node.Text;
            return text.Contains("&&", StringComparison.Ordinal) || text.Contains("||", StringComparison.Ordinal);
        }

        return false;
    }

    private static int ComputeCSharpCognitive(SyntaxNode methodBody)
    {
        var score = 0;
        var nesting = 0;

        foreach (var node in methodBody.DescendantNodes())
        {
            if (node is CSharpSyntax.IfStatementSyntax or CSharpSyntax.ForStatementSyntax
                or CSharpSyntax.ForEachStatementSyntax or CSharpSyntax.WhileStatementSyntax
                or CSharpSyntax.DoStatementSyntax or CSharpSyntax.CatchClauseSyntax
                or CSharpSyntax.SwitchStatementSyntax)
            {
                score += 1 + nesting;
                nesting++;
            }
            else if (node is CSharpSyntax.ElseClauseSyntax)
            {
                score += 1 + Math.Max(0, nesting - 1);
            }
            else if (node is CSharpSyntax.CaseSwitchLabelSyntax or CSharpSyntax.ConditionalExpressionSyntax)
            {
                score += 1 + nesting;
            }
            else if (node is CSharpSyntax.BinaryExpressionSyntax binary
                && (binary.IsKind(Microsoft.CodeAnalysis.CSharp.SyntaxKind.LogicalAndExpression)
                    || binary.IsKind(Microsoft.CodeAnalysis.CSharp.SyntaxKind.LogicalOrExpression)))
            {
                score++;
            }
            else if (node is CSharpSyntax.BlockSyntax && nesting > 0)
            {
                nesting = Math.Max(0, nesting - 1);
            }
        }

        return Math.Max(1, score);
    }

    private static int ComputeCSharpMaxNesting(SyntaxNode methodBody)
    {
        var max = 0;
        var current = 0;

        foreach (var node in methodBody.DescendantNodes())
        {
            if (IsCSharpNestingNode(node) && node is not CSharpSyntax.ElseClauseSyntax)
            {
                current++;
                max = Math.Max(max, current);
            }
        }

        return max;
    }

    private static bool IsCSharpNestingNode(SyntaxNode node) =>
        node is CSharpSyntax.IfStatementSyntax or CSharpSyntax.ForStatementSyntax or CSharpSyntax.ForEachStatementSyntax
            or CSharpSyntax.WhileStatementSyntax or CSharpSyntax.DoStatementSyntax or CSharpSyntax.SwitchStatementSyntax
            or CSharpSyntax.CatchClauseSyntax;

    private static int CountBraceNestingPenalty(string body)
    {
        var depth = 0;
        var max = 0;
        var penalty = 0;

        foreach (var ch in body)
        {
            if (ch == '{')
            {
                depth++;
                max = Math.Max(max, depth);
            }
            else if (ch == '}')
            {
                depth = Math.Max(0, depth - 1);
            }
        }

        penalty = Math.Max(0, max - 1);
        return penalty;
    }

    private static int ComputeBraceMaxDepth(string body)
    {
        var depth = 0;
        var max = 0;

        foreach (var ch in body)
        {
            if (ch == '{')
            {
                depth++;
                max = Math.Max(max, depth);
            }
            else if (ch == '}')
            {
                depth = Math.Max(0, depth - 1);
            }
        }

        return max;
    }
}
