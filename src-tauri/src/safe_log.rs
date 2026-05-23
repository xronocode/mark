// Panic-safe stderr logging. eprintln! panics on EPIPE (broken pipe),
// which causes a double-panic abort when hit inside the panic hook path.
macro_rules! safe_eprintln {
    ($($arg:tt)*) => {{
        use std::io::Write;
        let mut err = std::io::stderr().lock();
        let _ = writeln!(err, $($arg)*);
    }};
}
