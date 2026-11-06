//! Errors carry a stable code, so the interface can word them in the user's language.

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The archive needs a password and none was given.
    PasswordRequired,
    WrongPassword,
    Cancelled,
    /// Not an archive this program recognises.
    NotArchive(String),
    /// A part of a split archive is not where it should be.
    MissingVolume(String),
    /// The output already exists and overwriting was not asked for.
    Exists(String),
    /// Damaged data: bad checksum, truncated, malformed.
    Corrupt(String),
    /// A real archive using something this program cannot do.
    Unsupported(String),
    /// The options do not make sense together.
    Invalid(String),
    Io(String),
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::PasswordRequired => "password_required",
            Error::WrongPassword => "wrong_password",
            Error::Cancelled => "cancelled",
            Error::NotArchive(_) => "not_archive",
            Error::MissingVolume(_) => "missing_volume",
            Error::Exists(_) => "exists",
            Error::Corrupt(_) => "corrupt",
            Error::Unsupported(_) => "unsupported",
            Error::Invalid(_) => "invalid",
            Error::Io(_) => "io",
        }
    }

    pub fn detail(&self) -> String {
        match self {
            Error::PasswordRequired | Error::WrongPassword | Error::Cancelled => String::new(),
            Error::NotArchive(s)
            | Error::MissingVolume(s)
            | Error::Exists(s)
            | Error::Corrupt(s)
            | Error::Unsupported(s)
            | Error::Invalid(s)
            | Error::Io(s) => s.clone(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let detail = self.detail();
        if detail.is_empty() {
            write!(f, "{}", self.code())
        } else {
            write!(f, "{}: {detail}", self.code())
        }
    }
}

impl std::error::Error for Error {}

/// A marker carried through `std::io::Error`, because codecs hide their reader's errors from us.
pub(crate) const CANCEL_MARK: &str = "zipmaster-cancelled";

pub(crate) fn cancel_io() -> std::io::Error {
    std::io::Error::other(CANCEL_MARK)
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        // Codecs wrap the inner error's text, so the marker is searched for, not compared.
        let text = e.to_string();
        if text.contains(CANCEL_MARK) {
            return Error::Cancelled;
        }
        match e.kind() {
            std::io::ErrorKind::UnexpectedEof | std::io::ErrorKind::InvalidData => Error::Corrupt(text),
            _ => Error::Io(text),
        }
    }
}
