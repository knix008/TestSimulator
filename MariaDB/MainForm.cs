using System.ComponentModel;

namespace PersonInfoApp
{
    public partial class MainForm : Form
    {
        private DatabaseService _databaseService;
        private List<Person> _persons;
        private Person? _selectedPerson;

        // ��Ʈ�ѵ�
        private TextBox txtName = null!;
        private NumericUpDown numAge = null!;
        private TextBox txtEmail = null!;
        private TextBox txtPhone = null!;
        private TextBox txtAddress = null!;
        private Button btnSave = null!;
        private Button btnUpdate = null!;
        private Button btnDelete = null!;
        private Button btnClear = null!;
        private Button btnRefresh = null!;
        private DataGridView dgvPersons = null!;
        private Label lblStatus = null!;

        public MainForm()
        {
            _databaseService = new DatabaseService();
            _persons = new List<Person>();
            InitializeComponent();
            InitializeDatabase();
        }

        private void InitializeComponent()
        {
            this.SuspendLayout();

            // �� �⺻ ����
            this.Text = "��� ���� ���� �ý���";
            this.Size = new Size(800, 600);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;

            // �׷�ڽ� - �Է� ��
            var grpInput = new GroupBox
            {
                Text = "��� ���� �Է�",
                Location = new Point(10, 10),
                Size = new Size(380, 250)
            };

            // �̸� �Է�
            var lblName = new Label
            {
                Text = "�̸�:",
                Location = new Point(10, 25),
                Size = new Size(50, 20)
            };
            txtName = new TextBox
            {
                Location = new Point(70, 23),
                Size = new Size(200, 23)
            };

            // ���� �Է�
            var lblAge = new Label
            {
                Text = "����:",
                Location = new Point(10, 55),
                Size = new Size(50, 20)
            };
            numAge = new NumericUpDown
            {
                Location = new Point(70, 53),
                Size = new Size(80, 23),
                Minimum = 0,
                Maximum = 150,
                Value = 25
            };

            // �̸��� �Է�
            var lblEmail = new Label
            {
                Text = "�̸���:",
                Location = new Point(10, 85),
                Size = new Size(50, 20)
            };
            txtEmail = new TextBox
            {
                Location = new Point(70, 83),
                Size = new Size(200, 23)
            };

            // ��ȭ��ȣ �Է�
            var lblPhone = new Label
            {
                Text = "��ȭ��ȣ:",
                Location = new Point(10, 115),
                Size = new Size(60, 20)
            };
            txtPhone = new TextBox
            {
                Location = new Point(80, 113),
                Size = new Size(190, 23)
            };

            // �ּ� �Է�
            var lblAddress = new Label
            {
                Text = "�ּ�:",
                Location = new Point(10, 145),
                Size = new Size(50, 20)
            };
            txtAddress = new TextBox
            {
                Location = new Point(70, 143),
                Size = new Size(200, 50),
                Multiline = true,
                ScrollBars = ScrollBars.Vertical
            };

            // ��ư��
            btnSave = new Button
            {
                Text = "����",
                Location = new Point(10, 205),
                Size = new Size(70, 30),
                BackColor = Color.LightGreen
            };
            btnSave.Click += BtnSave_Click;

            btnUpdate = new Button
            {
                Text = "����",
                Location = new Point(90, 205),
                Size = new Size(70, 30),
                BackColor = Color.LightBlue,
                Enabled = false
            };
            btnUpdate.Click += BtnUpdate_Click;

            btnDelete = new Button
            {
                Text = "����",
                Location = new Point(170, 205),
                Size = new Size(70, 30),
                BackColor = Color.LightCoral,
                Enabled = false
            };
            btnDelete.Click += BtnDelete_Click;

            btnClear = new Button
            {
                Text = "�����",
                Location = new Point(250, 205),
                Size = new Size(70, 30)
            };
            btnClear.Click += BtnClear_Click;

            // �׷�ڽ��� ��Ʈ�� �߰�
            grpInput.Controls.AddRange(new Control[] {
                lblName, txtName, lblAge, numAge, lblEmail, txtEmail,
                lblPhone, txtPhone, lblAddress, txtAddress,
                btnSave, btnUpdate, btnDelete, btnClear
            });

            // ���ΰ�ħ ��ư
            btnRefresh = new Button
            {
                Text = "���ΰ�ħ",
                Location = new Point(400, 10),
                Size = new Size(80, 30),
                BackColor = Color.LightYellow
            };
            btnRefresh.Click += BtnRefresh_Click;

            // ������ �׸����
            dgvPersons = new DataGridView
            {
                Location = new Point(400, 50),
                Size = new Size(380, 480),
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                ReadOnly = true,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
            };
            dgvPersons.SelectionChanged += DgvPersons_SelectionChanged;

            // ���� ��
            lblStatus = new Label
            {
                Text = "�غ��",
                Location = new Point(10, 270),
                Size = new Size(380, 20),
                ForeColor = Color.Blue
            };

            // ���� ��Ʈ�� �߰�
            this.Controls.AddRange(new Control[] {
                grpInput, btnRefresh, dgvPersons, lblStatus
            });

            this.ResumeLayout(false);
        }

