# MyCodeChecker in Visual Studio 2022

Visual Studio has no general "add any language server" setting. You connect the MyCodeChecker language
server (`core/lsp/server.js`, stdio) with a small extension of your own, built with the
**VisualStudio.Extensibility** SDK (VS 2022 17.9 or newer) and its `LanguageServerProvider`. Everything
else (diagnostics, hover, quick fixes, connected mode) comes from the server.

## 1. Create the extension

In Visual Studio: *New Project → VisualStudio.Extensibility Extension* (template from the
*Visual Studio extension development* workload). Add the NuGet package `Nerdbank.Streams` for `DuplexPipe`.

## 2. Add the provider

```csharp
using System.Diagnostics;
using System.IO.Pipelines;
using Microsoft.VisualStudio.Extensibility;
using Microsoft.VisualStudio.Extensibility.Editor;
using Microsoft.VisualStudio.Extensibility.LanguageServer;
using Microsoft.VisualStudio.RpcContracts.LanguageServerProvider;
using Nerdbank.Streams;

[VisualStudioContribution]
internal class MyCodeCheckerServerProvider : LanguageServerProvider
{
    public override LanguageServerProviderConfiguration LanguageServerProviderConfiguration => new(
        "MyCodeChecker",
        new[]
        {
            DocumentFilter.FromGlobPattern("**/*.{c,h,cpp,hpp,cc,cs,java,js,jsx,ts,tsx,py,go,php,rb,sql}", relativePath: false),
        });

    public override Task<IDuplexPipe?> CreateServerConnectionAsync(CancellationToken cancellationToken)
    {
        // Path of a MyCodeChecker checkout, or of server/core from the VS Code .vsix.
        var server = Environment.GetEnvironmentVariable("MCC_LSP_SERVER")
                     ?? @"C:\path\to\MyCodeChecker\core\lsp\server.js";
        var info = new ProcessStartInfo("node", $"\"{server}\" --stdio")
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        var process = Process.Start(info);
        if (process is null) return Task.FromResult<IDuplexPipe?>(null);
        return Task.FromResult<IDuplexPipe?>(new DuplexPipe(
            PipeReader.Create(process.StandardOutput.BaseStream),
            PipeWriter.Create(process.StandardInput.BaseStream)));
    }
}
```

Build, then double-click the produced `.vsix` to install it (or press F5 to try it in the experimental
instance).

## 3. Settings

The provider above does not send initialization options, so put the settings in the solution folder:

`<solution>/.mycodechecker/lsp.json`

```json
{
  "language": "ko",
  "inactiveRules": ["common:trailing-space"],
  "exclusions": ["**/obj/**", "**/bin/**"],
  "analyzeWorkspaceOnStart": true,
  "connected": {
    "enabled": true,
    "serverUrl": "http://127.0.0.1:5211",
    "token": "<token>",
    "projectKey": "my-project"
  }
}
```

The server reads `.mycodechecker/lsp.json` in the first workspace folder at startup, or the file named by
the `MCC_LSP_SETTINGS` environment variable (set it in the `ProcessStartInfo` above to share one file
across solutions). If the server sees no language setting, it follows the client's locale (`ko*` → Korean).

## Older Visual Studio SDK (Microsoft.VisualStudio.LanguageServer.Client)

With the classic VSSDK, implement `ILanguageClient` (exported with
`[ContentType("code")] [Export(typeof(ILanguageClient))]`), start the same process in
`ActivateAsync`, and return `new Connection(process.StandardOutput.BaseStream, process.StandardInput.BaseStream)`.
`InitializationOptions` there can carry the same JSON object as `lsp.json`.

## What works

Diagnostics with the rule key and related locations (data-flow steps), hover with the rule description,
quick fixes (rule fixes, *Suppress with NOSONAR*, *Deactivate rule* for the session) and connected mode.
The custom requests (`mycodechecker/analyzeWorkspace`, `mycodechecker/securityFindings`,
`mycodechecker/ruleDescription`) need commands of your own in the extension; they are documented at the top
of `core/lsp/index.js`.
