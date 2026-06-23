using ReqTrace.Importing;
using ReqTrace.Localization;
using ReqTrace.Models;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class RequirementEditForm : Form
{
    private readonly Requirement? _existing;
    private readonly List<Requirement> _allOthers;

    public Requirement Result { get; private set; } = new();

    public RequirementEditForm(Requirement? existing, IEnumerable<Requirement> allOthers)
    {
        _existing = existing;
        InitializeComponent();

        _allOthers = allOthers.ToList();
        var others = _allOthers;
        cboCategory.Items.AddRange(others.Select(r => r.Category).Where(c => !string.IsNullOrWhiteSpace(c)).Distinct().ToArray());
        cboParent.DisplayMember = "Code";

        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyLocalization();

        var emphasisFont = new Font(Font, FontStyle.Bold);
        lblCategory.Font = emphasisFont;
        lblDescription.Font = emphasisFont;

        PopulateEnumCombo(cboPriority, existing?.Priority ?? Priority.Medium);
        PopulateEnumCombo(cboStatus, existing?.Status ?? RequirementStatus.Draft);
        cboParent.Items.Add(Loc.T("Common_None"));
        foreach (var r in others)
            cboParent.Items.Add(r);
        cboParent.SelectedIndex = 0;

        if (existing is not null)
        {
            txtCode.Text = existing.Code;
            txtTitle.Text = existing.Title;
            txtDescription.Text = existing.Description;
            cboCategory.Text = existing.Category;
            txtSource.Text = existing.Source;
            if (existing.ParentId is { } parentId)
            {
                var match = others.FirstOrDefault(r => r.Id == parentId);
                if (match is not null)
                    cboParent.SelectedItem = match;
            }
        }
        else
        {
            txtCode.Text = RequirementCodeAllocator.PreviewNextCode(others.Select(r => r.Code));
        }
    }

    private void ApplyLocalization()
    {
        Text = _existing is null ? Loc.T("Dlg_AddRequirement") : Loc.T("Dlg_EditRequirement");
        lblCode.Text = Loc.T("ReqEdit_Code");
        lblTitle.Text = Loc.T("ReqEdit_Title");
        lblDescription.Text = Loc.T("ReqEdit_Description");
        lblCategory.Text = Loc.T("ReqEdit_Category");
        lblPriority.Text = Loc.T("ReqEdit_Priority");
        lblStatus.Text = Loc.T("ReqEdit_Status");
        lblSource.Text = Loc.T("ReqEdit_Source");
        lblParent.Text = Loc.T("ReqEdit_Parent");
        btnOk.Text = Loc.T("Common_OK");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private static void PopulateEnumCombo<T>(ComboBox combo, T selected) where T : struct, Enum
    {
        combo.Items.Clear();
        foreach (T value in Enum.GetValues<T>())
            combo.Items.Add(Loc.Enum(value));
        combo.SelectedIndex = Math.Max(0, Array.IndexOf(Enum.GetValues<T>(), selected));
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(txtTitle.Text))
        {
            MessageBox.Show(this, Loc.T("Msg_TitleRequired"), Loc.T("Common_Validation"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
            DialogResult = DialogResult.None;
            return;
        }

        Result = _existing ?? new Requirement();
        Result.Code = string.IsNullOrWhiteSpace(txtCode.Text) ? Result.Code : txtCode.Text.Trim();
        if (string.IsNullOrWhiteSpace(Result.Code))
        {
            var (usedCodes, nextSequence) = RequirementCodeAllocator.CreateState(_allOthers.Select(r => r.Code));
            Result.Code = RequirementCodeAllocator.AllocateNext(usedCodes, ref nextSequence);
        }
        Result.Title = txtTitle.Text.Trim();
        Result.Description = txtDescription.Text.Trim();
        Result.Category = cboCategory.Text.Trim();
        Result.Priority = (Priority)cboPriority.SelectedIndex;
        Result.Status = (RequirementStatus)cboStatus.SelectedIndex;
        Result.Source = txtSource.Text.Trim();
        Result.ParentId = cboParent.SelectedItem is Requirement parent ? parent.Id : null;
        DialogResult = DialogResult.OK;
    }
}
