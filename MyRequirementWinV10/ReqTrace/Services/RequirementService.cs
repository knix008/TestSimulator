using ReqTrace.Models;

namespace ReqTrace.Services;

public class RequirementService
{
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

    public void MarkSaved()
    {
        IsDirty = false;
    }

    public IEnumerable<Requirement> AllRequirements => Project.Requirements;

    public Requirement? FindByCode(string code) =>
        Project.Requirements.FirstOrDefault(r => string.Equals(r.Code, code, StringComparison.OrdinalIgnoreCase));

    public Requirement Add(Requirement requirement)
    {
        Project.Requirements.Add(requirement);
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
        RaiseChanged();
    }

    private void RaiseChanged()
    {
        IsDirty = true;
        Changed?.Invoke(this, EventArgs.Empty);
    }
}
