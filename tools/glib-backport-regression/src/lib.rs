//! Actual-crate regression for the local RUSTSEC-2024-0429 backport.
//! Run with `cargo test --locked --release`; optimizations expose the original UB.

#[cfg(test)]
mod tests {
    use glib::{variant::ToVariant, Variant};

    fn strings(values: &[&str]) -> Variant {
        Variant::array_from_iter::<String>(values.iter().map(|value| value.to_variant()))
    }

    #[test]
    fn regression_requires_optimized_profile() {
        assert!(
            !cfg!(debug_assertions),
            "Run the security regression with --release: the original defect depends on optimizations"
        );
    }

    #[test]
    fn next_preserves_empty_and_unicode_strings() {
        let value = strings(&["alpha", "", "βeta", "日本語", "🎚️"]);
        let mut iter = value.array_iter_str().unwrap();
        assert_eq!(iter.len(), 5);
        assert_eq!(iter.next(), Some("alpha"));
        assert_eq!(iter.collect::<Vec<_>>(), ["", "βeta", "日本語", "🎚️"]);
    }

    #[test]
    fn next_back_reads_the_actual_glib_out_argument() {
        let value = strings(&["first", "", "βeta"]);
        let mut iter = value.array_iter_str().unwrap();
        assert_eq!(iter.next_back(), Some("βeta"));
        assert_eq!(iter.next_back(), Some(""));
        assert_eq!(iter.next_back(), Some("first"));
        assert_eq!(iter.next_back(), None);
        assert_eq!(iter.next(), None);
    }

    #[test]
    fn nth_nth_back_and_last_read_the_selected_crate() {
        let value = strings(&["zero", "one", "two", "three"]);
        assert_eq!(value.array_iter_str().unwrap().nth(2), Some("two"));
        assert_eq!(value.array_iter_str().unwrap().nth_back(2), Some("one"));
        assert_eq!(value.array_iter_str().unwrap().last(), Some("three"));
    }

    #[test]
    fn interleaved_ends_exhaust_without_repeating_values() {
        let value = strings(&["zero", "one", "two", "three"]);
        let mut iter = value.array_iter_str().unwrap();
        assert_eq!(iter.next_back(), Some("three"));
        assert_eq!(iter.next(), Some("zero"));
        assert_eq!(iter.nth_back(0), Some("two"));
        assert_eq!(iter.last(), Some("one"));

        let mut iter = value.array_iter_str().unwrap();
        assert_eq!(iter.nth(1), Some("one"));
        assert_eq!(iter.nth_back(1), Some("two"));
        assert_eq!(iter.len(), 0);
        assert_eq!(iter.next(), None);
        assert_eq!(iter.next_back(), None);
    }

    #[test]
    fn empty_and_out_of_range_iterators_are_fused() {
        let empty = strings(&[]);
        assert_eq!(empty.array_iter_str().unwrap().next(), None);
        assert_eq!(empty.array_iter_str().unwrap().next_back(), None);
        assert_eq!(empty.array_iter_str().unwrap().last(), None);

        let value = strings(&["one"]);
        for backwards in [false, true] {
            let mut iter = value.array_iter_str().unwrap();
            assert_eq!(
                if backwards {
                    iter.nth_back(usize::MAX)
                } else {
                    iter.nth(usize::MAX)
                },
                None
            );
            assert_eq!(iter.len(), 0);
            assert_eq!(iter.next(), None);
            assert_eq!(iter.next_back(), None);
        }
    }
}
