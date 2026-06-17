using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Dialogs;

public class TableEditDialog : Form
{
	private readonly DbTargetType _dbType;

	private readonly List<DbColumn> _columns;

	private Label lblName = null;

	private TextBox txtName = null;

	private Label lblComment = null;

	private TextBox txtComment = null;

	private DataGridView dgvColumns = null;

	private Panel panelButtons = null;

	private Button btnAddCol = null;

	private Button btnEditCol = null;

	private Button btnDeleteCol = null;

	private Button btnMoveUp = null;

	private Button btnMoveDown = null;

	private Button btnOk = null;

	private Button btnCancel = null;

	private IContainer components = null;

	public DbTable Result { get; private set; }

	public TableEditDialog(DbTable table, DbTargetType dbType)
	{
		InitializeComponent();
		_dbType = dbType;
		Result = table.Clone();
		_columns = Result.Columns;
		txtName.Text = table.Name;
		txtComment.Text = table.Comment ?? string.Empty;
		RefreshGrid();
		WireEvents();
	}

	private void WireEvents()
	{
		btnAddCol.Click += BtnAddCol_Click;
		btnEditCol.Click += BtnEditCol_Click;
		btnDeleteCol.Click += BtnDeleteCol_Click;
		btnMoveUp.Click += BtnMoveUp_Click;
		btnMoveDown.Click += BtnMoveDown_Click;
		btnOk.Click += BtnOk_Click;
		btnCancel.Click += delegate
		{
			base.DialogResult = DialogResult.Cancel;
		};
		dgvColumns.CellDoubleClick += delegate
		{
			BtnEditCol_Click(null, EventArgs.Empty);
		};
		base.AcceptButton = btnOk;
		base.CancelButton = btnCancel;
	}

	private void RefreshGrid()
	{
		dgvColumns.Rows.Clear();
		foreach (DbColumn column in _columns)
		{
			dgvColumns.Rows.Add(column.Name, column.GetTypeDisplay(), column.IsPrimaryKey ? "✓" : "", column.IsAutoIncrement ? "✓" : "", column.IsNullable ? "✓" : "", column.IsUnique ? "✓" : "", column.DefaultValue ?? "");
		}
	}

