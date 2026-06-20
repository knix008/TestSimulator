using System.Data;
using System.Data.Common;
using ReqTrace.Models;

namespace ReqTrace.Persistence.Database;

public static class DatabaseProjectRepository
{
    public static async Task<ProjectData> LoadAsync(DbConnectionSettings settings)
    {
        await DatabaseSchemaInitializer.EnsureDatabaseExistsAsync(settings);
        using var connection = await DbConnectionFactory.OpenAsync(settings);
        await DatabaseSchemaInitializer.EnsureSchemaAsync(connection, settings.Provider);

        var data = new ProjectData();
        var testCasesByRequirement = new Dictionary<Guid, List<TestCase>>();
        var stepsByTestCase = new Dictionary<Guid, List<TestStep>>();
        var runsByTestCase = new Dictionary<Guid, List<TestRun>>();

        await using (var reader = await ExecuteReaderAsync(connection,
            "SELECT TestCaseId, StepOrder, Action, ExpectedOutcome FROM TestSteps"))
        {
            while (await reader.ReadAsync())
            {
                var testCaseId = Guid.Parse(reader.GetString(0));
                var step = new TestStep
                {
                    Order = reader.GetInt32(1),
                    Action = reader.GetString(2),
                    ExpectedOutcome = reader.GetString(3)
                };
                if (!stepsByTestCase.TryGetValue(testCaseId, out var list))
                    stepsByTestCase[testCaseId] = list = new List<TestStep>();
                list.Add(step);
            }
        }

        await using (var reader = await ExecuteReaderAsync(connection,
            "SELECT Id, TestCaseId, Status, ExecutedUtc, ExecutedBy, Notes, BuildOrVersion FROM TestRuns"))
        {
            while (await reader.ReadAsync())
            {
                var testCaseId = Guid.Parse(reader.GetString(1));
                var run = new TestRun
                {
                    Id = Guid.Parse(reader.GetString(0)),
                    Status = (TestRunStatus)reader.GetInt32(2),
                    ExecutedUtc = DateTime.SpecifyKind(reader.GetDateTime(3), DateTimeKind.Utc),
                    ExecutedBy = reader.GetString(4),
                    Notes = reader.GetString(5),
                    BuildOrVersion = reader.GetString(6)
                };
                if (!runsByTestCase.TryGetValue(testCaseId, out var list))
                    runsByTestCase[testCaseId] = list = new List<TestRun>();
                list.Add(run);
            }
        }

        await using (var reader = await ExecuteReaderAsync(connection,
            "SELECT Id, RequirementId, Code, Title, Preconditions, ExpectedResult FROM TestCases"))
        {
            while (await reader.ReadAsync())
            {
                var id = Guid.Parse(reader.GetString(0));
                var requirementId = Guid.Parse(reader.GetString(1));
                var testCase = new TestCase
                {
                    Id = id,
                    RequirementId = requirementId,
                    Code = reader.GetString(2),
                    Title = reader.GetString(3),
                    Preconditions = reader.GetString(4),
                    ExpectedResult = reader.GetString(5)
                };
                if (stepsByTestCase.TryGetValue(id, out var steps))
                    testCase.Steps = steps.OrderBy(s => s.Order).ToList();
                if (runsByTestCase.TryGetValue(id, out var runs))
                    testCase.Runs = runs;

                if (!testCasesByRequirement.TryGetValue(requirementId, out var list))
                    testCasesByRequirement[requirementId] = list = new List<TestCase>();
                list.Add(testCase);
            }
        }

        await using (var reader = await ExecuteReaderAsync(connection,
            "SELECT Id, Code, Title, Description, Category, Priority, Status, Source, ParentId, CreatedUtc, ModifiedUtc FROM Requirements"))
        {
            while (await reader.ReadAsync())
            {
                var id = Guid.Parse(reader.GetString(0));
                var requirement = new Requirement
                {
                    Id = id,
                    Code = reader.GetString(1),
                    Title = reader.GetString(2),
                    Description = reader.GetString(3),
                    Category = reader.GetString(4),
                    Priority = (Priority)reader.GetInt32(5),
                    Status = (RequirementStatus)reader.GetInt32(6),
                    Source = reader.GetString(7),
                    ParentId = reader.IsDBNull(8) ? null : Guid.Parse(reader.GetString(8)),
                    CreatedUtc = DateTime.SpecifyKind(reader.GetDateTime(9), DateTimeKind.Utc),
                    ModifiedUtc = DateTime.SpecifyKind(reader.GetDateTime(10), DateTimeKind.Utc)
                };
                if (testCasesByRequirement.TryGetValue(id, out var cases))
                    requirement.TestCases = cases;
                data.Requirements.Add(requirement);
            }
        }

        return data;
    }

