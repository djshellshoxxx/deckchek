# Mobile route and empty-error corrections

Issue #78 identifies inherited registry names reaching Mobile screen dispatch.
The actual registry/parser now share pure `mobile/lib/routes.js`; own-key
membership preserves the five screens, Speed fallback, hash prefixes and first
ID segment. The shell preserves its `parseHash` export and same lazy targets.
Tests import the real parser without booting the shell or extracting code.
Two authored hosted PWA checks navigate to unsupported names from Strobe.

The fresh code reviewer also found empty History/ Ledger errors could be falsy.
History now checks an explicit null marker; Ledger supplies a nonempty fallback.
Four real-screen regressions cover empty Error and empty-string rejection.
The earlier round-five source and its 130/130 result remain unchanged.

The sole functional worker must generate the service-worker stamp using the
existing `tools/build-mobile.mjs` command. Root and static peers verify its
expected generated delta before freezing the complete source for the first
full gate. No deployment, permission, route decoding, asynchronous-load fallback,
audio measurement change or vulnerable-baseline execution is included.
Hosted rendering and physical qualification remain separate.
