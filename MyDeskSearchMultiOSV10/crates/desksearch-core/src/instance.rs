use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::time::Duration;

const LOCK_NAME: &str = "instance.lock";
const PORT_NAME: &str = "instance.port";
const SHOW: &[u8] = b"SHOW\n";

pub struct InstanceLock {
    listener: TcpListener,
    _file: fs::File,
    port_file: PathBuf,
}

#[derive(Debug)]
pub enum AcquireError {
    AlreadyRunning,
    Io(std::io::Error),
}

impl From<std::io::Error> for AcquireError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl InstanceLock {
    pub fn acquire(dir: &Path) -> Result<Self, AcquireError> {
        fs::create_dir_all(dir)?;
        let lock_path = dir.join(LOCK_NAME);
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)?;
        match file.try_lock() {
            Ok(()) => {}
            Err(std::fs::TryLockError::WouldBlock) => return Err(AcquireError::AlreadyRunning),
            Err(std::fs::TryLockError::Error(error)) => return Err(AcquireError::Io(error)),
        }
        let listener = TcpListener::bind("127.0.0.1:0")?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let port_file = dir.join(PORT_NAME);
        fs::write(&port_file, port.to_string())?;
        Ok(Self {
            listener,
            _file: file,
            port_file,
        })
    }

    pub fn poll_show(&self) -> bool {
        match self.listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
                let mut buf = [0_u8; 8];
                let _ = stream.read(&mut buf);
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => false,
            Err(_) => false,
        }
    }
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.port_file);
    }
}

pub fn notify_existing(dir: &Path) -> std::io::Result<()> {
    let port_text = fs::read_to_string(dir.join(PORT_NAME))?;
    let port: u16 = port_text
        .trim()
        .parse()
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    let mut stream = TcpStream::connect(("127.0.0.1", port))?;
    stream.write_all(SHOW)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_process_signals_the_running_instance() {
        let dir = tempfile::tempdir().unwrap();
        let first = InstanceLock::acquire(dir.path()).unwrap();
        assert!(matches!(
            InstanceLock::acquire(dir.path()),
            Err(AcquireError::AlreadyRunning)
        ));
        notify_existing(dir.path()).unwrap();
        assert!(first.poll_show());
    }
}
