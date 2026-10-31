//! `pinehold run -- <command>`: decrypts the project's variables and starts the command with them.
pub fn run(command: &[String]) -> std::io::Result<std::process::ExitStatus> {
    let vars = crate::vault::decrypt_project_env()?;
    std::process::Command::new(&command[0]).args(&command[1..]).envs(vars).status()
}
