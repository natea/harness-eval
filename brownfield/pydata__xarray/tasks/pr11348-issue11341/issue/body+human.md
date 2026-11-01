# A single nested tuple MultiIndex key is located correctly but preserves the dimension

_Opened by @cfriedland5_

### What happened?

When selecting from an xarray MultiIndex that has a tuple-valued level, a nested tuple key corresponding to a single location can be located correctly, but the result keeps a length-1 dimension instead of behaving like scalar selection.

It is inconsistent that xarray correctly understands the nested tuple as a single key for lookup, but then interprets it as a sequence of keys for determining the result shape.

Selection with a MultiIndex that does not have tuple-valued levels collapses the dimension as expected.

### What did you expect to happen?

I expect the result of selection using a nested tuple, corresponding to a single position in the index, to collapse the indexed dimension.

### Minimal Complete Verifiable Example

```Python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "xarray[complete]@git+https://github.com/pydata/xarray.git@main",
# ]
# ///
#
# This script automatically imports the development branch of xarray to check for issues.
# Please delete this header if you have _not_ tested this script with `uv run`!

import xarray as xr
xr.show_versions()

import numpy as np
import pandas as pd
from xarray import Coordinates

simple_level_0 = pd.Index([1, 1, 2, 3], name="a")
simple_level_1 = pd.Index([1, 2, 10, 20], name="b")
simple_mi = pd.MultiIndex.from_arrays([simple_level_0, simple_level_1])

simple = xr.DataArray(
    np.arange(4),
    dims=("index",),
    coords={**Coordinates.from_pandas_multiindex(simple_mi, "index")},
)

nested_level_0 = pd.Index([(1, 1), (1, 1), (2, 2), (3, 3)], name="a", tupleize_cols=False)
nested_level_1 = pd.Index([1, 2, 10, 20], name="b")
nested_mi = pd.MultiIndex.from_arrays([nested_level_0, nested_level_1])

nested = xr.DataArray(
    np.arange(4),
    dims=("index",),
    coords={**Coordinates.from_pandas_multiindex(nested_mi, "index")},
)

simple_result = simple.sel(index=(1, 2))
nested_result = nested.sel(index=((1, 1), 2))

print("simple_result:", simple_result)
print("simple dims:", simple_result.dims, "shape:", simple_result.shape)
print()

print("nested_result:", nested_result)
print("nested dims:", nested_result.dims, "shape:", nested_result.shape)
print()

print("simple pandas get_loc:", simple.indexes["index"].get_loc((1, 2)))
print("nested pandas get_loc:", nested.indexes["index"].get_loc(((1, 1), 2)))
print()
```

### Steps to reproduce

- Create a DataArray using a 2-level pandas MultiIndex where one level contains tuple-valued entries
- Use `.sel()` with one full key (nested tuple)
- Observe that the result still has the associated dimension
- Compare this to a case where each level is flat and the key is a non-nested tuple, the dimension collapses

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
simple_result: <xarray.DataArray ()> Size: 8B
array(1)
Coordinates:
    index    object 8B (np.int64(1), np.int64(2))
    a        int64 8B 1
    b        int64 8B 2
simple dims: () shape: ()

nested_result: <xarray.DataArray (index: 1)> Size: 8B
array([1])
Coordinates:
  * index    (index) object 8B MultiIndex
  * a        (index) object 8B (1, 1)
  * b        (index) int64 8B 2
nested dims: ('index',) shape: (1,)

simple pandas get_loc: 1
nested pandas get_loc: 1
```

### Anything else we need to know?

Pandas appears to treat the nested tuple consistently as a single exact key, since `.get_loc()` returns a single integer location in both cases.

The discrepancy seems to be in xarray’s handling after lookup: the nested tuple is usable as a single key for locating the match, but is also treated as sequence-like for determining whether the result should preserve the dimension.

### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.12.2 | packaged by conda-forge | (main, Feb 16 2024, 20:50:58) [GCC 12.3.0]
python-bits: 64
OS: Linux
OS-release: 4.18.0-553.117.1.1toss.t4.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.14.6
libnetcdf: 4.9.3

xarray: 2026.4.1.dev8+g8bb033ceb
pandas: 3.0.3
numpy: 2.4.4
scipy: 1.17.1
netCDF4: 1.7.4
pydap: 3.5.9
h5netcdf: 1.8.1
h5py: 3.16.0
zarr: 3.2.1
cftime: 1.6.5
nc_time_axis: 1.4.1
iris: None
bottleneck: 1.6.0
dask: 2026.3.0
distributed: 2026.3.0
matplotlib: 3.10.9
cartopy: 0.25.0
seaborn: 0.13.2
numbagg: 0.9.4
fsspec: 2026.4.0
cupy: None
pint: None
sparse: 0.18.0
flox: 0.11.2
numpy_groupies: 0.11.3
setuptools: None
pip: None
conda: None
pytest: None
mypy: None
IPython: None
sphinx: None

</details>
