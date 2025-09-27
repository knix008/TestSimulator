using MySqlConnector;

namespace PersonInfoApp
{
    public class DatabaseService
    {
        private readonly string _connectionString;

        public DatabaseService()
        {
            // MariaDB 연결 문자열 (사용자가 실제 설정에 맞게 수정해야 함)
            _connectionString = "Server=localhost;Port=3306;Database=PersonInfoDB;Uid=root;Pwd=cybo008;";
        }

        public async Task<bool> TestConnectionAsync()
        {
            try
            {
                using var connection = new MySqlConnection(_connectionString);
                await connection.OpenAsync();
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<bool> CreateTableIfNotExistsAsync()
        {
            try
            {
                using var connection = new MySqlConnection(_connectionString);
                await connection.OpenAsync();

                var createTableQuery = @"
                    CREATE TABLE IF NOT EXISTS Persons (
                        Id INT AUTO_INCREMENT PRIMARY KEY,
                        Name VARCHAR(100) NOT NULL,
                        Age INT NOT NULL,
                        Email VARCHAR(255),
                        Phone VARCHAR(20),
                        Address TEXT,
                        CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP
                    )";

                using var command = new MySqlCommand(createTableQuery, connection);
                await command.ExecuteNonQueryAsync();
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<bool> InsertPersonAsync(Person person)
        {
            try
            {
                using var connection = new MySqlConnection(_connectionString);
                await connection.OpenAsync();

                var insertQuery = @"
                    INSERT INTO Persons (Name, Age, Email, Phone, Address, CreatedDate)
                    VALUES (@Name, @Age, @Email, @Phone, @Address, @CreatedDate)";

                using var command = new MySqlCommand(insertQuery, connection);
                command.Parameters.AddWithValue("@Name", person.Name);
                command.Parameters.AddWithValue("@Age", person.Age);
                command.Parameters.AddWithValue("@Email", person.Email);
                command.Parameters.AddWithValue("@Phone", person.Phone);
                command.Parameters.AddWithValue("@Address", person.Address);
                command.Parameters.AddWithValue("@CreatedDate", person.CreatedDate);

                await command.ExecuteNonQueryAsync();
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<List<Person>> GetAllPersonsAsync()
        {
            var persons = new List<Person>();

            try
            {
                using var connection = new MySqlConnection(_connectionString);
                await connection.OpenAsync();

                var selectQuery = "SELECT * FROM Persons ORDER BY CreatedDate DESC";

                using var command = new MySqlCommand(selectQuery, connection);
                using var reader = await command.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    persons.Add(new Person
                    {
                        Id = reader.GetInt32("Id"),
                        Name = reader.GetString("Name"),
                        Age = reader.GetInt32("Age"),
                        Email = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                        Phone = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                        Address = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                        CreatedDate = reader.GetDateTime("CreatedDate")
                    });
                }
            }
            catch (Exception)
            {
                // 에러 발생 시 빈 리스트 반환
            }

            return persons;
        }

        public async Task<bool> UpdatePersonAsync(Person person)
        {
            try
            {
                using var connection = new MySqlConnection(_connectionString);
                await connection.OpenAsync();

                var updateQuery = @"
                    UPDATE Persons 
                    SET Name = @Name, Age = @Age, Email = @Email, Phone = @Phone, Address = @Address
                    WHERE Id = @Id";

                using var command = new MySqlCommand(updateQuery, connection);
                command.Parameters.AddWithValue("@Id", person.Id);
                command.Parameters.AddWithValue("@Name", person.Name);
                command.Parameters.AddWithValue("@Age", person.Age);
                command.Parameters.AddWithValue("@Email", person.Email);
                command.Parameters.AddWithValue("@Phone", person.Phone);
                command.Parameters.AddWithValue("@Address", person.Address);

                await command.ExecuteNonQueryAsync();
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<bool> DeletePersonAsync(int id)
        {
            try
            {
                using var connection = new MySqlConnection(_connectionString);
                await connection.OpenAsync();

                var deleteQuery = "DELETE FROM Persons WHERE Id = @Id";

                using var command = new MySqlCommand(deleteQuery, connection);
                command.Parameters.AddWithValue("@Id", id);

                await command.ExecuteNonQueryAsync();
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }
}
