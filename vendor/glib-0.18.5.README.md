# GLib 0.18.5 source backport

This directory accompanies the normalized crates.io GLib **0.18.5** package in
`glib-0.18.5/`. The package retains its actual version, original MIT license,
copyright notice, source metadata and registry dependency declarations. Its only
source change is the two-line official repair for **RUSTSEC-2024-0429**.

## Origin and exact change

| Item | Value |
| --- | --- |
| Registry archive | https://static.crates.io/crates/glib/glib-0.18.5.crate |
| Archive SHA256 | `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5` |
| Original archive size | 267,679 bytes; 121 regular files; 1,717,584 uncompressed bytes |
| Registry source commit | `42b9caf98e03ded086362d9653ca58fe94dc8658` in `gtk-rs/gtk-rs-core`, package path `glib` |
| Official fix | https://github.com/gtk-rs/gtk-rs-core/commit/b5a4071e439bef2b5eea76c3aa25e5ae84839e34 |
| Advisory | https://rustsec.org/advisories/RUSTSEC-2024-0429.html |
| Exact applied patch | [glib-0.18.5.patch](glib-0.18.5.patch) |
| Original-file hashes and patched-file hash | [glib-0.18.5.provenance.json](glib-0.18.5.provenance.json) |
| Original license and attribution | [LICENSE](glib-0.18.5/LICENSE), [COPYRIGHT](glib-0.18.5/COPYRIGHT) |

In `src/variant_iter.rs`, `VariantStrIter::impl_get` now declares `let mut p` and
passes `&mut p` to the variadic `g_variant_get_child` out-argument. Upstream used
an immutable reference for a pointer that GLib writes, allowing optimized Rust
to continue using a null pointer. No other upstream source or manifest is edited.

Project provenance lives outside the 121-file upstream tree. The archive hash
describes the original registry archive. It does **not** describe the patched
source; the manifest records a separate patched-file digest.

## Dependency selection and executable gates

The application and standalone fuzz Cargo roots each declare their own
`[patch.crates-io]`. Their lockfiles retain GLib 0.18.5 and correctly omit the
registry source/checksum for the local package. An isolated regression root uses
the same patch and exact version. Its lock is a subset of the application lock,
with a single new test-only root package; it does not require a second optimized
build of Tauri.

```sh
node tools/verify-glib-backport.mjs --metadata
cargo test --locked --release --manifest-path tools/glib-backport-regression/Cargo.toml -j 4
```

The source checker verifies the exact file inventory and every original digest,
the independently anchored inventory digest, the patch and patched-file digests,
and reconstruction of the original iterator by reversing exactly the two approved
edits. It rejects extra/missing files and symlinks. `--metadata` additionally
requires each Cargo root to resolve one reachable local GLib 0.18.5 package at the
reviewed manifest. The regression calls the actual crate's
`Variant::array_iter_str()` in the release profile, covering forward/reverse
iteration, indexing, `last`, mixed ends, Unicode, empty strings, empty input and
exhaustion. It never copies the iterator implementation into a test substitute.

These commands run in Linux CI after normal native prerequisites are installed.
No pkg-config metadata, native dependency checks or compiler warnings are
suppressed. Standard application test, formatting, Clippy and packaging gates
still apply. Local environments without GLib development metadata cannot execute
the full crate regression; the native build failure must remain visible.

## Advisory disposition and maintenance

GLib 0.18.5 remains in the advisory's affected version range. This is a local
source backport, not an upstream patched release. No advisory ignore or version
spoof is added. A version-only scanner can still flag 0.18.5; a scanner that skips
path sources can also omit the package. Neither scanner result proves that the
source is repaired. Retain the advisory disposition as unresolved until source
integrity, actual Cargo selection, optimized actual-crate regression and native
package gates pass on the integration commit.

Remove this patch only when the supported application **and** fuzz dependency
graphs select an upstream fixed GLib release (currently the advisory identifies
0.20.0 and later), then refresh the locks, notices and regression evidence
together. Any broader change to this vendored tree requires a separately reviewed
source/provenance update; the checker deliberately rejects incidental fixes.
