using System;
using System.ComponentModel;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Dialogs;

public class RelationshipDialog : Form
{
	private readonly DbSchema _schema;

	private Label lblName = null;

	private TextBox txtName = null;

	private Label lblRelType = null;

	private ComboBox cmbRelType = null;

	private GroupBox grpSource = null;

	private Label lblSrcTable = null;

	private ComboBox cmbSourceTable = null;

	private Label lblSrcCol = null;

	private ComboBox cmbSourceCol = null;

	private GroupBox grpTarget = null;

	private Label lblTgtTable = null;

	private ComboBox cmbTargetTable = null;

	private Label lblTgtCol = null;

	private ComboBox cmbTargetCol = null;

	private Button btnOk = null;

	private Button btnCancel = null;

	private IContainer components = null;

	public DbRelationship Result { get; private set; }

	public RelationshipDialog(DbRelationship rel, DbSchema schema)
	{
		InitializeComponent();
		_schema = schema;
		Result = rel.Clone();
		PopulateTables();
		LoadRelationship(rel);
		WireEvents();
	}

	private void PopulateTables()
	{
		cmbSourceTable.Items.Clear();
		cmbTargetTable.Items.Clear();
		foreach (DbTable table in _schema.Tables)
		{
			cmbSourceTable.Items.Add(table.Name);
			cmbTargetTable.Items.Add(table.Name);
		}
		cmbRelType.Items.Clear();
		cmbRelType.Items.AddRange("1:1 (일대일)", "1:N (일대다)", "N:M (다대다)");
	}

	private void LoadRelationship(DbRelationship rel)
	{
		txtName.Text = rel.Name;
		ComboBox comboBox = cmbRelType;
		RelationshipType type = rel.Type;
		if (1 == 0)
		{
		}
		int selectedIndex = type switch
		{
			RelationshipType.OneToOne => 0, 
			RelationshipType.OneToMany => 1, 
			RelationshipType.ManyToMany => 2, 
			_ => 1, 
		};
		if (1 == 0)
		{
		}
		comboBox.SelectedIndex = selectedIndex;
		DbTable dbTable = _schema.FindTable(rel.SourceTableId);
		DbTable dbTable2 = _schema.FindTable(rel.TargetTableId);
		if (dbTable != null)
		{
			cmbSourceTable.SelectedItem = dbTable.Name;
			PopulateColumns(cmbSourceCol, dbTable, rel.SourceColumnId);
		}
		if (dbTable2 != null)
		{
			cmbTargetTable.SelectedItem = dbTable2.Name;
			PopulateColumns(cmbTargetCol, dbTable2, rel.TargetColumnId);
		}
	}

	private void PopulateColumns(ComboBox cmb, DbTable table, Guid selectedId)
	{
		cmb.Items.Clear();
		cmb.Items.Add("(없음)");
		foreach (DbColumn column in table.Columns)
		{
			cmb.Items.Add(column.Name);
		}
		int num = table.Columns.FindIndex((DbColumn c) => c.Id == selectedId);
		cmb.SelectedIndex = ((num >= 0) ? (num + 1) : 0);
	}

	private void WireEvents()
	{
		cmbSourceTable.SelectedIndexChanged += delegate
		{
			DbTable selectedTable = GetSelectedTable(cmbSourceTable);
			if (selectedTable != null)
			{
				PopulateColumns(cmbSourceCol, selectedTable, Guid.Empty);
			}
		};
		cmbTargetTable.SelectedIndexChanged += delegate
		{
			DbTable selectedTable = GetSelectedTable(cmbTargetTable);
			if (selectedTable != null)
			{
				PopulateColumns(cmbTargetCol, selectedTable, Guid.Empty);
			}
		};
		btnOk.Click += BtnOk_Click;
		btnCancel.Click += delegate
		{
			base.DialogResult = DialogResult.Cancel;
		};
		base.AcceptButton = btnOk;
		base.CancelButton = btnCancel;
	}

