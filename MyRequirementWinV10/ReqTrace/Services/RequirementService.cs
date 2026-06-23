using ReqTrace.Models;

namespace ReqTrace.Services;

public class RequirementService
{
    private int _changeNotificationSuspendCount;

    public ProjectData Project { get; private set; }
    public bool IsDirty { get; private set; }
    public event EventHandler? Changed;

    public RequirementService(ProjectData project)
    {
        Project = project;
    }

    public void ReplaceProject(ProjectData project)
    {
        Project = project;
        IsDirty = false;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void RestoreProject(ProjectData project)
    {
        Project = project;
        IsDirty = true;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void MarkSaved()
    {
        IsDirty = false;
    }

    public IEnumerable<Requirement> AllRequirements => Project.Requirements;

    public Requirement? FindByCode(string code) =>
        Project.Requirements.FirstOrDefault(r => string.Equals(r.Code, code, StringComparison.OrdinalIgnoreCase));

    public IDisposable SuspendChangeNotifications()
    {
        _changeNotificationSuspendCount++;
        return new ChangeNotificationScope(this);
    }

    public Requirement Add(Requirement requirement, bool notify = true)
    {
        Project.Requirements.Add(requirement);
        if (notify)
            RaiseChanged();
        return requirement;
    }

    public void ImportMany(IEnumerable<Requirement> requirements)
    {
        var added = false;
        foreach (var requirement in requirements)
        {
            Project.Requirements.Add(requirement);
            added = true;
        }

        if (added)
            RaiseChanged();
    }

    public void Update(Requirement requirement)
    {
        requirement.ModifiedUtc = DateTime.UtcNow;
        RaiseChanged();
    }

    public void Delete(Requirement requirement)
    {
        Project.Requirements.Remove(requirement);
        RenumberStandardCodes();
        RaiseChanged();
    }

    public void DeleteMany(IEnumerable<Requirement> requirements)
    {
        var removed = false;
        foreach (var requirement in requirements)
        {
            if (Project.Requirements.Remove(requirement))
                removed = true;
        }

        if (removed)
        {
            RenumberStandardCodes();
            RaiseChanged();
        }
    }

    private void RenumberStandardCodes()
    {
        ProjectCodeRenumberer.RenumberStandardRequirementCodes(Project.Requirements);
        ProjectCodeRenumberer.RenumberStandardTestCaseCodes(Project.Requirements);
    }

    private void RaiseChanged()
    {
        IsDirty = true;
        if (_changeNotificationSuspendCount > 0)
            return;

        Changed?.Invoke(this, EventArgs.Empty);
    }

    private sealed class ChangeNotificationScope(RequirementService service) : IDisposable
    {
        private bool _disposed;

        public void Dispose()
        {
            if (_disposed)
                return;

            _disposed = true;
            service._changeNotificationSuspendCount = Math.Max(0, service._changeNotificationSuspendCount - 1);
        }
    }
}
