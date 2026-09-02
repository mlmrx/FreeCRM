# Public UX verification matrix

This matrix uses only the public, synthetic experience. Never place customer data,
provider identifiers, cookies, request headers, environment values, or credentials
in a screenshot or accessibility report.

| View | Width / condition | Expected result |
| --- | --- | --- |
| Landing | 320 px and 375 px | Navigation scrolls horizontally with 44 px targets; the title, eagle lockup, and actions remain inside the viewport. |
| Platform | 320 px, 375 px, and 768 px | All five persona cards reflow into one reading column; capability and current-boundary copy remains visible. |
| Product tour | 320 px, 375 px, and 768 px | Tour tabs are keyboard reachable and horizontally scrollable; synthetic cards and agent receipt do not create page-level overflow. |
| Workspace | 320 px, 375 px, and 768 px | Menu, filters, row actions, and pipeline actions meet the 44 px touch target; tables and pipeline use labelled horizontal regions. |
| Insights, article, contribute | 320 px through 200% zoom | Content reflows without page-level horizontal scrolling; long source names wrap; the first keyboard action is a visible skip link. |
| Insights FAQ | Keyboard only | Each native `summary` receives a visible focus ring and Enter/Space toggles its adjacent answer. |
| Animated pages | `prefers-reduced-motion: reduce` | Decorative animation and transitions collapse; content and controls remain present. |
| Installed app | Offline | Public cached pages may render, while workspace, authentication, and API requests remain network-only and fail closed. |

Automated regressions cover route landmarks, public-only tour data, service-worker
boundaries, manifest metadata, touch-target rules, canonical URLs, and the deployment
checklist. A release reviewer should repeat this matrix in a real browser after any
material layout, service-worker, or navigation change.
