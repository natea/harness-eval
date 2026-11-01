# Fix broken docstring-consistency test - it reveals mismatches in parameter docs

_Opened by @Aniketsy_

There's a test  `test_docstring_consistent_parameters` that's supposed to check that shared parameters (like store, filters, chunks, etc.) are documented the same way across different functions (create, create_array, create_group, Group.create_array).

> Turns out the test had a bug and was never actually running its check, it always passed no matter what, even if the docs didn't match. after fixing this

Now that it actually runs, it fails, because the docs really are inconsistent in places:

- Real problem: Parameters like `filters`, `codecs`, `compressors`, `chunks`, `shape`, `dtype`, `shards`, fill_value are worded differently depending on which function you look at (`create/create_array` vs `Group.create_array`).
- Smaller issue: store and path are checked together, but not every function has both, this may just need the test itself to check them separately instead of as a pair.   ( suggested by ai)

I've  marked the test `xfail` in #4224 for now so it doesn't block CI, but opening this issue to track fixing the actual docs (and possibly refining the test) so it can be un-marked later.
