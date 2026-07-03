using System.Text.RegularExpressions;
using MyWorkspace.Core;
using MyWorkspace.Win;
using Xunit;

namespace MyWorkspace.MultiImage.Tests;

public sealed class MultiImageScenarioTests
{
    private const int TestPageId = 9_900_001;

    [Fact]
    public void UniqueNameHelper_allocates_sequential_names_for_same_base()
    {
        var existing = new List<string> { "photo.png", "photo.png (2)" };
        var third = UniqueNameHelper.MakeUnique("photo.png", existing);
        Assert.Equal("photo.png (3)", third);
    }

    [Fact]
    public void GetReferencedFileNames_collects_all_distinct_assets_on_one_page()
    {
        const int pageId = 42;
        var markdown = """
                       ![one](page-asset:42/a.png)
                       ![two](page-asset:42/b.png)
                       ![three](page-asset:42/c.png)
                       """;

        var names = PageMarkdownNormalizer.GetReferencedFileNames(markdown, pageId);

        Assert.Equal(3, names.Count);
        Assert.Contains("a.png", names);
        Assert.Contains("b.png", names);
        Assert.Contains("c.png", names);
    }

    [Fact]
    public void ExpandAssetReferences_assigns_unique_editor_uri_per_image()
    {
        const int pageId = 7;
        var markdown = """
                       ![a](page-asset:7/x.png)
                       ![b](page-asset:7/y.png)
                       ![c](page-asset:7/z.png)
                       """;

        var expanded = PageMarkdownNormalizer.ExpandAssetReferences(markdown, pageId);
        var uris = Regex.Matches(expanded, @"https://page-assets\.myworkspace/7/[^)\s""']+")
            .Select(m => m.Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        Assert.Equal(3, uris.Count);
    }

    [Fact]
    public void ExtractSizedImages_preserves_order_for_multiple_images()
    {
        var html = """
                   <p>intro</p>
                   <img src="https://page-assets.myworkspace/1/a.png" alt="a">
                   <img src="https://page-assets.myworkspace/1/b.png" width="120" data-editor-width="120" alt="b">
                   <img src="https://page-assets.myworkspace/1/c.png" alt="c">
                   """;

        var (_, preserved) = PageMarkdownNormalizer.ExtractSizedImages(html);

        Assert.Equal(3, preserved.Count);
        Assert.Contains("a.png", preserved[0], StringComparison.Ordinal);
        Assert.Contains("b.png", preserved[1], StringComparison.Ordinal);
        Assert.Contains("120", preserved[1], StringComparison.Ordinal);
        Assert.Contains("c.png", preserved[2], StringComparison.Ordinal);
    }

    [Fact]
    public void CloneEmbeddedPageAssetHtml_creates_separate_assets_for_each_reference()
    {
        var pageFolder = PageAssetStore.GetPageFolder(TestPageId);
        try
        {
            Directory.CreateDirectory(pageFolder);
            File.WriteAllBytes(Path.Combine(pageFolder, "sample.png"), [0x89, 0x50, 0x4E, 0x47]);

            var sourceUri = PageAssetStore.BuildEditorUri(TestPageId, "sample.png");
            var html = $"""
                        <span class="editor-image-wrap"><img src="{sourceUri}" alt="one"></span>
                        <span class="editor-image-wrap"><img src="{sourceUri}" alt="two"></span>
                        <span class="editor-image-wrap"><img src="{sourceUri}" alt="three"></span>
                        """;

            var cloned = PageAssetStore.CloneEmbeddedPageAssetHtml(html, TestPageId);
            var clonedUris = Regex.Matches(cloned, @"https://page-assets\.myworkspace/\d+/[^""'\s>]+")
                .Select(m => Uri.UnescapeDataString(m.Value))
                .ToList();

            Assert.Equal(3, clonedUris.Count);
            Assert.Equal(3, clonedUris.Distinct(StringComparer.OrdinalIgnoreCase).Count());
            Assert.DoesNotContain(sourceUri, clonedUris, StringComparer.OrdinalIgnoreCase);

            var createdFiles = Directory.GetFiles(pageFolder)
                .Select(Path.GetFileName)
                .Where(name => !string.Equals(name, "sample.png", StringComparison.OrdinalIgnoreCase))
                .ToList();
            Assert.Equal(3, createdFiles.Count);
            Assert.Equal(3, createdFiles.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        }
        finally
        {
            if (Directory.Exists(pageFolder))
                Directory.Delete(pageFolder, recursive: true);
        }
    }

    [Fact]
    public void ImportImageBytes_on_same_page_allocates_unique_file_names()
    {
        var pageFolder = PageAssetStore.GetPageFolder(TestPageId);
        try
        {
            Directory.CreateDirectory(pageFolder);
            var bytes = new byte[] { 1, 2, 3, 4 };

            var first = PageAssetStore.ImportImageBytes(TestPageId, bytes, ".png", "dup.png");
            var second = PageAssetStore.ImportImageBytes(TestPageId, bytes, ".png", "dup.png");
            var third = PageAssetStore.ImportImageBytes(TestPageId, bytes, ".png", "dup.png");

            Assert.Equal("dup.png", first);
            Assert.Equal("dup.png (2)", second);
            Assert.Equal("dup.png (3)", third);
            Assert.True(File.Exists(Path.Combine(pageFolder, first)));
            Assert.True(File.Exists(Path.Combine(pageFolder, second)));
            Assert.True(File.Exists(Path.Combine(pageFolder, third)));
        }
        finally
        {
            if (Directory.Exists(pageFolder))
                Directory.Delete(pageFolder, recursive: true);
        }
    }
}
