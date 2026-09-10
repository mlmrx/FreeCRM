# Present FREE CRM from one shared screen

Open `/demo` on the installation containing the current platform code. The page
is public and uses only fictional examples. It does not fetch customer data,
seed a workspace, mutate records, enable learning, or send credentials.

## Before the call

1. Use a dedicated workspace containing synthetic records for live demonstrations.
2. Open **Live links** if the product runs on a different origin. Enter its HTTPS
   origin or literal loopback address, such as `http://127.0.0.1:3485`. Paths,
   credentials, query strings, and non-loopback HTTP origins are rejected.
   This changes links only, is kept only in component memory, and resets on reload.
3. Sign in to that installation in another tab. Verify `/workspace`, `/brain`, and
   `/today` are available. A link cannot bypass authentication or enable a capability.
4. If presenting AI, test your device-local Ollama setup first. Keyword source
   search works without a model. Never show provider keys or private notes.
5. Hide desktop notifications and presenter notes before screen sharing. Notes
   are on this same screen, not in a private presenter window.

## During the demo

- Use **Present** for browser fullscreen where supported. It can be rejected by
  embedded browsers; the normal page remains usable. Escape exits fullscreen.
- Left/right arrows or Page Up/Page Down change chapters. Click the numbered
  chapter rail to jump. The URL hash restores the chapter after a reload.
- The opening platform map is interactive: each node jumps to its chapter.
- Every chapter's primary action opens the real destination in a separate tab
  with no opener access. Switch back to the original tab to continue the story.
- **N** toggles a suggested narration and three concrete demonstration steps.
  Shortcuts do not capture typing in inputs or a modal dialog.
- **Feature atlas** searches all platform entries and filters by category. Use
  it to answer audience questions without losing your place in the story.
- Read the **Good to know** line. Delivery labels are deliberate: implemented,
  optional setup, guarded preview, and roadmap are not interchangeable.

Suggested 12-minute flow: The idea (1 minute), Relationships + Business (3),
Second brain + A living CRM (4), Guarded agents + Connections (2),
Ownership + Who it serves + Open forever (2). Use the atlas for Q&A.

## Boundaries that matter

Current release: single-owner. SMB is a foundation; enterprise is a preview.
Agents execute only in a local simulator. Vendor releases create reviewed
proposals, not remotely installed code. Email/calendar OAuth, native mobile
apps, an APK, SSO/SCIM, and general external autonomous agents are not shipped.
Payments are recorded rather than charged. Infrastructure can cost money even
though the software is MIT-licensed.

Workspace `?view=` links use an allowlist and the installation's capability and
module settings. A disabled or unknown destination falls back to the dashboard
with an explanation. Existing `?record=` links still take precedence. None of
these client navigation choices replaces server authorization.
