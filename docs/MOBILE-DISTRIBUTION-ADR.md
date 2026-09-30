# Mobile distribution decision record

Status: **PROPOSED — awaiting owner acceptance.**

Date: 2026-09-11. Tracks [issue #33](https://github.com/mlmrx/FreeCRM/issues/33).
This is a proposed architecture and a browser verification slice, not a completed
native release. No Android/iOS shell, signing identity, device database, or store
submission is introduced by this record.

## Proposed decision

Keep the existing PWA as the baseline mobile experience. First prove its public
layout, touch, install prerequisites, and offline boundaries in real browser
engines. Consider a thin Capacitor shell only after an accepted, specific native
need and the security prerequisites below. Do not start a fully native rewrite.

Personal, business, and enterprise remain workspace profiles. Agentic CRM remains
a capability across them, not a separate app or repository. All clients must use
the same API contracts, server-derived workspace identity, authorization,
idempotency, audit, approval, receipt, and emergency-stop rules. Reuse the shared
React design system and domain logic; a native bridge must not become an alternate
privileged backend. See [the platform architecture](MULTI_EDITION_ARCHITECTURE.md).

## What exists, and what does not

The repository has a manifest, install/update prompts, responsive public and
workspace pages, and a public-only service worker. `public/sw.js` excludes
`/workspace`, `/brain`, `/today`, `/auth`, and `/api`, including child paths.
Public navigation is allowlisted; only visited eligible pages and selected public
assets may be cached. An uncached public page can show `offline.html`.

**An offline shell is not offline CRM.** The manifest starts at `/workspace`, so
opening an installed app without its server/network does not open private records.
Browser installation does not install the Node/SQLite backend on a phone. Local
device mode is an existing loopback server for one trusted operator, not phone-to-PC
pairing or permission to expose that server to a LAN. Public tour/demo fixtures are
not a replica of a private workspace. See [runtime boundaries](OPERATIONS_REFERENCE.md).

There is no native encrypted CRM replica, biometric gate, remote-wipe protocol,
signed APK/AAB/IPA, push pipeline, or app-store release in this slice. The browser
suite does not claim those capabilities.

## Options considered

This comparison is our engineering assessment, not a claim that a framework
automatically provides secure offline storage or accessibility.

| Option | Offline and accessibility | Security and maintenance | Distribution |
| --- | --- | --- | --- |
| Standards-based PWA | Current public-only fallback; private offline work would need a separate sync/conflict/security design. Reuses HTML semantics, keyboard support, zoom, and responsive CSS; test on actual devices. | One web release and existing session/tenant boundary. Browser storage is not an app-managed encrypted vault. | Browser/OS installation remains user-controlled; no signed APK or iOS package is produced. |
| Thin Capacitor shell | Reuses web UI while making selected native APIs available. A shell alone supplies neither an encrypted replica nor a sync protocol. WebView, screen reader, keyboard, safe-area, and text-size behavior need native testing. | Adds bridge/plugin, native dependency, signing, and OS-update responsibilities. Existing server-rendered Next/Vinext routes cannot simply become an offline asset folder. | Adds Android/iOS build and distribution work; stores retain their own review/account rules. |
| Fully native client | Could offer platform-specific interaction and carefully designed offline storage; neither is implemented. Separate accessibility implementations would need equivalent evidence. | Largest additional UI/client maintenance surface. Must still share API and tenant contracts rather than duplicate business/security rules. | Same signing, device, and distribution obligations; a rewrite does not remove fees or review. |

Capacitor's configuration describes `server.url` as a live-reload setting, not a
production deployment approach. The proposal therefore rejects a production shell
that merely points that setting at the website, as well as permissive navigation,
mixed-content, or cleartext exceptions. A native spike must first prove how bundled
client assets consume the unchanged authenticated API without importing server
code or secrets. [Capacitor configuration](https://capacitorjs.com/docs/config).

## Device-data and authentication gates

These are requirements for a future accepted native/offline slice, not descriptions
of implemented controls.

1. **Minimize device data first.** Keep private records out of Cache Storage,
   localStorage, service-worker responses, diagnostic logs, crash attachments, and
   notification previews. Public fixtures and non-sensitive UI preferences must
   remain distinguishable from customer content. Do not add automatic background
   replication simply because a native storage plugin is available.
2. **Encrypted at rest.** Before persisting CRM bytes on a phone, approve a bounded,
   authenticated-encryption design covering database pages, document files,
   thumbnails, temporary files, journals, backups, and indexes. Use a per-device,
   per-workspace data key; never ship a shared key or store it beside ciphertext.
   Specify retention, key rotation/recovery, interrupted writes, and deletion tests.
   Exclude protected stores from uncontrolled OS backup/restore. Require device
   lock and fail closed when required key protection is unavailable.
3. **Key protection.** Evaluate Android Keystore and iOS Keychain-backed key wrapping
   with explicit lock/unlock accessibility. Hardware support varies; verify the
   selected protection on supported devices instead of claiming all phones provide
   identical hardware guarantees. Android can restrict a key's use to a fresh
   credential/biometric authentication, and biometric enrollment can invalidate
   keys. Recovery and loss handling must be designed, not silently downgraded.
   [Android Keystore](https://developer.android.com/privacy-and-security/keystore),
   [Apple Keychain](https://developer.apple.com/documentation/security/keychain-services).
4. **Session expiry.** Preserve server authority. Current Vercel sessions are bounded
   by the eight-hour configuration in `server/vercel-auth.ts`; Cloudflare verifies
   Access JWT expiry. Neither is a native device token. A future shell needs an
   independently reviewed system-browser authentication/pairing flow, short-lived
   scoped credentials, revocation, and reauthentication. Never copy browser cookies,
   embed provider credentials, accept client-selected workspace IDs, or weaken
   CSRF/CORS to make a WebView work. On logout, expiry, workspace switch, or 401/403,
   lock the private UI and clear in-memory views; offline access cannot extend
   server permission. Any offline lease policy is a separate owner decision.
5. **Biometric gate.** Treat a biometric prompt as local permission to unlock a
   protected key, not identity proof to the CRM server, tenant authorization, or
   approval of an agent action. Do not store biometric templates. Define passcode
   fallback, enrollment changes, lockout, background timeout, and device compromise
   behavior. Sensitive actions still use normal online policy checks.
   [Apple Local Authentication](https://developer.apple.com/documentation/localauthentication).

Capacitor itself advises avoiding embedded secrets, protecting persisted tokens
with platform key stores, using HTTPS, and guarding authentication/deep-link flows.
Selecting it does not implement these controls for FREE CRM.
[Capacitor security guidance](https://capacitorjs.com/docs/guides/security).

## Deep links, exports, and lost devices

- **Deep links:** Prefer verified HTTPS App Links/Universal Links for approved
  deployments. Android verification associates an app with a domain; it does not
  authorize the linked record. Validate scheme, exact origin, allowed route,
  length, encoding, and record identifier. Reject credentials, protocol-relative
  URLs, open redirects, arbitrary JavaScript, and untrusted custom-scheme payloads.
  Authenticate before resolving a private record and re-check tenant ownership on
  the server. Never carry a bearer token or customer payload in a link. A future
  OAuth flow must bind state and PKCE to the initiating device/session; opening a
  link never approves or executes an action.
  [Android verified links](https://developer.android.com/training/app-links/verify-applinks).
- **Exports and share sheets:** Keep export permission independent of read access.
  Show format, scope, and destination before an explicit share/download. Create
  bounded temporary files, clean them after use and on restart, and keep contents
  out of logs/clipboard by default. A destination app receives a separate copy;
  the CRM cannot promise to retract it. Portable JSON is still not a full backup:
  see [export limitations](OPERATIONS_REFERENCE.md#backups-and-exports).
- **Remote wipe:** Server credential revocation can stop future accepted requests;
  it cannot guarantee immediate deletion from an offline, powered-off, rooted, or
  compromised device. No wipe service exists today. A future app may erase its
  keys/data after receiving a verified revocation, but must report requested,
  delivered, and acknowledged states separately. It cannot erase exports,
  screenshots, OS backups, another app's copy, or data already observed. Device
  management services would be a separate deployment choice, not a built-in claim.
- **Native permissions:** Camera, notifications, file access, and share targets
  need a concrete use case, just-in-time consent, denied-permission behavior, and
  tests. Notification bodies should be generic; opening one still requires auth.
  No analytics SDK or background contact upload is part of this proposal.

## Distribution and costs

Browser installation remains subject to platform behavior and user confirmation.
Manifest validity is only one prerequisite; Chrome install promotion also depends
on engagement and browser state. The automated matrix therefore checks actual
manifest parsing/icon decoding without fabricating an install-prompt event or
claiming an OS installation. [Chrome's published criteria](https://web.dev/articles/install-criteria).

The source and a future APK download can be offered at no charge. That does not
make distribution infrastructure, domains, signing operations, cloud hosting, or
developer accounts cost-free. As checked on this record's date, Google documents a
US$25 one-time Play Console registration fee; Apple lists US$99 per membership
year, with regional pricing and possible eligibility exceptions. These are dated
provider terms, not permanent promises. Native iOS distribution needs the owner's
eligible identity, certificates, provisioning, and release process; no free iOS
App Store package is promised. [Google enrollment](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en),
[Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment).

Android sideloading is not an unconditional worldwide workaround for distribution
rules. Google's current developer-verification and distribution programs include
their own scope, eligibility, and limits. Re-check them for intended regions and
devices before release. No sideloadable artifact is produced by this proposal.
[Android distribution options](https://support.google.com/android-developer-console/answer/16640817?hl=en).

## Proposed Android release and rollback protocol

After owner acceptance and an implemented/tested shell, not before:

1. Build from a reviewed commit using pinned Node, npm lockfile, JDK, Android SDK,
   Gradle wrapper, and dependency verification. Run all existing web security,
   lint, type, coverage, agent-safety, database/drift, both target builds, smoke,
   and mobile gates. Add native unit/instrumented tests and real-device checks.
2. Produce an unsigned candidate in an unprivileged GitHub Actions job. Record
   source SHA, dependency/toolchain versions, build instructions, SBOM, checksums,
   and provenance. Build twice in clean environments and compare the unsigned
   payload before calling it reproducible; generated timestamps and signing
   differences must be documented. A workflow file alone is not evidence.
3. A protected, explicitly approved signing job obtains user-owned signing material
   from protected secrets/key infrastructure. Never run it on untrusted PR code;
   never commit or print keys. Verify the signed APK, certificate fingerprint, and
   package/version identity. Android updates rely on signing continuity; debug
   certificates are not release identities.
   [Android app signing](https://developer.android.com/studio/publish/app-signing).
4. Publish only after approval, with checksums, provenance, minimum supported
   OS/WebView/backend versions, and a sideload guide that verifies the source and
   signature and explains the OS confirmation. Keep store submission separate.
   Do not deploy the server or migrate a database as a side effect of publishing
   a mobile artifact.
5. Roll out gradually; retain reviewed artifacts and a server compatibility window.
   A mobile rollback normally ships reviewed previous code in a newer signed
   version, because platform downgrade behavior is constrained. Never bypass
   signature checks or wipe customer data to force a downgrade. Forward-only
   migrations need explicit compatibility/recovery; code rollback is not database
   rollback. An incompatible client must show an update requirement, not relax
   security checks. Keep emergency stop and server revocation authoritative.
6. Web/service-worker releases keep the same gates. Public caches are disposable;
   private offline caches remain prohibited. A native live-update mechanism, if
   ever proposed, needs separate signature, rollback, and store-policy review.

## Acceptance still required

- Owner acceptance of PWA-first scope and the intended concrete native benefit.
- Decision on whether private offline CRM is needed at all; if yes, a complete
  encrypted-storage/sync/conflict/revocation design and recovery tests.
- Reviewed native authentication/pairing and deployment-origin configuration.
- Owner-selected package identity, support matrix, distribution regions, signing
  custody, and developer accounts. Do not request secrets in an issue or chat.
- Native implementation, reproducible Android build evidence, signed artifacts,
  sideload validation, real Android/iPhone/iPad accessibility/install/session tests,
  and approved release/rollback drills.

The [automated browser matrix](MOBILE-BROWSER-MATRIX.md) is a useful first gate,
not owner acceptance or completion of issue #33.
