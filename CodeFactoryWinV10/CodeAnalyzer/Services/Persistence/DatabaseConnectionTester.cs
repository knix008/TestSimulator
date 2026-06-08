using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Persistence;

public static class DatabaseConnectionTester
{
    public static async Task TestAsync(
        DatabaseConnectionSettings settings,
        CancellationToken cancellationToken = default)
    {
        var normalized = DatabaseConnectionSettings.Normalize(settings);
        normalized.ValidateForUse();

        await using var connection = DatabaseConnectionFactory.CreateConnection(normalized);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);

        await using var command = connection.CreateCommand();
        command.CommandText = normalized.Provider switch
        {
            AnalysisDatabaseProvider.PostgreSql => "SELECT 1",
            _ => "SELECT 1"
        };
        var result = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        if (result is null)
        {
            throw new InvalidOperationException("DB 연결 테스트에 실패했습니다.");
        }
    }
}
