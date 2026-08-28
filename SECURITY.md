# Security

Clover is local-first. Relationship data is stored in the browser profile where the app runs; the default build has no account system, remote database, analytics, or third-party AI calls.

## Report a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub’s private security-advisory flow on the repository that hosts your fork.

## Data safety

- Treat exported JSON and CSV files as sensitive.
- Back up before clearing browser storage or changing devices.
- Use HTTPS for any public deployment.
- A publicly hosted copy delivers the application to anyone, but each browser keeps a separate local workspace.
- Review connector code before adding email, calendar, social, or model-provider access.
