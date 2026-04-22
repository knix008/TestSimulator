using System.Globalization;
using System.Net;
using System.Numerics;
using System.Text;
using System.Text.Json;
using Nethereum.Hex.HexTypes;
using Nethereum.RPC.Eth.DTOs;
using Nethereum.Signer;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace WalletGeneratorGui;

/// <summary>
/// web3.js <c>HttpProvider</c> 등이 보내는 JSON-RPC 2.0 요청을 받아,
/// 잠금된 지갑 개인키로 서명 후 설정된 RPC로 트랜잭션을 전송합니다.
/// </summary>
public sealed class LocalJsonRpcServer : IDisposable
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly Form _owner;
    private readonly Func<WalletRpcSnapshot> _getSnapshot;
    private HttpListener? _listener;
    private CancellationTokenSource? _cts;
    private Task? _acceptLoop;

    public LocalJsonRpcServer(Form owner, Func<WalletRpcSnapshot> getSnapshot)
    {
        _owner = owner;
        _getSnapshot = getSnapshot;
    }

    public int Port { get; private set; }

    public void Start(int port)
    {
        if (_listener is not null)
        {
            return;
        }

        Port = port;
        var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();
        _listener = listener;
        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        _acceptLoop = Task.Run(() => AcceptLoopAsync(listener, token), token);
    }

    public void Dispose()
    {
        try
        {
            _cts?.Cancel();
        }
        catch
        {
            // ignored
        }

        try
        {
            _listener?.Stop();
        }
        catch
        {
            // ignored
        }

        _listener?.Close();
        _listener = null;

        try
        {
            _acceptLoop?.Wait(TimeSpan.FromSeconds(3));
        }
        catch
        {
            // ignored
        }

        _cts?.Dispose();
        _cts = null;
        _acceptLoop = null;
    }

    private async Task AcceptLoopAsync(HttpListener listener, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            HttpListenerContext? ctx = null;
            try
            {
                ctx = await listener.GetContextAsync().WaitAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (HttpListenerException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            if (ctx is null)
            {
                continue;
            }

            _ = Task.Run(() => HandleContextAsync(ctx), cancellationToken);
        }
    }

    private async Task HandleContextAsync(HttpListenerContext ctx)
    {
        void AddCors()
        {
            ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
            ctx.Response.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
            ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
        }

        AddCors();

        if (ctx.Request.HttpMethod.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.StatusCode = 204;
            ctx.Response.Close();
            return;
        }

        if (ctx.Request.HttpMethod.Equals("GET", StringComparison.OrdinalIgnoreCase))
        {
            const string info = """{"name":"WalletGeneratorGui","jsonrpc":"2.0","hint":"POST JSON-RPC 2.0 (web3.js HttpProvider 형식)"}""";
            var buf = Encoding.UTF8.GetBytes(info);
            ctx.Response.ContentType = "application/json; charset=utf-8";
            ctx.Response.StatusCode = 200;
            await ctx.Response.OutputStream.WriteAsync(buf).ConfigureAwait(false);
            ctx.Response.Close();
            return;
        }

        if (!ctx.Request.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.StatusCode = 405;
            ctx.Response.Close();
            return;
        }

        string body;
        try
        {
            using var reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
            body = await reader.ReadToEndAsync().ConfigureAwait(false);
        }
        catch
        {
            ctx.Response.StatusCode = 400;
            ctx.Response.Close();
            return;
        }

        byte[] responseBytes;
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array)
            {
                var responses = new List<object>();
                foreach (var el in root.EnumerateArray())
                {
                    responses.Add(await ProcessSingleRequestAsync(el).ConfigureAwait(false));
                }

                responseBytes = JsonSerializer.SerializeToUtf8Bytes(responses, JsonOpts);
            }
            else
            {
                var one = await ProcessSingleRequestAsync(root).ConfigureAwait(false);
                responseBytes = JsonSerializer.SerializeToUtf8Bytes(one, JsonOpts);
            }
        }
        catch (JsonException)
        {
            var err = new Dictionary<string, object?>
            {
                ["jsonrpc"] = "2.0",
                ["id"] = null,
                ["error"] = new Dictionary<string, object?> { ["code"] = -32700, ["message"] = "Parse error" }
            };
            responseBytes = JsonSerializer.SerializeToUtf8Bytes(err, JsonOpts);
        }

        ctx.Response.ContentType = "application/json; charset=utf-8";
        ctx.Response.StatusCode = 200;
        await ctx.Response.OutputStream.WriteAsync(responseBytes).ConfigureAwait(false);
        ctx.Response.Close();
    }

    private WalletRpcSnapshot Snapshot() =>
        _owner.InvokeRequired ? (WalletRpcSnapshot)_owner.Invoke(_getSnapshot)! : _getSnapshot();

    private async Task<object> ProcessSingleRequestAsync(JsonElement req)
    {
        if (req.ValueKind != JsonValueKind.Object)
        {
            return ErrorResponse(null, -32600, "Invalid Request");
        }

        if (!req.TryGetProperty("jsonrpc", out var jv) || jv.GetString() != "2.0")
        {
            JsonElement? badId = req.TryGetProperty("id", out var bid) ? bid : null;
            return ErrorResponse(badId, -32600, "Invalid Request");
        }

        JsonElement? id = req.TryGetProperty("id", out var idEl) ? idEl : null;

        if (!req.TryGetProperty("method", out var methodEl) || methodEl.ValueKind != JsonValueKind.String)
        {
            return ErrorResponse(id, -32600, "Invalid Request");
        }

        var method = methodEl.GetString()!;
        JsonElement? @params = req.TryGetProperty("params", out var p) ? p : null;

        try
        {
            var result = await DispatchAsync(method, @params).ConfigureAwait(false);
            return SuccessResponse(id, result);
        }
        catch (RpcUserException ex)
        {
            return ErrorResponse(id, ex.Code, ex.Message);
        }
        catch (Exception ex)
        {
            return ErrorResponse(id, -32000, ex.Message);
        }
    }

    private async Task<object?> DispatchAsync(string method, JsonElement? @params)
    {
        var snap = Snapshot();

        return method switch
        {
            "eth_accounts" or "eth_requestAccounts" => await EthAccountsAsync(snap).ConfigureAwait(false),
            "eth_chainId" => await EthChainIdAsync(snap).ConfigureAwait(false),
            "net_version" => await NetVersionAsync(snap).ConfigureAwait(false),
            "eth_sendTransaction" => await EthSendTransactionAsync(snap, @params).ConfigureAwait(false),
            _ => throw new RpcUserException(-32601, $"Method not found: {method}")
        };
    }

    private static Task<object> EthAccountsAsync(WalletRpcSnapshot snap)
    {
        if (string.IsNullOrWhiteSpace(snap.PrivateKey) || string.IsNullOrWhiteSpace(snap.Address))
        {
            return Task.FromResult<object>(Array.Empty<string>());
        }

        try
        {
            var rawHex = snap.PrivateKey.Trim();
            if (rawHex.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            {
                rawHex = rawHex[2..];
            }

            if (rawHex.Length != 64 || !IsHex64(rawHex))
            {
                return Task.FromResult<object>(Array.Empty<string>());
            }

            var keyAddr = new EthECKey(rawHex).GetPublicAddress();
            if (!string.Equals(keyAddr, snap.Address, StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult<object>(Array.Empty<string>());
            }
        }
        catch
        {
            return Task.FromResult<object>(Array.Empty<string>());
        }

        return Task.FromResult<object>(new[] { snap.Address });
    }

    private static async Task<string> EthChainIdAsync(WalletRpcSnapshot snap)
    {
        if (string.IsNullOrWhiteSpace(snap.RpcUrl))
        {
            throw new RpcUserException(-32602, "RPC URL이 비어 있습니다.");
        }

        var web3 = new Web3(snap.RpcUrl);
        var chainId = await web3.Eth.ChainId.SendRequestAsync().ConfigureAwait(false);
        return ToHexQuantity(chainId.Value);
    }

    private static async Task<string> NetVersionAsync(WalletRpcSnapshot snap)
    {
        if (string.IsNullOrWhiteSpace(snap.RpcUrl))
        {
            throw new RpcUserException(-32602, "RPC URL이 비어 있습니다.");
        }

        var web3 = new Web3(snap.RpcUrl);
        var chainId = await web3.Eth.ChainId.SendRequestAsync().ConfigureAwait(false);
        return chainId.Value.ToString(CultureInfo.InvariantCulture);
    }

    private static async Task<string> EthSendTransactionAsync(WalletRpcSnapshot snap, JsonElement? @params)
    {
        if (string.IsNullOrWhiteSpace(snap.RpcUrl))
        {
            throw new RpcUserException(-32602, "RPC URL이 비어 있습니다.");
        }

        if (string.IsNullOrWhiteSpace(snap.PrivateKey) || string.IsNullOrWhiteSpace(snap.Address))
        {
            throw new RpcUserException(-32000, "이 세션에서 개인키가 로드된 지갑이 없습니다. 지갑을 생성하거나 불러오세요.");
        }

        if (@params is null || @params.Value.ValueKind != JsonValueKind.Array || @params.Value.GetArrayLength() == 0)
        {
            throw new RpcUserException(-32602, "eth_sendTransaction params[0]에 트랜잭션 객체가 필요합니다.");
        }

        var txEl = @params.Value[0];
        if (txEl.ValueKind != JsonValueKind.Object)
        {
            throw new RpcUserException(-32602, "트랜잭션은 객체여야 합니다.");
        }

        var fromRpc = GetStringProperty(txEl, "from");
        if (string.IsNullOrWhiteSpace(fromRpc))
        {
            throw new RpcUserException(-32602, "from 필드가 필요합니다.");
        }

        if (!string.Equals(NormalizeAddress(fromRpc), NormalizeAddress(snap.Address), StringComparison.OrdinalIgnoreCase))
        {
            throw new RpcUserException(-32000, "from 주소가 현재 잠금된 지갑 주소와 일치하지 않습니다.");
        }

        var web3Read = new Web3(snap.RpcUrl);
        var chainId = await web3Read.Eth.ChainId.SendRequestAsync().ConfigureAwait(false);

        var pk = Normalize0xPrivateKey(snap.PrivateKey);
        var account = new Account(pk, chainId.Value);
        if (!string.Equals(account.Address, snap.Address, StringComparison.OrdinalIgnoreCase))
        {
            throw new RpcUserException(-32000, "개인키와 주소가 일치하지 않습니다.");
        }

        var web3 = new Web3(account, snap.RpcUrl);
        var input = BuildTransactionInput(txEl, snap.Address);

        var hash = await web3.TransactionManager.SendTransactionAsync(input).ConfigureAwait(false);
        return hash;
    }

    private static TransactionInput BuildTransactionInput(JsonElement tx, string fromAddress)
    {
        var input = new TransactionInput
        {
            From = fromAddress
        };

        if (TryGetString(tx, "to", out var to) && !string.IsNullOrWhiteSpace(to))
        {
            input.To = NormalizeAddress(to);
        }

        if (TryGetElement(tx, "value", out var valueEl))
        {
            input.Value = ParseHexBigInteger(valueEl);
        }

        if (TryGetElement(tx, "data", out var dataEl) && dataEl.ValueKind == JsonValueKind.String)
        {
            var d = dataEl.GetString();
            input.Data = string.IsNullOrEmpty(d) ? "0x" : d;
        }

        if (TryGetElement(tx, "gas", out var gasEl))
        {
            input.Gas = ParseHexBigInteger(gasEl);
        }

        if (TryGetElement(tx, "nonce", out var nonceEl))
        {
            input.Nonce = ParseHexBigInteger(nonceEl);
        }

        if (TryGetElement(tx, "maxFeePerGas", out var maxFeeEl))
        {
            input.MaxFeePerGas = ParseHexBigInteger(maxFeeEl);
        }

        if (TryGetElement(tx, "maxPriorityFeePerGas", out var tipEl))
        {
            input.MaxPriorityFeePerGas = ParseHexBigInteger(tipEl);
        }

        if (TryGetElement(tx, "gasPrice", out var gpEl))
        {
            input.GasPrice = ParseHexBigInteger(gpEl);
        }

        return input;
    }

    private static string NormalizeAddress(string address)
    {
        var a = address.Trim();
        if (!a.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            a = "0x" + a;
        }

        return a;
    }

    private static bool IsHex64(string s)
    {
        foreach (var c in s)
        {
            if (!Uri.IsHexDigit(c))
            {
                return false;
            }
        }

        return true;
    }

    private static string Normalize0xPrivateKey(string privateKey)
    {
        var s = privateKey.Trim();
        if (!s.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            s = "0x" + s;
        }

        return s;
    }

    private static string? GetStringProperty(JsonElement tx, string name) =>
        TryGetString(tx, name, out var v) ? v : null;

    private static bool TryGetString(JsonElement obj, string name, out string value)
    {
        value = "";
        if (!obj.TryGetProperty(name, out var p))
        {
            return false;
        }

        if (p.ValueKind == JsonValueKind.String)
        {
            value = p.GetString() ?? "";
            return true;
        }

        if (p.ValueKind == JsonValueKind.Number)
        {
            value = p.GetRawText();
            return true;
        }

        return false;
    }

    private static bool TryGetElement(JsonElement obj, string name, out JsonElement el)
    {
        if (obj.TryGetProperty(name, out el) && el.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
        {
            return true;
        }

        el = default;
        return false;
    }

    private static HexBigInteger ParseHexBigInteger(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.String:
            {
                var s = el.GetString();
                if (string.IsNullOrWhiteSpace(s))
                {
                    throw new RpcUserException(-32602, "빈 hex 값입니다.");
                }

                return new HexBigInteger(s);
            }
            case JsonValueKind.Number:
            {
                if (!el.TryGetInt64(out var n))
                {
                    throw new RpcUserException(-32602, "숫자 필드가 너무 큽니다. hex 문자열을 사용하세요.");
                }

                return new HexBigInteger(new BigInteger(n));
            }
            default:
                throw new RpcUserException(-32602, "hex 문자열 또는 숫자가 필요합니다.");
        }
    }

    private static string ToHexQuantity(BigInteger value)
    {
        if (value.Sign < 0)
        {
            throw new RpcUserException(-32000, "chainId가 음수입니다.");
        }

        var hex = value.ToString("x", CultureInfo.InvariantCulture);
        return "0x" + hex;
    }

    private static object SuccessResponse(JsonElement? id, object? result)
    {
        return new Dictionary<string, object?>
        {
            ["jsonrpc"] = "2.0",
            ["id"] = IdToObject(id),
            ["result"] = result
        };
    }

    private static object ErrorResponse(JsonElement? id, int code, string message)
    {
        return new Dictionary<string, object?>
        {
            ["jsonrpc"] = "2.0",
            ["id"] = IdToObject(id),
            ["error"] = new Dictionary<string, object?> { ["code"] = code, ["message"] = message }
        };
    }

    private static object? IdToObject(JsonElement? id)
    {
        if (id is null)
        {
            return null;
        }

        return id.Value.ValueKind switch
        {
            JsonValueKind.Number => id.Value.TryGetInt64(out var l) ? l : id.Value.GetDouble(),
            JsonValueKind.String => id.Value.GetString(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => id.Value.GetRawText()
        };
    }

    private sealed class RpcUserException(int code, string message) : Exception(message)
    {
        public int Code { get; } = code;
    }
}
