using Microsoft.Data.Sqlite;
using System.Data;
using System.Data.Common;

namespace VixReaderTest01.Data
{
    public class SqliteDataAdapter : DbDataAdapter
    {
        public new SqliteCommand? SelectCommand { get; set; }

        public SqliteDataAdapter()
        {
        }

        public SqliteDataAdapter(SqliteCommand selectCommand)
        {
            SelectCommand = selectCommand;
        }

        public new int Fill(DataTable dataTable)
        {
            if (SelectCommand == null)
                throw new InvalidOperationException("SelectCommand is not set.");

            using var reader = SelectCommand.ExecuteReader();
            dataTable.Load(reader);
            return dataTable.Rows.Count;
        }
    }
}