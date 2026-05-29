namespace FTPServerWinV10.Server
{
    public class UserEntry
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
        public bool CanRead { get; set; } = true;
        public bool CanWrite { get; set; } = true;
    }
}
