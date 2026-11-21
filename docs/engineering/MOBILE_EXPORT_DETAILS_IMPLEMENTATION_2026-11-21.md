# Mobile export details follow-up

Fresh static review recorded [issue #80](https://github.com/djshellshoxxx/deckchek/issues/80):
the open panel captured export text/File/action values before edited nickname
or serial settings changed. A truthy fallback could reintroduce a saved result's
old identifier after the visible field was cleared.

This later candidate makes visible export fields authoritative, including blanks.
It refreshes the open panel on changed input/change events, invalidating old text,
action closures and visible QR data. Redundant change after input does not remount
an action button during a tap. The settings fields remain outside the replaced
panel and keep focus. Clear-field behavior is explained beside them. Saved results,
measurement values, original hints, redaction policy, limits and formats stay intact.

Four real-screen DOM cases exercise all four export actions, current checksum,
focus, redundant blur/change, saved-record immutability, QR refresh, redaction and
explicit blanks. File/share/clipboard boundaries are in-memory doubles. Hosted
PWA smoke replaces the always-true nickname assertion and checks serial editing,
clearing and downloaded/displayed parity. These checks are authored, not yet run.

Fresh round-seven code and security review also found that readable old storage
can win over the store's memory fallback after a denied preference write. The
screen now keeps its current export settings locally, including redaction, and
uses storage only to initialize and attempt to persist preferences. An actual-
screen regression retains a readable old record while rejecting writes and
checks every export action against the edited visible values. Focus checks also
require the original editor to remain connected and selected by the live screen.
The shared storage module and saved measurement records are unchanged.

This candidate is separate from fixed PR #79 and round-six frozen09c9afc. A fresh
trio must review it; its sole functional worker must generate the official Mobile
cache stamp and preserve first outcomes. Hosted/native and physical qualification
remain separate. No deployment or additional permission is added.
