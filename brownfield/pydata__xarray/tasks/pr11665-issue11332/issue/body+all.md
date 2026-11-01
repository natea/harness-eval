# Extend `FillValueCoder.decode` to accept JSON-native scalars for the zarr backend

_Opened by @maxrjones_

### Is your feature request related to a problem?

`xarray.backends.zarr.FillValueCoder.decode` requires `_FillValue` attribute values on Zarr arrays to be in HDF5-style form (base64-encoded bytes for floats; specific encoded shapes for ints / strings). Zarr metadata is JSON-native, so the natural shape for any non-xarray Zarr writer is a plain JSON scalar, but that's rejected on read by xarray.

MVCE:

```python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "numpy",
#     "zarr>=3.0",
#     "xarray",
# ]
# ///
import shutil
from pathlib import Path

import numpy as np
import xarray as xr
import zarr

path = Path("test.zarr")
if path.exists():
    shutil.rmtree(path)

root = zarr.open_group(path, mode="w", zarr_format=3)
arr = root.create_array(
    "data",
    shape=(3,),
    chunks=(3,),
    dtype="float32",
    fill_value=0.0,
    dimension_names=["x"],
    attributes={"_FillValue": 0.0},
)
arr[:] = np.array([1.0, 2.0, 3.0], dtype="float32")

xr.open_zarr(path, zarr_format=3, consolidated=False).load()
# TypeError: Failed to decode fill_value: expected str or bytes for dtype float32, got float
```

The same failure shape occurs for `_FillValue: NaN`, `_FillValue: -1`, etc. Integer dtypes hit a parallel code path with the same root cause. String dtypes (`|S*`, `StringDType`, kind `O`) raise `ValueError: Failed to decode fill_value. Unsupported dtype ...`.

It's difficult to produce Xarray-compitible Zarr datasets that CF-style `_FillValue` using libraries other than Xarray.

### Describe the solution you'd like

`FillValueCoder.decode` accepts JSON-native scalars in addition to the existing base64-encoded-bytes form, per dtype kind:

```python
class FillValueCoder:
    @classmethod
    def decode(cls, value, dtype):
        if value is None:
            return None
        # New: accept JSON-native scalars directly.
        if dtype.kind in "iuf" and isinstance(value, (int, float)) and not isinstance(value, bool):
            return np.asarray(value, dtype=dtype)[()]
        if dtype.kind == "b" and isinstance(value, bool):
            return np.asarray(value, dtype=dtype)[()]
        if dtype.kind in "SU" and isinstance(value, str):
            return np.asarray(value, dtype=dtype)[()]
        # Existing: fall through to the HDF5-style base64-bytes path.
        ...
```

Decoding is the read path, so relaxing it is strictly additive. Files written by older xarray versions (base64-encoded `_FillValue`) continue to work unchanged and files written by other Zarr tools (JSON-native `_FillValue`) start to work. No existing reader behavior breaks.



### Describe alternatives you've considered

1. **Symmetric encode change.** Switch `FillValueCoder.encode` to emit JSON-native scalars on the zarr backend too. *Drawback:* older xarray versions reading newer xarray-written files would break. Probably worth doing eventually but as a separate, gated change.
2. **Vendoring `FillValueCoder` in each non-xarray producer.** Documented in places already (e.g. virtualizarr's [`custom_parsers.md`](https://virtualizarr.readthedocs.io/en/latest/custom_parsers.html)). *Drawback:* requires every Zarr writer to re-implement xarray's HDF5-style encoding; defeats the point of JSON-native metadata.
3. **Waiting for `Optional[T]` data type.** The long-term replacement for "missing data" semantics ([zarr-extensions#33](https://github.com/zarr-developers/zarr-extensions/pull/33)). *Drawback:* spec timeline; doesn't help users today.

### Additional context

User reports of this exact problem:

- [zarr-developers/VirtualiZarr#989](https://github.com/zarr-developers/VirtualiZarr/issues/989) — VirtualiZarr produces JSON-native `_FillValue: null`; xarray rejects on read.
- [zarr-developers/VirtualiZarr#485](https://github.com/zarr-developers/VirtualiZarr/issues/485) — broken xarray example notebook with the same shape of error.
- [zarr-developers/VirtualiZarr#628](https://github.com/zarr-developers/VirtualiZarr/issues/628) — `_FillValue=-1` hits the matching int-side assertion.

This limitation of the current non-Zarr-native solution was flagged by @d-v-b.


Not in scope:

- Changing `_FillValue` semantics (CF mask-and-scale vs Zarr storage default).
- The encode path (see alternative # 1).
- Compound / structured dtypes (separate issue).

---

## Discussion

**@welcome** (bot) (2026-05-11):

Thanks for opening your first issue here at xarray! Be sure to follow the issue template!
If you have an idea for a solution, we would really welcome a Pull Request with proposed changes.
See the [Contributing Guide](https://docs.xarray.dev/en/latest/contributing.html) for more.
It may take us a while to respond here, but we really value your contribution. Contributors like you help make xarray better.
Thank you!

**@keewis** (2026-05-11):

another option: allow backends to select a set of default coders (see [this zulip thread](https://ossci.zulipchat.com/#narrow/channel/582428-Xarray/topic/custom.20coders/with/594379732)), which users can customize. Similar drawbacks to option 1, but would make the entire setup much more flexible / extensible, and would avoid us getting locked into specific options to keep backwards compatibility: with custom coders it would be possible to backport / collect new coders in a separate package, which could then be used with then-older versions of xarray. This would need a good protocol for these, however.
