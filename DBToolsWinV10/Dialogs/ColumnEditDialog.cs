using System;
using System.ComponentModel;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Dialogs;

public class ColumnEditDialog : Form
{
	private readonly DbTargetType _dbType;

	private Label lblName = null;

	private TextBox txtName = null;

	private Label lblDataType = null;

	private ComboBox cmbDataType = null;

	private Label lblLength = null;

	private NumericUpDown nudLength = null;

	private Label lblPrecision = null;

	private NumericUpDown nudPrecision = null;

	private Label lblScale = null;

	private NumericUpDown nudScale = null;

	private CheckBox chkPrimaryKey = null;

	private CheckBox chkAutoInc = null;

	private CheckBox chkNullable = null;

	private CheckBox chkUnique = null;

	private CheckBox chkForeignKey = null;

	private Label lblDefault = null;

	private TextBox txtDefault = null;

	private Label lblComment = null;

	private TextBox txtComment = null;

	private Button btnOk = null;

	private Button btnCancel = null;

	private IContainer components = null;

	public DbColumn Result { get; private set; }

	public ColumnEditDialog(DbColumn column, DbTargetType dbType)
	{
		InitializeComponent();
		_dbType = dbType;
		Result = column.Clone();
		PopulateDataTypes();
		LoadColumn(column);
		WireEvents();
	}

	private void PopulateDataTypes()
	{
		cmbDataType.Items.Clear();
		cmbDataType.Items.AddRange(DataTypeProvider.GetTypes(_dbType).Cast<object>().ToArray());
	}

	private void LoadColumn(DbColumn col)
	{
		txtName.Text = col.Name;
		cmbDataType.Text = col.DataType;
		SetNumericValue(nudLength, col.Length ?? 255, nudLength.Minimum, nudLength.Maximum);
		SetNumericValue(nudPrecision, col.Precision ?? 10, nudPrecision.Minimum, nudPrecision.Maximum);
		SetNumericValue(nudScale, col.Scale ?? 2, nudScale.Minimum, nudScale.Maximum);
		chkPrimaryKey.Checked = col.IsPrimaryKey;
		chkAutoInc.Checked = col.IsAutoIncrement;
		chkNullable.Checked = col.IsNullable;
		chkUnique.Checked = col.IsUnique;
		chkForeignKey.Checked = col.IsForeignKey;
		txtDefault.Text = col.DefaultValue ?? string.Empty;
		txtComment.Text = col.Comment ?? string.Empty;
		UpdateFieldVisibility();
		UpdateConstraintState();
	}

	private static void SetNumericValue(NumericUpDown control, int value, decimal minimum, decimal maximum)
	{
		decimal clamped = Math.Clamp(value, minimum, maximum);
		control.Value = clamped;
	}

	private void WireEvents()
	{
		cmbDataType.SelectedIndexChanged += delegate
		{
			UpdateFieldVisibility();
		};
		cmbDataType.TextChanged += delegate
		{
			UpdateFieldVisibility();
		};
		chkPrimaryKey.CheckedChanged += delegate
		{
			UpdateConstraintState();
		};
		btnOk.Click += BtnOk_Click;
		btnCancel.Click += delegate
		{
			base.DialogResult = DialogResult.Cancel;
		};
		base.AcceptButton = btnOk;
		base.CancelButton = btnCancel;
	}

	private void UpdateFieldVisibility()
	{
		string type = cmbDataType.Text.ToUpperInvariant();
		bool visible = DataTypeProvider.TypeHasLength(type);
		bool visible2 = DataTypeProvider.TypeHasPrecisionScale(type);
		lblLength.Visible = visible;
		nudLength.Visible = visible;
		lblPrecision.Visible = visible2;
		nudPrecision.Visible = visible2;
		lblScale.Visible = visible2;
		nudScale.Visible = visible2;
	}

	private void UpdateConstraintState()
	{
		bool flag = chkPrimaryKey.Checked;
		chkAutoInc.Enabled = flag;
		chkNullable.Enabled = !flag;
		if (flag)
		{
			chkNullable.Checked = false;
		}
	}

