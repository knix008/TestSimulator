namespace MyGitWinV10.App.Services;

public static class GitRemoteExceptionHelper
{
    public static Exception WrapForClone(Exception ex, string? remoteUrl = null)
    {
        string? friendly = TryGetCloneFriendlyMessage(ex, remoteUrl);
        return friendly is not null
            ? new InvalidOperationException(friendly, ex)
            : Wrap(ex, remoteUrl);
    }

    public static Exception Wrap(Exception ex, string? remoteUrl = null)
    {
        string host = ResolveHost(remoteUrl, ex);
        string? friendly = TryGetFriendlyMessage(ex, host);
        return friendly is not null
            ? new InvalidOperationException(friendly, ex)
            : ex;
    }

    public static bool TryGetFriendlyMessage(Exception ex, out string message)
    {
        message = TryGetFriendlyMessage(ex, ResolveHost(null, ex)) ?? string.Empty;
        return message.Length > 0;
    }

    private static string? TryGetFriendlyMessage(Exception ex, string host)
    {
        foreach (Exception current in EnumerateExceptions(ex))
        {
            string text = current.Message;
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (ContainsAny(text,
                    "failed to resolve address",
                    "could not resolve host",
                    "unknown host",
                    "nodename nor servname",
                    "getaddrinfo",
                    "name or service not known"))
            {
                return Localization.Tf("GitOp.Network.DnsFailed", host);
            }

            if (ContainsAny(text,
                    "connection refused",
                    "connection reset",
                    "could not connect",
                    "failed to connect",
                    "network is unreachable",
                    "no route to host"))
            {
                return Localization.Tf("GitOp.Network.ConnectionFailed", host);
            }

            if (ContainsAny(text,
                    "timed out",
                    "timeout",
                    "operation timed out"))
            {
                return Localization.Tf("GitOp.Network.Timeout", host);
            }

            if (ContainsAny(text,
                    "ssl",
                    "tls",
                    "certificate",
                    "secure connection"))
            {
                return Localization.Tf("GitOp.Network.SslFailed", host);
            }
        }

        if (IsRemoteOperationException(ex))
        {
            return Localization.Tf("GitOp.Network.Generic", host);
        }

        return null;
    }

    private static string? TryGetCloneFriendlyMessage(Exception ex, string? remoteUrl)
    {
        foreach (Exception current in EnumerateExceptions(ex))
        {
            string text = current.Message;
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (ContainsAny(text, "unsupported URL protocol"))
            {
                return Localization.T("Clone.Error.UnsupportedUrl");
            }

            if (ContainsAny(text,
                    "authentication failed",
                    "invalid username or password",
                    "access denied",
                    "401",
                    "403 forbidden",
                    "repository not found"))
            {
                return Localization.T("Clone.Error.Authentication");
            }

            if (ContainsAny(text,
                    "exists and is not an empty directory",
                    "already exists"))
            {
                return Localization.T("Clone.Error.DestinationExists");
            }

            if (ContainsAny(text,
                    "could not read refs",
                    "failed to connect",
                    "permission denied (publickey)"))
            {
                return Localization.T("Clone.Error.SshOrAuth");
            }
        }

        return null;
    }

    private static bool IsRemoteOperationException(Exception ex)
    {
        string typeName = ex.GetType().FullName ?? string.Empty;
        return typeName.StartsWith("LibGit2Sharp.", StringComparison.Ordinal)
            && !ContainsAny(ex.Message, "non-fastforward", "up-to-date", "up to date");
    }

    private static string ResolveHost(string? remoteUrl, Exception ex)
    {
        return ExtractHost(remoteUrl)
            ?? ExtractHostFromMessage(ex)
            ?? "origin";
    }

    private static string? ExtractHost(string? remoteUrl)
    {
        if (string.IsNullOrWhiteSpace(remoteUrl))
        {
            return null;
        }

        if (Uri.TryCreate(remoteUrl, UriKind.Absolute, out Uri? uri))
        {
            return string.IsNullOrWhiteSpace(uri.Host) ? null : uri.Host;
        }

        return null;
    }

    private static string? ExtractHostFromMessage(Exception ex)
    {
        foreach (Exception current in EnumerateExceptions(ex))
        {
            string? host = ExtractHostFromMessageText(current.Message);
            if (host is not null)
            {
                return host;
            }
        }

        return null;
    }

    private static string? ExtractHostFromMessageText(string message)
    {
        const string resolvePrefix = "failed to resolve address for ";
        int resolveIndex = message.IndexOf(resolvePrefix, StringComparison.OrdinalIgnoreCase);
        if (resolveIndex >= 0)
        {
            return ExtractHostToken(message[(resolveIndex + resolvePrefix.Length)..]);
        }

        const string hostPrefix = "Could not resolve host: ";
        int hostIndex = message.IndexOf(hostPrefix, StringComparison.OrdinalIgnoreCase);
        if (hostIndex >= 0)
        {
            return ExtractHostToken(message[(hostIndex + hostPrefix.Length)..]);
        }

        return null;
    }

    private static string? ExtractHostToken(string remainder)
    {
        string token = remainder.Split(':', '\r', '\n', ' ')[0].Trim();
        return string.IsNullOrWhiteSpace(token) ? null : token;
    }

    private static IEnumerable<Exception> EnumerateExceptions(Exception ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            yield return current;
        }
    }

    private static bool ContainsAny(string text, params string[] needles)
    {
        foreach (string needle in needles)
        {
            if (text.Contains(needle, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
