# Security Policy

## Supported Versions

Security fixes are handled on the default branch of this repository. Public releases should be built from the latest reviewed source unless a release branch is explicitly created.

## Reporting a Vulnerability

Please do not open a public issue for suspected vulnerabilities that expose credentials, private data, or account access.

Report security concerns privately by contacting the repository owner through GitHub. Include:

- A description of the issue.
- Steps to reproduce it.
- The affected browser, extension version or commit, and provider configuration.
- Any relevant logs with credentials removed.

## Sensitive Data

Do not include real provider API keys, browser profile exports, private page content, chat transcripts, or local agent transcripts in bug reports or pull requests.

## Security Model

Nerdbot stores user configuration and keys in Chrome local storage and sends prompts directly to the selected provider from the extension. Review provider settings, page context, and attachments before sending prompts that may include private data.