    public static async Task SaveAsync(ProjectData data, DbConnectionSettings settings)
    {
        data.LastModifiedUtc = DateTime.UtcNow;

        await DatabaseSchemaInitializer.EnsureDatabaseExistsAsync(settings);
        using var connection = await DbConnectionFactory.OpenAsync(settings);
        await DatabaseSchemaInitializer.EnsureSchemaAsync(connection, settings.Provider);

        using var transaction = await connection.BeginTransactionAsync();

        await ExecuteNonQueryAsync(connection, transaction, "DELETE FROM TestSteps");
        await ExecuteNonQueryAsync(connection, transaction, "DELETE FROM TestRuns");
        await ExecuteNonQueryAsync(connection, transaction, "DELETE FROM TestCases");
        await ExecuteNonQueryAsync(connection, transaction, "DELETE FROM Requirements");

        foreach (var requirement in data.Requirements)
        {
            await InsertRequirementAsync(connection, transaction, requirement);

            foreach (var testCase in requirement.TestCases)
            {
                await InsertTestCaseAsync(connection, transaction, testCase);

                foreach (var step in testCase.Steps)
                    await InsertTestStepAsync(connection, transaction, testCase.Id, step);

                foreach (var run in testCase.Runs)
                    await InsertTestRunAsync(connection, transaction, testCase.Id, run);
            }
        }

        await transaction.CommitAsync();
    }

    private static async Task InsertRequirementAsync(DbConnection connection, DbTransaction transaction, Requirement requirement)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = @"INSERT INTO Requirements
            (Id, Code, Title, Description, Category, Priority, Status, Source, ParentId, CreatedUtc, ModifiedUtc)
            VALUES (@Id, @Code, @Title, @Description, @Category, @Priority, @Status, @Source, @ParentId, @CreatedUtc, @ModifiedUtc)";
        AddParameter(command, "@Id", requirement.Id.ToString());
        AddParameter(command, "@Code", requirement.Code);
        AddParameter(command, "@Title", requirement.Title);
        AddParameter(command, "@Description", requirement.Description);
        AddParameter(command, "@Category", requirement.Category);
        AddParameter(command, "@Priority", (int)requirement.Priority);
        AddParameter(command, "@Status", (int)requirement.Status);
        AddParameter(command, "@Source", requirement.Source);
        AddParameter(command, "@ParentId", requirement.ParentId?.ToString() ?? (object)DBNull.Value);
        AddParameter(command, "@CreatedUtc", requirement.CreatedUtc);
        AddParameter(command, "@ModifiedUtc", requirement.ModifiedUtc);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task InsertTestCaseAsync(DbConnection connection, DbTransaction transaction, TestCase testCase)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = @"INSERT INTO TestCases
            (Id, RequirementId, Code, Title, Preconditions, ExpectedResult)
            VALUES (@Id, @RequirementId, @Code, @Title, @Preconditions, @ExpectedResult)";
        AddParameter(command, "@Id", testCase.Id.ToString());
        AddParameter(command, "@RequirementId", testCase.RequirementId.ToString());
        AddParameter(command, "@Code", testCase.Code);
        AddParameter(command, "@Title", testCase.Title);
        AddParameter(command, "@Preconditions", testCase.Preconditions);
        AddParameter(command, "@ExpectedResult", testCase.ExpectedResult);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task InsertTestStepAsync(DbConnection connection, DbTransaction transaction, Guid testCaseId, TestStep step)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = @"INSERT INTO TestSteps
            (TestCaseId, StepOrder, Action, ExpectedOutcome)
            VALUES (@TestCaseId, @StepOrder, @Action, @ExpectedOutcome)";
        AddParameter(command, "@TestCaseId", testCaseId.ToString());
        AddParameter(command, "@StepOrder", step.Order);
        AddParameter(command, "@Action", step.Action);
        AddParameter(command, "@ExpectedOutcome", step.ExpectedOutcome);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task InsertTestRunAsync(DbConnection connection, DbTransaction transaction, Guid testCaseId, TestRun run)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = @"INSERT INTO TestRuns
            (Id, TestCaseId, Status, ExecutedUtc, ExecutedBy, Notes, BuildOrVersion)
            VALUES (@Id, @TestCaseId, @Status, @ExecutedUtc, @ExecutedBy, @Notes, @BuildOrVersion)";
        AddParameter(command, "@Id", run.Id.ToString());
        AddParameter(command, "@TestCaseId", testCaseId.ToString());
        AddParameter(command, "@Status", (int)run.Status);
        AddParameter(command, "@ExecutedUtc", run.ExecutedUtc);
        AddParameter(command, "@ExecutedBy", run.ExecutedBy);
        AddParameter(command, "@Notes", run.Notes);
        AddParameter(command, "@BuildOrVersion", run.BuildOrVersion);
        await command.ExecuteNonQueryAsync();
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static async Task<DbDataReader> ExecuteReaderAsync(DbConnection connection, string sql)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        return await command.ExecuteReaderAsync();
    }

    private static async Task ExecuteNonQueryAsync(DbConnection connection, DbTransaction transaction, string sql)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
