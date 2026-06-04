using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAnalyzer.Services.GlobalVariables;

public sealed class CSharpGlobalVariableExtractor
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
                syntaxTrees.Add(CSharpSyntaxTree.ParseText(text, path: file, cancellationToken: cancellationToken));
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

        var compilation = CSharpCompilation.Create(
            $"GlobalVarCSharp_{Guid.NewGuid():N}",
            syntaxTrees,
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

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

            if (fieldDecl.Parent is not BaseTypeDeclarationSyntax)
            {
                continue;
            }

            foreach (var variable in fieldDecl.Declaration.Variables)
            {
                var symbol = model.GetDeclaredSymbol(variable, cancellationToken) as IFieldSymbol;
                if (symbol is null || symbol.IsImplicitlyDeclared || !symbol.IsStatic)
                {
                    continue;
                }

                var line = fieldDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                var containing = symbol.ContainingType?.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat) ?? string.Empty;
                items.Add(new GlobalVariableItem
                {
                    Id = $"csharp:{filePath}:{line}:{symbol.Name}",
                    Name = symbol.Name,
                    LanguageId = "csharp",
                    FilePath = filePath,
                    LineNumber = line,
                    Scope = GlobalVariableScope.ClassStatic,
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
        Microsoft.CodeAnalysis.Accessibility.Public => "public",
        Microsoft.CodeAnalysis.Accessibility.Private => "private",
        Microsoft.CodeAnalysis.Accessibility.Protected => "protected",
        Microsoft.CodeAnalysis.Accessibility.Internal => "internal",
        Microsoft.CodeAnalysis.Accessibility.ProtectedOrInternal => "protected internal",
        Microsoft.CodeAnalysis.Accessibility.ProtectedAndInternal => "private protected",
        _ => "internal"
    };
}