	private void BtnOk_Click(object sender, EventArgs e)
	{
		if (string.IsNullOrWhiteSpace(txtName.Text))
		{
			ErrorDialog.Show(this, "입력 오류", "컬럼 이름을 입력하세요.");
			return;
		}
		if (string.IsNullOrWhiteSpace(cmbDataType.Text))
		{
			ErrorDialog.Show(this, "입력 오류", "데이터 타입을 선택하세요.");
			return;
		}
		string type = cmbDataType.Text.ToUpperInvariant();
		Result.Name = txtName.Text.Trim();
		Result.DataType = cmbDataType.Text.Trim();
		Result.Length = (DataTypeProvider.TypeHasLength(type) ? new int?((int)nudLength.Value) : ((int?)null));
		Result.Precision = (DataTypeProvider.TypeHasPrecisionScale(type) ? new int?((int)nudPrecision.Value) : ((int?)null));
		Result.Scale = (DataTypeProvider.TypeHasPrecisionScale(type) ? new int?((int)nudScale.Value) : ((int?)null));
		Result.IsPrimaryKey = chkPrimaryKey.Checked;
		Result.IsAutoIncrement = chkAutoInc.Checked;
		Result.IsNullable = chkNullable.Checked;
		Result.IsUnique = chkUnique.Checked;
		Result.IsForeignKey = chkForeignKey.Checked;
		Result.DefaultValue = (string.IsNullOrWhiteSpace(txtDefault.Text) ? null : txtDefault.Text);
		Result.Comment = (string.IsNullOrWhiteSpace(txtComment.Text) ? null : txtComment.Text);
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
		this.lblDataType = new System.Windows.Forms.Label();
		this.cmbDataType = new System.Windows.Forms.ComboBox();
		this.lblLength = new System.Windows.Forms.Label();
		this.nudLength = new System.Windows.Forms.NumericUpDown();
		this.lblPrecision = new System.Windows.Forms.Label();
		this.nudPrecision = new System.Windows.Forms.NumericUpDown();
		this.lblScale = new System.Windows.Forms.Label();
		this.nudScale = new System.Windows.Forms.NumericUpDown();
		this.chkPrimaryKey = new System.Windows.Forms.CheckBox();
		this.chkAutoInc = new System.Windows.Forms.CheckBox();
		this.chkNullable = new System.Windows.Forms.CheckBox();
		this.chkUnique = new System.Windows.Forms.CheckBox();
		this.chkForeignKey = new System.Windows.Forms.CheckBox();
		this.lblDefault = new System.Windows.Forms.Label();
		this.txtDefault = new System.Windows.Forms.TextBox();
		this.lblComment = new System.Windows.Forms.Label();
		this.txtComment = new System.Windows.Forms.TextBox();
		this.btnOk = new System.Windows.Forms.Button();
		this.btnCancel = new System.Windows.Forms.Button();
		((System.ComponentModel.ISupportInitialize)this.nudLength).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.nudPrecision).BeginInit();
		((System.ComponentModel.ISupportInitialize)this.nudScale).BeginInit();
		base.SuspendLayout();
		this.lblName.AutoSize = true;
		this.lblName.Location = new System.Drawing.Point(12, 14);
		this.lblName.Size = new System.Drawing.Size(56, 15);
		this.lblName.Text = "컬럼 이름:";
		this.txtName.Location = new System.Drawing.Point(100, 11);
		this.txtName.Size = new System.Drawing.Size(230, 23);
		this.txtName.TabIndex = 0;
		this.lblDataType.AutoSize = true;
		this.lblDataType.Location = new System.Drawing.Point(12, 46);
		this.lblDataType.Text = "데이터 타입:";
		this.cmbDataType.Location = new System.Drawing.Point(100, 43);
		this.cmbDataType.Size = new System.Drawing.Size(180, 23);
		this.cmbDataType.TabIndex = 1;
		this.cmbDataType.AutoCompleteMode = System.Windows.Forms.AutoCompleteMode.SuggestAppend;
		this.cmbDataType.AutoCompleteSource = System.Windows.Forms.AutoCompleteSource.ListItems;
		this.lblLength.AutoSize = true;
		this.lblLength.Location = new System.Drawing.Point(12, 80);
		this.lblLength.Text = "길이:";
		this.nudLength.Location = new System.Drawing.Point(100, 77);
		this.nudLength.Size = new System.Drawing.Size(80, 23);
		this.nudLength.Minimum = 1m;
		this.nudLength.Maximum = 65535m;
		this.nudLength.Value = 255m;
		this.nudLength.TabIndex = 2;
		this.lblPrecision.AutoSize = true;
		this.lblPrecision.Location = new System.Drawing.Point(12, 80);
		this.lblPrecision.Text = "정밀도:";
		this.nudPrecision.Location = new System.Drawing.Point(100, 77);
		this.nudPrecision.Size = new System.Drawing.Size(60, 23);
		this.nudPrecision.Minimum = 1m;
		this.nudPrecision.Maximum = 65m;
		this.nudPrecision.Value = 10m;
		this.nudPrecision.TabIndex = 3;
		this.lblScale.AutoSize = true;
		this.lblScale.Location = new System.Drawing.Point(170, 80);
		this.lblScale.Text = "스케일:";
		this.nudScale.Location = new System.Drawing.Point(220, 77);
		this.nudScale.Size = new System.Drawing.Size(60, 23);
		this.nudScale.Minimum = 0m;
		this.nudScale.Maximum = 30m;
		this.nudScale.Value = 2m;
		this.nudScale.TabIndex = 4;
		this.chkPrimaryKey.AutoSize = true;
		this.chkPrimaryKey.Location = new System.Drawing.Point(12, 114);
		this.chkPrimaryKey.Text = "기본 키 (PK)";
		this.chkPrimaryKey.TabIndex = 5;
		this.chkAutoInc.AutoSize = true;
		this.chkAutoInc.Location = new System.Drawing.Point(130, 114);
		this.chkAutoInc.Text = "자동 증가";
		this.chkAutoInc.TabIndex = 6;
		this.chkNullable.AutoSize = true;
		this.chkNullable.Location = new System.Drawing.Point(12, 142);
		this.chkNullable.Text = "NULL 허용";
		this.chkNullable.Checked = true;
		this.chkNullable.TabIndex = 7;
		this.chkUnique.AutoSize = true;
		this.chkUnique.Location = new System.Drawing.Point(130, 142);
		this.chkUnique.Text = "유니크";
		this.chkUnique.TabIndex = 8;
		this.chkForeignKey.AutoSize = true;
		this.chkForeignKey.Location = new System.Drawing.Point(12, 170);
		this.chkForeignKey.Text = "외래 키 (FK)";
		this.chkForeignKey.TabIndex = 9;
		this.lblDefault.AutoSize = true;
		this.lblDefault.Location = new System.Drawing.Point(12, 204);
		this.lblDefault.Text = "기본값:";
		this.txtDefault.Location = new System.Drawing.Point(100, 201);
		this.txtDefault.Size = new System.Drawing.Size(230, 23);
		this.txtDefault.TabIndex = 10;
		this.lblComment.AutoSize = true;
		this.lblComment.Location = new System.Drawing.Point(12, 238);
		this.lblComment.Text = "설명:";
		this.txtComment.Location = new System.Drawing.Point(100, 235);
		this.txtComment.Size = new System.Drawing.Size(230, 23);
		this.txtComment.TabIndex = 11;
		this.btnOk.Location = new System.Drawing.Point(174, 276);
		this.btnOk.Size = new System.Drawing.Size(75, 30);
		this.btnOk.Text = "확인";
		this.btnOk.TabIndex = 12;
		this.btnOk.DialogResult = System.Windows.Forms.DialogResult.None;
		this.btnCancel.Location = new System.Drawing.Point(255, 276);
		this.btnCancel.Size = new System.Drawing.Size(75, 30);
		this.btnCancel.Text = "취소";
		this.btnCancel.TabIndex = 13;
		this.btnCancel.DialogResult = System.Windows.Forms.DialogResult.Cancel;
		((System.ComponentModel.ISupportInitialize)this.nudLength).EndInit();
		((System.ComponentModel.ISupportInitialize)this.nudPrecision).EndInit();
		((System.ComponentModel.ISupportInitialize)this.nudScale).EndInit();
		base.ClientSize = new System.Drawing.Size(348, 320);
		this.Text = "컬럼 편집";
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
		base.ShowInTaskbar = false;
		base.Controls.AddRange(this.lblName, this.txtName, this.lblDataType, this.cmbDataType, this.lblLength, this.nudLength, this.lblPrecision, this.nudPrecision, this.lblScale, this.nudScale, this.chkPrimaryKey, this.chkAutoInc, this.chkNullable, this.chkUnique, this.chkForeignKey, this.lblDefault, this.txtDefault, this.lblComment, this.txtComment, this.btnOk, this.btnCancel);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
