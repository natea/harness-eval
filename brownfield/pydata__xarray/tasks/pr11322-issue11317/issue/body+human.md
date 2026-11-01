# concat fails due to StringDtype introduced by pd.Index

_Opened by @vincentschut_

### What happened?

This used to work (a few releases of xarray and/or pandas ago):

```python
import xarray as xr
import pandas as pd

da = xr.DataArray([0], dims=["dim_a"], coords=dict(dim_a=["a"]))
db = xr.DataArray([0])
# use concat to add a new dimension with coordinate
db2 = xr.concat([db], pd.Index(["b"], name="dim_a"))
xr.concat([da, db2], dim="dim_a")  # this fails
```
But now fails with `TypeError: Cannot interpret '<StringDtype(storage='python', na_value=nan)>' as a data type` because the pd.Index apparently introduces a `StringDtype` coord, while the coord of da has dtype `<U1`.

Replacing the pd.Index with xr.Variable still works:

```python
import xarray as xr
import pandas as pd

da = xr.DataArray([0], dims=["dim_a"], coords=dict(dim_a=["a"]))
db = xr.DataArray([0])
# use concat to add a new dimension with coordinate
db3 = xr.concat([db], xr.Variable("dim_a", ["b"]))
xr.concat([da, db3], dim="dim_a")  # this succeeds
```

Not sure what the bug is here: should pd.Index use <Ux or StringDtype by default? Should xarray.DataArray, when initialized with string coordinates, use <Ux or StringDtype by default? Or should concat know how to handle mixed string types?

At least I find this current situation confusing. If this is not a bug, it might perhaps warrant mentioning this difference between pd.Index and xr.Variable in the concat docs?

### What did you expect to happen?

No exception

### Minimal Complete Verifiable Example

```Python
import xarray as xr
import pandas as pd

da = xr.DataArray([0], dims=["dim_a"], coords=dict(dim_a=["a"]))
db = xr.DataArray([0], dims=["dim_b"], coords=dict(dim_b=["b"]))
# use concat to add a new dimension with coordinate
db2 = xr.concat([db], pd.Index(["b"], name="dim_a"))
xr.concat([da, db2], dim="dim_a")  # this fails
```

### Steps to reproduce

_No response_

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python

```

### Anything else we need to know?

_No response_

### Environment

<details>
INSTALLED VERSIONS
------------------
commit: None
python: 3.12.3 (main, Mar 23 2026, 19:04:32) [GCC 13.3.0]
python-bits: 64
OS: Linux
OS-release: 6.19.12-200.fc43.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: C.UTF-8
LANG: C.UTF-8
LOCALE: ('C', 'UTF-8')
libhdf5: None
libnetcdf: None

xarray: 2026.4.0
pandas: 3.0.2
numpy: 2.4.4
scipy: 1.17.1
netCDF4: None
pydap: None
h5netcdf: None
h5py: None
zarr: 3.1.6
cftime: None
nc_time_axis: None
iris: None
bottleneck: None
dask: 2026.3.0
distributed: None
matplotlib: None
cartopy: None
seaborn: None
numbagg: None
fsspec: 2026.3.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 82.0.1
pip: 26.1
conda: None
pytest: 9.0.3
mypy: 1.20.2
IPython: 9.12.0
sphinx: 9.1.0



</details>