	private DbTable GetSelectedTable(ComboBox cmb)
	{
		return _schema.Tables.FirstOrDefault((DbTable t) => t.Name == cmb.SelectedItem.ToString());
	}

	private DbColumn GetSelectedColumn(ComboBox colCmb, DbTable table)
	{
		if (table == null || colCmb.SelectedIndex <= 0)
		{
			return null;
		}
		int num = colCmb.SelectedIndex - 1;
		return (num < table.Columns.Count) ? table.Columns[num] : null;
	}

	private void BtnOk_Click(object sender, EventArgs e)
	{
		DbTable selectedTable = GetSelectedTable(cmbSourceTable);
		DbTable selectedTable2 = GetSelectedTable(cmbTargetTable);
		if (selectedTable == null || selectedTable2 == null)
		{
			ErrorDialog.Show(this, "입력 오류", "소스 테이블과 타겟 테이블을 선택하세요.");
			return;
		}
		if (selectedTable.Id == selectedTable2.Id)
		{
			ErrorDialog.Show(this, "입력 오류", "소스와 타겟 테이블이 같을 수 없습니다.");
			return;
		}
		Result.Name = txtName.Text.Trim();
		DbRelationship result = Result;
		int selectedIndex = cmbRelType.SelectedIndex;
		if (1 == 0)
		{
		}
		RelationshipType type = selectedIndex switch
		{
			0 => RelationshipType.OneToOne, 
			2 => RelationshipType.ManyToMany, 
			_ => RelationshipType.OneToMany, 
		};
		if (1 == 0)
		{
		}
		result.Type = type;
		Result.SourceTableId = selectedTable.Id;
		Result.TargetTableId = selectedTable2.Id;
		Result.SourceColumnId = GetSelectedColumn(cmbSourceCol, selectedTable)?.Id ?? Guid.Empty;
		Result.TargetColumnId = GetSelectedColumn(cmbTargetCol, selectedTable2)?.Id ?? Guid.Empty;
		base.DialogResult = DialogResult.OK;
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing && components != null)
		{
			components.Dispose();
		}
		base.Dispose(disposing);
	}

	private void InitializeComponent()
	{
		this.lblName = new System.Windows.Forms.Label();
		this.txtName = new System.Windows.Forms.TextBox();
		this.lblRelType = new System.Windows.Forms.Label();
		this.cmbRelType = new System.Windows.Forms.ComboBox();
		this.grpSource = new System.Windows.Forms.GroupBox();
		this.lblSrcTable = new System.Windows.Forms.Label();
		this.cmbSourceTable = new System.Windows.Forms.ComboBox();
		this.lblSrcCol = new System.Windows.Forms.Label();
		this.cmbSourceCol = new System.Windows.Forms.ComboBox();
		this.grpTarget = new System.Windows.Forms.GroupBox();
		this.lblTgtTable = new System.Windows.Forms.Label();
		this.cmbTargetTable = new System.Windows.Forms.ComboBox();
		this.lblTgtCol = new System.Windows.Forms.Label();
		this.cmbTargetCol = new System.Windows.Forms.ComboBox();
		this.btnOk = new System.Windows.Forms.Button();
		this.btnCancel = new System.Windows.Forms.Button();
		this.grpSource.SuspendLayout();
		this.grpTarget.SuspendLayout();
		base.SuspendLayout();
		this.lblName.AutoSize = true;
		this.lblName.Location = new System.Drawing.Point(12, 15);
		this.lblName.Text = "관계 이름 (선택):";
		this.txtName.Location = new System.Drawing.Point(120, 12);
		this.txtName.Size = new System.Drawing.Size(230, 23);
		this.txtName.TabIndex = 0;
		this.lblRelType.AutoSize = true;
		this.lblRelType.Location = new System.Drawing.Point(12, 47);
		this.lblRelType.Text = "관계 유형:";
		this.cmbRelType.Location = new System.Drawing.Point(120, 44);
		this.cmbRelType.Size = new System.Drawing.Size(180, 23);
		this.cmbRelType.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.cmbRelType.TabIndex = 1;
		this.grpSource.Location = new System.Drawing.Point(12, 80);
		this.grpSource.Size = new System.Drawing.Size(340, 100);
		this.grpSource.Text = "소스 (참조하는 쪽)";
		this.grpSource.TabStop = false;
		this.lblSrcTable.AutoSize = true;
		this.lblSrcTable.Location = new System.Drawing.Point(10, 28);
		this.lblSrcTable.Text = "테이블:";
		this.cmbSourceTable.Location = new System.Drawing.Point(80, 25);
		this.cmbSourceTable.Size = new System.Drawing.Size(240, 23);
		this.cmbSourceTable.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.cmbSourceTable.TabIndex = 2;
		this.lblSrcCol.AutoSize = true;
		this.lblSrcCol.Location = new System.Drawing.Point(10, 62);
		this.lblSrcCol.Text = "컬럼:";
		this.cmbSourceCol.Location = new System.Drawing.Point(80, 59);
		this.cmbSourceCol.Size = new System.Drawing.Size(240, 23);
		this.cmbSourceCol.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.cmbSourceCol.TabIndex = 3;
		this.grpSource.Controls.AddRange(this.lblSrcTable, this.cmbSourceTable, this.lblSrcCol, this.cmbSourceCol);
		this.grpTarget.Location = new System.Drawing.Point(12, 195);
		this.grpTarget.Size = new System.Drawing.Size(340, 100);
		this.grpTarget.Text = "타겟 (참조받는 쪽)";
		this.grpTarget.TabStop = false;
		this.lblTgtTable.AutoSize = true;
		this.lblTgtTable.Location = new System.Drawing.Point(10, 28);
		this.lblTgtTable.Text = "테이블:";
		this.cmbTargetTable.Location = new System.Drawing.Point(80, 25);
		this.cmbTargetTable.Size = new System.Drawing.Size(240, 23);
		this.cmbTargetTable.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.cmbTargetTable.TabIndex = 4;
		this.lblTgtCol.AutoSize = true;
		this.lblTgtCol.Location = new System.Drawing.Point(10, 62);
		this.lblTgtCol.Text = "컬럼:";
		this.cmbTargetCol.Location = new System.Drawing.Point(80, 59);
		this.cmbTargetCol.Size = new System.Drawing.Size(240, 23);
		this.cmbTargetCol.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
		this.cmbTargetCol.TabIndex = 5;
		this.grpTarget.Controls.AddRange(this.lblTgtTable, this.cmbTargetTable, this.lblTgtCol, this.cmbTargetCol);
		this.btnOk.Location = new System.Drawing.Point(196, 312);
		this.btnOk.Size = new System.Drawing.Size(75, 30);
		this.btnOk.Text = "확인";
		this.btnOk.TabIndex = 6;
		this.btnCancel.Location = new System.Drawing.Point(277, 312);
		this.btnCancel.Size = new System.Drawing.Size(75, 30);
		this.btnCancel.Text = "취소";
		this.btnCancel.TabIndex = 7;
		this.btnCancel.DialogResult = System.Windows.Forms.DialogResult.Cancel;
		this.grpSource.ResumeLayout(false);
		this.grpSource.PerformLayout();
		this.grpTarget.ResumeLayout(false);
		this.grpTarget.PerformLayout();
		base.ClientSize = new System.Drawing.Size(366, 358);
		this.Text = "관계 편집";
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
		base.ShowInTaskbar = false;
		base.Controls.AddRange(this.lblName, this.txtName, this.lblRelType, this.cmbRelType, this.grpSource, this.grpTarget, this.btnOk, this.btnCancel);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
