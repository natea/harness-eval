# Regression in 3.3.0: numpy integer chunk sizes raise TypeError: 'numpy.int64' object is not iterable

_Opened by @ieivanov_

## Description

Since 3.3.0, passing a chunk size as a numpy integer raises a `TypeError`. This worked in 3.2.1 and earlier.

The cause is a disagreement between two functions in `src/zarr/core/chunk_grids.py` about what counts as an integer:

- `normalize_chunks_nd` (line 790) tests `isinstance(chunks, numbers.Integral)`
- `normalize_chunks_1d` (line 734) tests `isinstance(chunks, int)`

`np.int64` registers as `numbers.Integral` but is **not** a subclass of `int`. So a per-dimension numpy integer passes the outer dispatch, reaches `normalize_chunks_1d`, fails the `isinstance(chunks, int)` narrowing, and falls into the `else` branch intended for explicit per-dimension chunk sequences — where `list(chunks)` is called on a scalar.

Both lines are still present on `main` (bd3e3986).

## Reproduction

```python
import numpy as np
import zarr

zarr.zeros((4, 4), dtype="f4", chunks=(np.int64(2), np.int64(2)))
```

```
File "zarr/core/chunk_grids.py", line 742, in normalize_chunks_1d
    chunk_list = list(chunks)
                 ^^^^^^^^^^^^
TypeError: 'numpy.int64' object is not iterable
```

Mixed tuples fail the same way, and only on the numpy-typed entries — `(1, 3, np.int64(16), np.int64(16))` raises, `(1, 3, 16, 16)` does not.

## Version info

- zarr 3.3.0 (fails); 3.2.1 (works)
- numpy 2.5.2
- Python 3.12, Linux

Introduced by #3899 (`refactor: simplify internal chunk representation`), which landed in 3.3.0.

## Why this matters in practice

Numpy integers arise naturally whenever a chunk shape is *computed* rather than written as a literal, since any numpy reduction or elementwise op yields numpy scalars. For example, a downstream library sizing chunks from the array shape:

```python
plane_shape = np.minimum(shape[-2:], 32768)   # numpy array
chunks = (1, depth, *plane_shape)             # trailing entries are np.int64
```

This is what we hit: [ultrack](https://github.com/royerlab/ultrack)'s `large_chunk_size` builds its chunk tuple this way and passes it to `zarr.zeros`, so every array-creation call through it broke on 3.3.0. We are currently pinned to `zarr<3.3` as a workaround.

Because the failure is a `TypeError` about iteration deep inside chunk-grid code, it is quite hard to trace back to "your chunk sizes are numpy integers" — the error names neither chunks nor the offending value.

## Suggested fix

Widen the narrowing in `normalize_chunks_1d` to match its caller:

```diff
-    if isinstance(chunks, int):
+    if isinstance(chunks, numbers.Integral):
+        chunks = int(chunks)
```

This is consistent with the rest of the module: `guess_chunks` already ends with `return tuple(int(x) for x in chunks)`, and the `else` branch already accepts `numbers.Integral` elements and coerces them with `int(c)`. Only the scalar path is strict.

Happy to open a PR with the fix plus a regression test covering numpy scalar chunk sizes, if that would be useful.
