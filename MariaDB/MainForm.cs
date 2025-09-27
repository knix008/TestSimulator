using System.ComponentModel;

namespace PersonInfoApp
{
    public partial class MainForm : Form
    {
        private DatabaseService _databaseService;
        private List<Person> _persons;
        private Person? _selectedPerson;

        // 컨트롤들
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

            // 폼 기본 설정
            this.Text = "사람 정보 관리 시스템";
            this.Size = new Size(800, 600);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;

            // 그룹박스 - 입력 폼
            var grpInput = new GroupBox
            {
                Text = "사람 정보 입력",
                Location = new Point(10, 10),
                Size = new Size(380, 250)
            };

            // 이름 입력
            var lblName = new Label
            {
                Text = "이름:",
                Location = new Point(10, 25),
                Size = new Size(50, 20)
            };
            txtName = new TextBox
            {
                Location = new Point(70, 23),
                Size = new Size(200, 23)
            };

            // 나이 입력
            var lblAge = new Label
            {
                Text = "나이:",
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

            // 이메일 입력
            var lblEmail = new Label
            {
                Text = "이메일:",
                Location = new Point(10, 85),
                Size = new Size(50, 20)
            };
            txtEmail = new TextBox
            {
                Location = new Point(70, 83),
                Size = new Size(200, 23)
            };

            // 전화번호 입력
            var lblPhone = new Label
            {
                Text = "전화번호:",
                Location = new Point(10, 115),
                Size = new Size(60, 20)
            };
            txtPhone = new TextBox
            {
                Location = new Point(80, 113),
                Size = new Size(190, 23)
            };

            // 주소 입력
            var lblAddress = new Label
            {
                Text = "주소:",
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

            // 버튼들
            btnSave = new Button
            {
                Text = "저장",
                Location = new Point(10, 205),
                Size = new Size(70, 30),
                BackColor = Color.LightGreen
            };
            btnSave.Click += BtnSave_Click;

            btnUpdate = new Button
            {
                Text = "수정",
                Location = new Point(90, 205),
                Size = new Size(70, 30),
                BackColor = Color.LightBlue,
                Enabled = false
            };
            btnUpdate.Click += BtnUpdate_Click;

            btnDelete = new Button
            {
                Text = "삭제",
                Location = new Point(170, 205),
                Size = new Size(70, 30),
                BackColor = Color.LightCoral,
                Enabled = false
            };
            btnDelete.Click += BtnDelete_Click;

            btnClear = new Button
            {
                Text = "지우기",
                Location = new Point(250, 205),
                Size = new Size(70, 30)
            };
            btnClear.Click += BtnClear_Click;

            // 그룹박스에 컨트롤 추가
            grpInput.Controls.AddRange(new Control[] {
                lblName, txtName, lblAge, numAge, lblEmail, txtEmail,
                lblPhone, txtPhone, lblAddress, txtAddress,
                btnSave, btnUpdate, btnDelete, btnClear
            });

            // 새로고침 버튼
            btnRefresh = new Button
            {
                Text = "새로고침",
                Location = new Point(400, 10),
                Size = new Size(80, 30),
                BackColor = Color.LightYellow
            };
            btnRefresh.Click += BtnRefresh_Click;

            // 데이터 그리드뷰
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

            // 상태 라벨
            lblStatus = new Label
            {
                Text = "준비됨",
                Location = new Point(10, 270),
                Size = new Size(380, 20),
                ForeColor = Color.Blue
            };

            // 폼에 컨트롤 추가
            this.Controls.AddRange(new Control[] {
                grpInput, btnRefresh, dgvPersons, lblStatus
            });

            this.ResumeLayout(false);
        }

        private async void InitializeDatabase()
        {
            lblStatus.Text = "데이터베이스 연결 중...";
            lblStatus.ForeColor = Color.Orange;

            try
            {
                // 테이블 생성
                bool tableCreated = await _databaseService.CreateTableIfNotExistsAsync();
                if (!tableCreated)
                {
                    lblStatus.Text = "데이터베이스 연결 실패!";
                    lblStatus.ForeColor = Color.Red;
                    MessageBox.Show("데이터베이스 연결에 실패했습니다. 연결 설정을 확인해주세요.", "오류", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 데이터 로드
                await LoadPersonsAsync();
                lblStatus.Text = "데이터베이스 연결 성공!";
                lblStatus.ForeColor = Color.Green;
            }
            catch (Exception ex)
            {
                lblStatus.Text = "오류 발생: " + ex.Message;
                lblStatus.ForeColor = Color.Red;
                MessageBox.Show($"오류가 발생했습니다: {ex.Message}", "오류", 
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
                MessageBox.Show($"데이터 로드 중 오류가 발생했습니다: {ex.Message}", "오류", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RefreshDataGridView()
        {
            dgvPersons.DataSource = null;
            dgvPersons.DataSource = _persons.Select(p => new
            {
                ID = p.Id,
                이름 = p.Name,
                나이 = p.Age,
                이메일 = p.Email,
                전화번호 = p.Phone,
                주소 = p.Address,
                등록일 = p.CreatedDate.ToString("yyyy-MM-dd HH:mm")
            }).ToList();

            if (dgvPersons.Columns.Count > 0)
            {
                dgvPersons.Columns[0].Width = 50; // ID 컬럼 너비 조정
                dgvPersons.Columns[1].Width = 80; // 이름 컬럼 너비 조정
                dgvPersons.Columns[2].Width = 50; // 나이 컬럼 너비 조정
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
                MessageBox.Show("이름을 입력해주세요.", "입력 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtName.Focus();
                return false;
            }

            if (numAge.Value <= 0)
            {
                MessageBox.Show("올바른 나이를 입력해주세요.", "입력 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
                    MessageBox.Show("사람 정보가 성공적으로 저장되었습니다.", "저장 완료", 
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    ClearInputFields();
                    await LoadPersonsAsync();
                    lblStatus.Text = "새로운 정보가 저장되었습니다.";
                    lblStatus.ForeColor = Color.Green;
                }
                else
                {
                    MessageBox.Show("저장 중 오류가 발생했습니다.", "저장 실패", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"저장 중 오류가 발생했습니다: {ex.Message}", "오류", 
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
                    MessageBox.Show("사람 정보가 성공적으로 수정되었습니다.", "수정 완료", 
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    ClearInputFields();
                    await LoadPersonsAsync();
                    lblStatus.Text = "정보가 수정되었습니다.";
                    lblStatus.ForeColor = Color.Green;
                }
                else
                {
                    MessageBox.Show("수정 중 오류가 발생했습니다.", "수정 실패", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"수정 중 오류가 발생했습니다: {ex.Message}", "오류", 
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void BtnDelete_Click(object? sender, EventArgs e)
        {
            if (_selectedPerson == null) return;

            var result = MessageBox.Show($"'{_selectedPerson.Name}'님의 정보를 삭제하시겠습니까?", "삭제 확인", 
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (result == DialogResult.Yes)
            {
                try
                {
                    bool success = await _databaseService.DeletePersonAsync(_selectedPerson.Id);

                    if (success)
                    {
                        MessageBox.Show("사람 정보가 성공적으로 삭제되었습니다.", "삭제 완료", 
                            MessageBoxButtons.OK, MessageBoxIcon.Information);
                        ClearInputFields();
                        await LoadPersonsAsync();
                        lblStatus.Text = "정보가 삭제되었습니다.";
                        lblStatus.ForeColor = Color.Green;
                    }
                    else
                    {
                        MessageBox.Show("삭제 중 오류가 발생했습니다.", "삭제 실패", 
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"삭제 중 오류가 발생했습니다: {ex.Message}", "오류", 
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void BtnClear_Click(object? sender, EventArgs e)
        {
            ClearInputFields();
            lblStatus.Text = "입력 필드가 지워졌습니다.";
            lblStatus.ForeColor = Color.Blue;
        }

        private async void BtnRefresh_Click(object? sender, EventArgs e)
        {
            await LoadPersonsAsync();
            lblStatus.Text = "데이터가 새로고침되었습니다.";
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
