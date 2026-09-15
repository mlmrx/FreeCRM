# Automated mobile browser matrix

This suite tests the existing web application, not a native Android/iOS client.
Use it with the [PROPOSED mobile decision record](MOBILE-DISTRIBUTION-ADR.md).
The [manual public UX matrix](PUBLIC_UX_TEST_MATRIX.md) remains relevant.

## Run against the isolated test Worker

The runner deliberately has no `webServer` launcher, deployment step, migration
step, production URL default, authenticated browser profile, or saved session.
Supply a disposable test Worker already running on a literal loopback address.
CI's existing smoke-test Worker listens on port 3481 and uses only synthetic data.
Do not point this suite at an owner's local database or a production account.

Pinned tooling: `@playwright/test` 1.63.0, including its matching browser builds.
Install from the repository lockfile, then install the test engines:

```sh
npm ci
npx playwright install --with-deps chromium webkit
FREE_CRM_BROWSER_BASE_URL=http://127.0.0.1:3481 npm run test:mobile
```

PowerShell, after that isolated server has been started separately:

```powershell
$env:FREE_CRM_BROWSER_BASE_URL = 'http://127.0.0.1:3481'
npm run test:mobile
```

The script maps to `playwright test --config playwright.mobile.config.ts`.
The base URL must be an HTTP origin with an explicit port and the literal host
`127.0.0.1` or `[::1]`; credentials, paths, queries, fragments, DNS names, and remote
hosts are rejected. This localhost exception is for tests, not a production TLS
policy. Run a specific project with
`npx playwright test --config playwright.mobile.config.ts --project=chromium-pwa`.

In GitHub Actions, run browser installation and this suite after the existing
`smoke:api` step, with the separate `FREE_CRM_BROWSER_BASE_URL` environment
variable. Keep every existing verification/deployment approval gate. Browser
installation adds downloads and may require OS libraries; failure is not a pass.

## Evidence produced by the tests

| Project | Engine and viewport | Automated evidence |
| --- | --- | --- |
| `chromium-small-320` | Chromium, 320 × 740, touch | Public layout, interaction, key touch targets, keyboard focus, reduced motion |
| `chromium-phone-390` | Chromium, 390 × 844, touch | Same checks at a larger phone width |
| `webkit-phone-390` | WebKit, 390 × 844, touch | Layout/touch/motion and controlled focus + Enter; not iPhone or first-Tab-order certification |
| `webkit-tablet-768` | WebKit, 768 × 1024, touch | Same WebKit checks at tablet width; not an iPad device test |
| `chromium-pwa` | Chromium, 390 × 844, real service worker | Manifest parsing/icons, actual Cache Storage, public offline fallback, synthetic private-route cache exclusion |

`public-mobile.spec.ts` visits landing, platform, tour, demo, glossary, Insights,
and How it works. It checks rendered headings and viewport metadata, page-level
horizontal overflow, and touch emulation. The tour checks all five audience
buttons, feature search/navigation, and reset through real browser taps. Named
controls must measure at least 44 × 44 CSS pixels. This is a selected-control
regression gate, not a claim that every target on every private screen was audited.

The glossary exercises actual first-Tab order in Chromium, visible focus, Enter
activation, skip navigation, letter anchors, and term anchors. WebKit's host
keyboard preference can omit links from Tab traversal (also reproduced on a plain
HTML fixture); there, the test explicitly focuses the skip link and then uses real
Enter. This proves controlled-focus/activation behavior, not Safari Tab order.
No OS preference is changed. Full keyboard navigation on physical Apple devices
remains a manual gate. [Upstream keyboard-preference discussion](https://github.com/microsoft/playwright/issues/5609).
Touch mode uses the actual coarse-pointer media query and real taps; WebKit can
report zero `maxTouchPoints` while touch emulation is enabled.

Landing, tour, and demo run with reduced-motion media
preferences and reject material CSS animations/transitions on rendered elements,
including pseudo-elements. Content must remain visible. This does not measure
vestibular comfort or every possible canvas/video animation.

`pwa-boundaries.spec.ts` registers the shipped worker via the shipped page lifecycle;
it does not replace its code or seed its cache. Chromium parses the linked manifest,
and the browser decodes the icon resources. Real offline mode verifies a visited
public page and an uncached public-route fallback. Private paths and child paths
receive intentionally cacheable **synthetic** network responses through browser
interception: the test confirms those responses bypass the worker, never enter
Cache Storage, and fail when the network is removed. Both navigation and fetch are
tested. No real workspace/API/auth endpoint supplies the probe body.

Playwright currently exposes its service-worker routing/inspection support on
Chromium, so PWA probes run in that project rather than silently claiming equivalent
Safari evidence. Device emulation changes browser inputs and viewport; it is not
physical-device testing. [Playwright service workers](https://playwright.dev/docs/service-workers),
[Playwright emulation](https://playwright.dev/docs/emulation).

## Safety of running the suite

- Each test uses an ephemeral browser context with no user cookies or storage.
- A network guard blocks unexpected private routes, non-GET/HEAD requests, and
  other origins. Synthetic private probes have an explicit interception; they do
  not weaken the real server or service worker.
- No record creation, authenticated exports, model calls, connector requests,
  actual installation prompts, signing, or deployment is performed.
- Screenshots, video, and traces are off, including on failure. The line reporter
  logs assertions without response bodies or credentials. Generated runner output
  stays in the ignored `outputs/mobile-browser-results` folder.
- Tests run serially with zero retries so a failing privacy/layout assertion is
  visible. Missing engines or an unavailable server must fail rather than skip.

## Claims deliberately not made

A valid manifest and working worker do not prove an OS installed the app. Browser
promotion can depend on user engagement and platform policy; the tests do not fake
`beforeinstallprompt`. [Published install criteria](https://web.dev/articles/install-criteria).

Passing this suite does not prove encrypted offline CRM, native biometric behavior,
session revocation on a lost phone, VoiceOver/TalkBack correctness, store acceptance,
signed/reproducible Android artifacts, or iOS distribution. Those remain explicit
release gates in the proposed ADR. Also perform physical-device install/open/update,
orientation, 200% text/zoom, software keyboard, safe-area, screen-reader, denied
permission, expiry/logout, and offline-start checks using synthetic accounts only.

Do not mark issue #33 complete based on this decision record and browser suite.
