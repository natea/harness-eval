# diff raises RecursionError when n is around 1000 or more

_Opened by @jbrown9513_

### What happened?

While testing an experimental version of [Perch](https://github.com/lakeday-org/perch), we found the following and figured it was worth a report.

`DataArray.diff` and `Dataset.diff` raise `RecursionError` once `n` gets near Python's recursion limit (1000 by default). `n=900` works and `n=1000` fails.

### What did you expect to happen?

The same result `numpy.diff` gives. For 3,000 values and `n=1200`, that is 1,800 values.

### Minimal Complete Verifiable Example

```Python
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "xarray[complete]@git+https://github.com/pydata/xarray.git@main",
# ]
# ///
#
# This script automatically imports the development branch of xarray to check for issues.
# Please delete this header if you have _not_ tested this script with `uv run`!

import numpy as np
import xarray as xr

xr.show_versions()

values = np.arange(3000.0) ** 2
da = xr.DataArray(values, dims="x")

print(np.diff(values, n=1200).shape)  # (1800,)
print(da.diff("x", n=900).shape)      # (2100,)
da.diff("x", n=1200)                  # RecursionError
```

### Steps to reproduce

Save the example as `issue.py` and run `uv run issue.py`.

### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [X] Complete example — the example is self-contained, including all data and the text of any traceback.
- [X] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [X] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
Traceback (most recent call last):
  File "issue.py", line 21, in <module>
    da.diff("x", n=1200)                  # RecursionError
    ~~~~~~~^^^^^^^^^^^^^
  File ".../site-packages/xarray/core/dataarray.py", line 5167, in diff
    ds = self._to_temp_dataset().diff(n=n, dim=dim, label=label)
  File ".../site-packages/xarray/core/dataset.py", line 8103, in diff
    return difference.diff(dim, n - 1)
           ~~~~~~~~~~~~~~~^^^^^^^^^^^^
  File ".../site-packages/xarray/core/dataset.py", line 8103, in diff
    return difference.diff(dim, n - 1)
           ~~~~~~~~~~~~~~~^^^^^^^^^^^^
  [Previous line repeated many more times]
  ...
  File ".../site-packages/xarray/core/indexing.py", line 501, in __init__
    k = as_integer_slice(k)
  File ".../site-packages/xarray/core/indexing.py", line 454, in as_integer_slice
    start = as_integer_or_none(value.start)
RecursionError: maximum recursion depth exceeded
```

### Anything else we need to know?

`Dataset.diff` handles `n > 1` by calling itself with `n - 1`, so each order of difference adds a stack frame:

```python
if n > 1:
    return difference.diff(dim, n - 1)
```

A loop doing the same thing `n` times would avoid the limit.

### Environment

<details>

```
INSTALLED VERSIONS
------------------
commit: None
python: 3.14.2 (main, Dec  9 2025, 19:29:30) [Clang 21.1.4 ]
python-bits: 64
OS: Darwin
OS-release: 25.2.0
machine: arm64
processor: arm
byteorder: little
LC_ALL: None
LANG: None
LOCALE: ('C', 'UTF-8')
libhdf5: 1.14.6
libnetcdf: 4.9.3

xarray: 2026.9.1.dev52+g07f7270ee
pandas: 3.0.6
numpy: 2.5.3
scipy: 1.18.1
netCDF4: 1.7.4
pydap: 3.5.11
h5netcdf: 1.8.1
h5py: 3.16.0
zarr: 3.4.1
cftime: 1.6.6
nc_time_axis: 1.4.1
iris: None
bottleneck: 1.6.0
dask: 2026.8.0
distributed: 2026.8.0
matplotlib: 3.11.2
cartopy: 0.26.0
seaborn: 0.13.2
numbagg: 0.9.6
fsspec: 2026.9.0
cupy: None
pint: None
sparse: 0.19.2
flox: 0.11.2
numpy_groupies: 0.13.0
setuptools: None
pip: None
conda: None
pytest: None
mypy: None
IPython: None
sphinx: None
```

</details>