        private async void InitializeDatabase()
        {
            lblStatus.Text = "�����ͺ��̽� ���� ��...";
            lblStatus.ForeColor = Color.Orange;

            try
            {
                // ���̺� ����
                bool tableCreated = await _databaseService.CreateTableIfNotExistsAsync();
                if (!tableCreated)
                {
                    lblStatus.Text = "�����ͺ��̽� ���� ����!";
                    lblStatus.ForeColor = Color.Red;
                    MessageBox.Show("�����ͺ��̽� ���ῡ �����߽��ϴ�. ���� ������ Ȯ�����ּ���.", "����", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // ������ �ε�
                await LoadPersonsAsync();
                lblStatus.Text = "�����ͺ��̽� ���� ����!";
                lblStatus.ForeColor = Color.Green;
            }
            catch (Exception ex)
            {
                lblStatus.Text = "���� �߻�: " + ex.Message;
                lblStatus.ForeColor = Color.Red;
                MessageBox.Show($"������ �߻��߽��ϴ�: {ex.Message}", "����", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task LoadPersonsAsync()
        {
            try
            {
                _persons = await _databaseService.GetAllPersonsAsync();
                RefreshDataGridView();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"������ �ε� �� ������ �߻��߽��ϴ�: {ex.Message}", "����", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RefreshDataGridView()
        {
            dgvPersons.DataSource = null;
            dgvPersons.DataSource = _persons.Select(p => new
            {
                ID = p.Id,
                �̸� = p.Name,
                ���� = p.Age,
                �̸��� = p.Email,
                ��ȭ��ȣ = p.Phone,
                �ּ� = p.Address,
                ����� = p.CreatedDate.ToString("yyyy-MM-dd HH:mm")
            }).ToList();

            if (dgvPersons.Columns.Count > 0)
            {
                dgvPersons.Columns[0].Width = 50; // ID �÷� �ʺ� ����
                dgvPersons.Columns[1].Width = 80; // �̸� �÷� �ʺ� ����
                dgvPersons.Columns[2].Width = 50; // ���� �÷� �ʺ� ����
            }
        }

        private void ClearInputFields()
        {
            txtName.Clear();
            numAge.Value = 25;
            txtEmail.Clear();
            txtPhone.Clear();
            txtAddress.Clear();
            _selectedPerson = null;
            btnUpdate.Enabled = false;
            btnDelete.Enabled = false;
        }

        private bool ValidateInput()
        {
            if (string.IsNullOrWhiteSpace(txtName.Text))
            {
                MessageBox.Show("�̸��� �Է����ּ���.", "�Է� ����", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtName.Focus();
                return false;
            }

            if (numAge.Value <= 0)
            {
                MessageBox.Show("�ùٸ� ���̸� �Է����ּ���.", "�Է� ����", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                numAge.Focus();
                return false;
            }

            return true;
        }

        private Person GetPersonFromInput()
        {
            return new Person
            {
                Id = _selectedPerson?.Id ?? 0,
                Name = txtName.Text.Trim(),
                Age = (int)numAge.Value,
                Email = txtEmail.Text.Trim(),
                Phone = txtPhone.Text.Trim(),
                Address = txtAddress.Text.Trim()
            };
        }

        private async void BtnSave_Click(object? sender, EventArgs e)
        {
            if (!ValidateInput()) return;

            try
            {
                var person = GetPersonFromInput();
                bool success = await _databaseService.InsertPersonAsync(person);

                if (success)
                {
                    MessageBox.Show("��� ������ ���������� ����Ǿ����ϴ�.", "���� �Ϸ�", 
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    ClearInputFields();
                    await LoadPersonsAsync();
                    lblStatus.Text = "���ο� ������ ����Ǿ����ϴ�.";
                    lblStatus.ForeColor = Color.Green;
                }
                else
                {
                    MessageBox.Show("���� �� ������ �߻��߽��ϴ�.", "���� ����", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"���� �� ������ �߻��߽��ϴ�: {ex.Message}", "����", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void BtnUpdate_Click(object? sender, EventArgs e)
        {
            if (!ValidateInput() || _selectedPerson == null) return;

            try
            {
                var person = GetPersonFromInput();
                bool success = await _databaseService.UpdatePersonAsync(person);

                if (success)
                {
                    MessageBox.Show("��� ������ ���������� �����Ǿ����ϴ�.", "���� �Ϸ�", 
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    ClearInputFields();
                    await LoadPersonsAsync();
                    lblStatus.Text = "������ �����Ǿ����ϴ�.";
                    lblStatus.ForeColor = Color.Green;
                }
                else
                {
                    MessageBox.Show("���� �� ������ �߻��߽��ϴ�.", "���� ����", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"���� �� ������ �߻��߽��ϴ�: {ex.Message}", "����", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void BtnDelete_Click(object? sender, EventArgs e)
        {
            if (_selectedPerson == null) return;

            var result = MessageBox.Show($"'{_selectedPerson.Name}'���� ������ �����Ͻðڽ��ϱ�?", "���� Ȯ��", 
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (result == DialogResult.Yes)
            {
                try
                {
                    bool success = await _databaseService.DeletePersonAsync(_selectedPerson.Id);

                    if (success)
                    {
                        MessageBox.Show("��� ������ ���������� �����Ǿ����ϴ�.", "���� �Ϸ�", 
                            MessageBoxButtons.OK, MessageBoxIcon.Information);
                        ClearInputFields();
                        await LoadPersonsAsync();
                        lblStatus.Text = "������ �����Ǿ����ϴ�.";
                        lblStatus.ForeColor = Color.Green;
                    }
                    else
                    {
                        MessageBox.Show("���� �� ������ �߻��߽��ϴ�.", "���� ����", 
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"���� �� ������ �߻��߽��ϴ�: {ex.Message}", "����", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void BtnClear_Click(object? sender, EventArgs e)
        {
            ClearInputFields();
            lblStatus.Text = "�Է� �ʵ尡 ���������ϴ�.";
            lblStatus.ForeColor = Color.Blue;
        }

        private async void BtnRefresh_Click(object? sender, EventArgs e)
        {
            await LoadPersonsAsync();
            lblStatus.Text = "�����Ͱ� ���ΰ�ħ�Ǿ����ϴ�.";
            lblStatus.ForeColor = Color.Blue;
        }

        private void DgvPersons_SelectionChanged(object? sender, EventArgs e)
        {
            if (dgvPersons.SelectedRows.Count > 0)
            {
                var selectedRow = dgvPersons.SelectedRows[0];
                int id = Convert.ToInt32(selectedRow.Cells["ID"].Value);
                _selectedPerson = _persons.FirstOrDefault(p => p.Id == id);

                if (_selectedPerson != null)
                {
                    txtName.Text = _selectedPerson.Name;
                    numAge.Value = _selectedPerson.Age;
                    txtEmail.Text = _selectedPerson.Email;
                    txtPhone.Text = _selectedPerson.Phone;
                    txtAddress.Text = _selectedPerson.Address;

                    btnUpdate.Enabled = true;
                    btnDelete.Enabled = true;
                }
            }
        }
    }
}
