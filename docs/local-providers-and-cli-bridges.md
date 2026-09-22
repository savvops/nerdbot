# Local providers and optional CLI bridges

## Shipped local-provider path

Nerdbot can check the documented OpenAI-compatible localhost endpoints for Ollama (`http://localhost:11434/v1`) and LM Studio (`http://localhost:1234/v1`). The check runs only after the user clicks **Check for local AI** or **Detect Ollama or LM Studio**. Chrome asks for access only to those localhost origins, and failure falls back to ordinary provider setup.

The probe requests `/models`, reports aggregate model availability, and never reads files, browser sessions, shell history, environment variables, or CLI credentials.

## CLI investigation

A Chrome extension cannot safely inspect or execute installed Codex, Gemini, Claude, or other command-line tools. Supporting them requires a separately installed bridge, preferably Chrome Native Messaging, with all of these constraints:

- explicit installation and per-provider opt-in;
- a narrow allowlist of documented commands and arguments;
- JSON messages over standard input/output—never an arbitrary shell;
- no credential-file, browser-session, hidden OAuth-token, or environment-variable extraction;
- provider-supported authentication performed by the CLI itself;
- visible health/status output and a clean uninstall path;
- no background command execution before user consent.

A local machine check found the `codex`, `gemini`, `claude`, and `ollama` executables available; LM Studio's optional `lms` CLI was not found. This confirms feasibility only. Nerdbot does not call those executables in the shipped extension.

## Recommendation

Keep Ollama and LM Studio HTTP detection as the supported local path. Treat a Native Messaging companion as a separate, auditable future product rather than adding shell access to the extension.
