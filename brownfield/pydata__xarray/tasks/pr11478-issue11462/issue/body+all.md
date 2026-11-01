# xr.polyval returns bogus values for NaT in timedelta arrays

_Opened by @RippleTester_

### What happened?

`xr.polyval` returns a bogus value (`-1.84e+19`) for `NaT` entries in timedelta coordinate arrays, instead of propagating the missing value as `NaN`.

Output:
```
[ 1.00000000e+00 -1.84467441e+19  3.45601000e+05]
```

The NaT position gives `-1.84e+19` instead of `NaN`.

This regression was introduced by PR #6599 (https://github.com/pydata/xarray/pull/6599) and still exists in the latest version.

### What did you expect to happen?

```
[1.0, nan, 345601.0]
```

The `NaT` position should produce `NaN`, similar to how arithmetic on `NaN` propagates `NaN`.

### Minimal Complete Verifiable Example

```python
import numpy as np
import xarray as xr

offset = xr.DataArray(
    np.array([0, "NaT", 2], dtype="timedelta64[D]"),
    dims="offset",
)
coefficients = xr.DataArray(
    [2.0, 1.0],
    dims="degree",
    coords={"degree": [1, 0]},
)

result = xr.polyval(offset, coefficients)
print(result.values)
# [ 1.00000000e+00 -1.84467441e+19  3.45601000e+05]
# Expected: [1.0, nan, 345601.0]
```

### Environment

- xarray 2026.7.0
- numpy 2.4.6
- Python 3.11.13
- Linux
