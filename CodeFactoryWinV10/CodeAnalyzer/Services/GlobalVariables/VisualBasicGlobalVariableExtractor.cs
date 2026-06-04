using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.VisualBasic;
using Microsoft.CodeAnalysis.VisualBasic.Syntax;

namespace CodeAnalyzer.Services.GlobalVariables;

public sealed class VisualBasicGlobalVariableExtractor
{
    public async Task<IReadOnlyList<GlobalVariableItem>> ExtractAsync(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var items = new List<GlobalVariableItem>();
        if (sourceFiles.Count == 0)
        {
            return items;
        }

        var references = MetadataReferenceProvider.CreateReferences();
        foreach (var chunk in sourceFiles.Chunk(Math.Max(1, sourceFiles.Count)))
        {
            cancellationToken.ThrowIfCancellationRequested();
            await ExtractChunkAsync(chunk, references, items, cancellationToken).ConfigureAwait(false);
        }

        return items;
    }

    private static async Task ExtractChunkAsync(
        IReadOnlyList<string> chunk,
        IReadOnlyList<MetadataReference> references,
        List<GlobalVariableItem> items,
        CancellationToken cancellationToken)
    {
        var syntaxTrees = new List<SyntaxTree>();
        foreach (var file in chunk)
        {
            try
            {
                var text = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                syntaxTrees.Add(VisualBasicSyntaxTree.ParseText(text, path: file, cancellationToken: cancellationToken));
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip file
            }
        }

        if (syntaxTrees.Count == 0)
        {
            return;
        }

        var compilation = VisualBasicCompilation.Create(
            $"GlobalVarVB_{Guid.NewGuid():N}",
            syntaxTrees,
            references,
            new VisualBasicCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        foreach (var tree in syntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(cancellationToken).ConfigureAwait(false);
                ExtractFromRoot(root, model, tree.FilePath ?? string.Empty, items, cancellationToken);
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip tree
            }
        }
    }

    private static void ExtractFromRoot(
        SyntaxNode root,
        SemanticModel model,
        string filePath,
        List<GlobalVariableItem> items,
        CancellationToken cancellationToken)
    {
        foreach (var fieldDecl in root.DescendantNodes().OfType<FieldDeclarationSyntax>())
        {
            cancellationToken.ThrowIfCancellationRequested();

            foreach (var declarator in fieldDecl.Declarators)
            {
                var symbol = model.GetDeclaredSymbol(declarator, cancellationToken) as IFieldSymbol;
                if (symbol is null || symbol.IsImplicitlyDeclared)
                {
                    continue;
                }

                var inModule = symbol.ContainingType?.TypeKind == TypeKind.Module;
                if (!inModule && !symbol.IsStatic)
                {
                    continue;
                }

                var line = fieldDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                var containing = symbol.ContainingType?.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat) ?? string.Empty;
                items.Add(new GlobalVariableItem
                {
                    Id = $"vbnet:{filePath}:{line}:{symbol.Name}",
                    Name = symbol.Name,
                    LanguageId = "vbnet",
                    FilePath = filePath,
                    LineNumber = line,
                    Scope = inModule ? GlobalVariableScope.Module : GlobalVariableScope.ClassStatic,
                    TypeName = symbol.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                    ContainingScope = containing,
                    AccessModifier = FormatAccessibility(symbol.DeclaredAccessibility),
                    IsConst = symbol.IsConst,
                    IsReadOnly = symbol.IsReadOnly || symbol.IsConst,
                    Declaration = fieldDecl.ToString().Trim()
                });
            }
        }
    }

    private static string FormatAccessibility(Microsoft.CodeAnalysis.Accessibility accessibility) => accessibility switch
    {
        Microsoft.CodeAnalysis.Accessibility.Public => "Public",
        Microsoft.CodeAnalysis.Accessibility.Private => "Private",
        Microsoft.CodeAnalysis.Accessibility.Protected => "Protected",
        Microsoft.CodeAnalysis.Accessibility.Internal => "Friend",
        Microsoft.CodeAnalysis.Accessibility.ProtectedOrInternal => "Protected Friend",
        _ => "Friend"
    };
}