	private void BtnAddCol_Click(object sender, EventArgs e)
	{
		try
		{
			string[] types = DataTypeProvider.GetTypes(_dbType);
			DbColumn column = new DbColumn
			{
				Name = $"col_{_columns.Count + 1}",
				DataType = types.Length > 0 ? types[0] : "TEXT",
				IsNullable = true
			};
			if (DataTypeProvider.TypeHasLength(column.DataType))
				column.Length = _dbType == DbTargetType.VectorDb ? 128 : 255;

			using ColumnEditDialog columnEditDialog = new ColumnEditDialog(column, _dbType);
			if (columnEditDialog.ShowDialog(this) == DialogResult.OK)
			{
				_columns.Add(columnEditDialog.Result);
				RefreshGrid();
				if (dgvColumns.Rows.Count > 0)
					dgvColumns.CurrentCell = dgvColumns.Rows[dgvColumns.Rows.Count - 1].Cells[0];
			}
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "컬럼 추가 오류", ex, "컬럼을 추가할 수 없습니다.");
		}
	}

	private void BtnEditCol_Click(object sender, EventArgs e)
	{
		int num = dgvColumns.CurrentRow?.Index ?? -1;
		if (num < 0 || num >= _columns.Count)
		{
			return;
		}
		using ColumnEditDialog columnEditDialog = new ColumnEditDialog(_columns[num], _dbType);
		if (columnEditDialog.ShowDialog(this) == DialogResult.OK)
		{
			_columns[num] = columnEditDialog.Result;
			RefreshGrid();
			if (num < dgvColumns.Rows.Count)
			{
				dgvColumns.CurrentCell = dgvColumns.Rows[num].Cells[0];
			}
		}
	}

	private void BtnDeleteCol_Click(object sender, EventArgs e)
	{
		int num = dgvColumns.CurrentRow?.Index ?? -1;
		if (num >= 0 && num < _columns.Count && MessageBox.Show("컬럼 '" + _columns[num].Name + "'을(를) 삭제할까요?", "삭제 확인", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
		{
			_columns.RemoveAt(num);
			RefreshGrid();
		}
	}

	private void BtnMoveUp_Click(object sender, EventArgs e)
	{
		int num = dgvColumns.CurrentRow?.Index ?? -1;
		if (num > 0 && num < _columns.Count)
		{
			List<DbColumn> columns = _columns;
			int index = num;
			List<DbColumn> columns2 = _columns;
			int index2 = num - 1;
			DbColumn value = _columns[num - 1];
			DbColumn value2 = _columns[num];
			columns[index] = value;
			columns2[index2] = value2;
			RefreshGrid();
			dgvColumns.CurrentCell = dgvColumns.Rows[num - 1].Cells[0];
		}
	}

	private void BtnMoveDown_Click(object sender, EventArgs e)
	{
		int num = dgvColumns.CurrentRow?.Index ?? -1;
		if (num >= 0 && num < _columns.Count - 1)
		{
			List<DbColumn> columns = _columns;
			int index = num;
			List<DbColumn> columns2 = _columns;
			int index2 = num + 1;
			DbColumn value = _columns[num + 1];
			DbColumn value2 = _columns[num];
			columns[index] = value;
			columns2[index2] = value2;
			RefreshGrid();
			dgvColumns.CurrentCell = dgvColumns.Rows[num + 1].Cells[0];
		}
	}

	private void BtnOk_Click(object sender, EventArgs e)
	{
		if (string.IsNullOrWhiteSpace(txtName.Text))
		{
			ErrorDialog.Show(this, "입력 오류", "테이블 이름을 입력하세요.");
			return;
		}
		Result.Name = txtName.Text.Trim();
		Result.Comment = (string.IsNullOrWhiteSpace(txtComment.Text) ? null : txtComment.Text);
		Result.Columns = _columns;
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
		this.lblComment = new System.Windows.Forms.Label();
		this.txtComment = new System.Windows.Forms.TextBox();
		this.dgvColumns = new System.Windows.Forms.DataGridView();
		this.panelButtons = new System.Windows.Forms.Panel();
		this.btnAddCol = new System.Windows.Forms.Button();
		this.btnEditCol = new System.Windows.Forms.Button();
		this.btnDeleteCol = new System.Windows.Forms.Button();
		this.btnMoveUp = new System.Windows.Forms.Button();
		this.btnMoveDown = new System.Windows.Forms.Button();
		this.btnOk = new System.Windows.Forms.Button();
		this.btnCancel = new System.Windows.Forms.Button();
		((System.ComponentModel.ISupportInitialize)this.dgvColumns).BeginInit();
		this.panelButtons.SuspendLayout();
		base.SuspendLayout();
		this.lblName.AutoSize = true;
		this.lblName.Location = new System.Drawing.Point(12, 15);
		this.lblName.Text = "테이블 이름:";
		this.txtName.Location = new System.Drawing.Point(100, 12);
		this.txtName.Size = new System.Drawing.Size(340, 23);
		this.txtName.TabIndex = 0;
		this.lblComment.AutoSize = true;
		this.lblComment.Location = new System.Drawing.Point(12, 47);
		this.lblComment.Text = "설명 (선택):";
		this.txtComment.Location = new System.Drawing.Point(100, 44);
		this.txtComment.Size = new System.Drawing.Size(340, 23);
		this.txtComment.TabIndex = 1;
		this.dgvColumns.Location = new System.Drawing.Point(12, 80);
		this.dgvColumns.Size = new System.Drawing.Size(540, 300);
		this.dgvColumns.TabIndex = 2;
		this.dgvColumns.AllowUserToAddRows = false;
		this.dgvColumns.AllowUserToDeleteRows = false;
		this.dgvColumns.ReadOnly = true;
		this.dgvColumns.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
		this.dgvColumns.MultiSelect = false;
		this.dgvColumns.RowHeadersWidth = 24;
		this.dgvColumns.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
		this.dgvColumns.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
		this.dgvColumns.BackgroundColor = System.Drawing.Color.White;
		this.dgvColumns.Columns.Add(new System.Windows.Forms.DataGridViewTextBoxColumn
		{
			Name = "colName",
			HeaderText = "이름",
			FillWeight = 30f
		});
		this.dgvColumns.Columns.Add(new System.Windows.Forms.DataGridViewTextBoxColumn
		{
			Name = "colType",
			HeaderText = "타입",
			FillWeight = 25f
		});
		this.dgvColumns.Columns.Add(new System.Windows.Forms.DataGridViewTextBoxColumn
		{
			Name = "colPK",
			HeaderText = "PK",
			FillWeight = 8f
		});
		this.dgvColumns.Columns.Add(new System.Windows.Forms.DataGridViewTextBoxColumn
		{
			Name = "colAI",
			HeaderText = "AI",
			FillWeight = 8f
		});
		this.dgvColumns.Columns.Add(new System.Windows.Forms.DataGridViewTextBoxColumn
		{
			Name = "colNull",
			HeaderText = "Null",
			FillWeight = 8f
		});
		this.dgvColumns.Columns.Add(new System.Windows.Forms.DataGridViewTextBoxColumn
		{
			Name = "colUnique",
			HeaderText = "Unique",
			FillWeight = 8f
		});
		this.dgvColumns.Columns.Add(new System.Windows.Forms.DataGridViewTextBoxColumn
		{
			Name = "colDefault",
			HeaderText = "기본값",
			FillWeight = 13f
		});
		this.panelButtons.Location = new System.Drawing.Point(558, 80);
		this.panelButtons.Size = new System.Drawing.Size(84, 300);
		this.btnAddCol.Location = new System.Drawing.Point(0, 0);
		this.btnAddCol.Size = new System.Drawing.Size(80, 30);
		this.btnAddCol.Text = "추가";
		this.btnAddCol.TabIndex = 3;
		this.btnEditCol.Location = new System.Drawing.Point(0, 36);
		this.btnEditCol.Size = new System.Drawing.Size(80, 30);
		this.btnEditCol.Text = "편집";
		this.btnEditCol.TabIndex = 4;
		this.btnDeleteCol.Location = new System.Drawing.Point(0, 72);
		this.btnDeleteCol.Size = new System.Drawing.Size(80, 30);
		this.btnDeleteCol.Text = "삭제";
		this.btnDeleteCol.TabIndex = 5;
		this.btnMoveUp.Location = new System.Drawing.Point(0, 116);
		this.btnMoveUp.Size = new System.Drawing.Size(80, 30);
		this.btnMoveUp.Text = "위로 ↑";
		this.btnMoveUp.TabIndex = 6;
		this.btnMoveDown.Location = new System.Drawing.Point(0, 152);
		this.btnMoveDown.Size = new System.Drawing.Size(80, 30);
		this.btnMoveDown.Text = "아래로 ↓";
		this.btnMoveDown.TabIndex = 7;
		this.panelButtons.Controls.AddRange(this.btnAddCol, this.btnEditCol, this.btnDeleteCol, this.btnMoveUp, this.btnMoveDown);
		this.btnOk.Location = new System.Drawing.Point(474, 396);
		this.btnOk.Size = new System.Drawing.Size(75, 30);
		this.btnOk.Text = "확인";
		this.btnOk.TabIndex = 8;
		this.btnCancel.Location = new System.Drawing.Point(555, 396);
		this.btnCancel.Size = new System.Drawing.Size(75, 30);
		this.btnCancel.Text = "취소";
		this.btnCancel.TabIndex = 9;
		this.btnCancel.DialogResult = System.Windows.Forms.DialogResult.Cancel;
		((System.ComponentModel.ISupportInitialize)this.dgvColumns).EndInit();
		this.panelButtons.ResumeLayout(false);
		base.ClientSize = new System.Drawing.Size(648, 440);
		this.Text = "테이블 편집";
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
		base.ShowInTaskbar = false;
		base.Controls.AddRange(this.lblName, this.txtName, this.lblComment, this.txtComment, this.dgvColumns, this.panelButtons, this.btnOk, this.btnCancel);
		base.ResumeLayout(false);
		base.PerformLayout();
	}
}
