namespace FTPServerWinV10.Server
{
    /// <summary>로그인 세션의 파일 접근 권한.</summary>
    public readonly struct SessionPermissions
    {
        public bool CanRead { get; }
        public bool CanWrite { get; }

        public SessionPermissions(bool canRead, bool canWrite)
        {
            CanRead = canRead;
            CanWrite = canWrite;
        }

        /// <summary>익명: 읽기만 허용.</summary>
        public static SessionPermissions Anonymous => new(true, false);

        public static SessionPermissions DenyAll => new(false, false);

        public string Summary =>
            (CanRead, CanWrite) switch
            {
                (true, true)  => "읽기+쓰기",
                (true, false) => "읽기",
                (false, true) => "쓰기",
                _             => "없음"
            };
    }
}
