# load after close automatically reopens, but doesn't close everything

_Opened by @Huite_

### What happened?

Calling `.close`, then `.load` works, and keeps the file closed (so it can be overwritten or removed). However, it doesn't work if e.g. a copy is made. The file is apparently kept in an open state by the copy.

(Apologies in advance if this is a duplicate, I've searched for load and close, but it yields many many results; #4131 is topical, but is closed.)

### What did you expect to happen?

Either loading after close should raise an error (see #4131), or the file should be closed consistently, everywhere.

Currently, it's somewhat easy to accidentally end up in a situation where there's no way to close a file.
Because the first `.close()` sets the `._close` attribute to None, there doesn't seem to be a way to get it back, unless you've stored a reference to it beforehand -- see the workaround below.

### Minimal Complete Verifiable Example

```Python
# This'll run without a problem:

import xarray as xr
import os

path = "tmp1.nc"
xr.Dataset({"var1": ("x", [1, 2, 3])}).to_netcdf(path)
ds = xr.open_dataset(path)
ds.close()
ds.load()
os.remove(path)

# This errors:

path = "tmp2.nc"
xr.Dataset({"var1": ("x", [1, 2, 3])}).to_netcdf(path)
ds = xr.open_dataset(path)
ds2 = ds.copy()
ds.close()
ds.load()
ds.close()  # does nothing since ds._close is currently None
ds2.close()  # does nothing
os.remove(path)  # PermissionError

# Workaround

path = "tmp3.nc"
xr.Dataset({"var1": ("x", [1, 2, 3])}).to_netcdf(path)
ds = xr.open_dataset(path)
close_func = ds._close
ds2 = ds.copy()
ds.close()
ds.load()
close_func()
os.remove(path)
```

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

```
INSTALLED VERSIONS
------------------
commit: None
python: 3.12.8 | packaged by conda-forge | (main, Dec  5 2024, 14:06:27) [MSC v.1942 64 bit (AMD64)]
python-bits: 64
OS: Windows
OS-release: 11
machine: AMD64
processor: Intel64 Family 6 Model 191 Stepping 2, GenuineIntel
byteorder: little
LC_ALL: None
LANG: None
LOCALE: ('Dutch_Netherlands', '1252')
libhdf5: 1.14.4
libnetcdf: 4.9.2

xarray: 2025.1.2
pandas: 2.2.3
numpy: 2.1.3
scipy: 1.15.1
netCDF4: 1.7.2
pydap: None
h5netcdf: None
h5py: None
zarr: 3.0.2
cftime: 1.6.4
nc_time_axis: None
iris: None
bottleneck: None
dask: 2025.1.0
distributed: 2025.1.0
matplotlib: 3.10.0
cartopy: None
seaborn: None
numbagg: None
fsspec: 2025.2.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 75.8.0
pip: 25.0
conda: None
pytest: 8.3.4
mypy: None
IPython: 8.32.0
sphinx: 8.1.3
```

</details>
