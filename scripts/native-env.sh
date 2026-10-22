# Source this file from Bash to use this suite's native tools.
task_suite_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export RUSTUP_HOME="$task_suite_root/.toolchains/rustup"
export CARGO_HOME="$task_suite_root/.toolchains/cargo"
export PATH="$CARGO_HOME/bin:$task_suite_root/.toolchains/bin:$task_suite_root/.toolchains/solana-release/bin:$PATH"
