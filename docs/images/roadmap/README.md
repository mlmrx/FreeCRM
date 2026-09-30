# Synthetic roadmap review captures

These are browser screenshots of the actual local Worker build, using only
disposable fictional QA records and generated identifiers. No customer data,
cloud credentials, real bucket, or production installation was used.

- [Policy editor, desktop](policy-after.png): active version and revoked-grant
  recovery state after the retained policy-editor browser smoke.
- [Audit filters, desktop](audit-after.png): bounded search and allowlisted
  events. The identifiers are generated local QA state, not user credentials.
- [Glossary, desktop](glossary-after.png): original plain-language definitions
  with current-product boundaries.
- Audit mobile fix: [before](audit-mobile-before-fix.png) and
  [after](audit-mobile-after-fix.png). Both are full-page development captures;
  fixed navigation can appear partway through a stitched screenshot. Before
  had page overflow and an unbounded event table. After uses header reflow and
  an independently scrollable bounded table. These are not a redesign mockup
  or a baseline-main comparison: the audit panel is new in this milestone.

The policy panel and glossary are also new, so there is no equivalent earlier
screen to compare. Test results, not screenshots, establish keyboard, mobile
reflow, focus, read-only behavior, and recovery correctness. Reproduce those
with `smoke:policy-editor`, `smoke:audit-viewer`, and `test:mobile` against
explicitly acknowledged isolated synthetic state; never an owner's database.
