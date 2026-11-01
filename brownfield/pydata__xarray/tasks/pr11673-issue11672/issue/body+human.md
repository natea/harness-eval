# Loading and saving back from file with netcdf fails

_Opened by @anpr_

### What happened?

I load a DataTree from a netCDF file with `xr.load_datatree` and save it back to the same path. The save fails with `RuntimeError: NetCDF: Write to read only`. The failed save also leaves the file damaged: the group is still there, but the variable is gone.

This only happens when a variable has the same name as its group (e.g. variable a in group /a). If you rename the variable, the save works.

### What did you expect to happen?

load_datatree loads everything into memory, so saving back to the same file should work, as it does with `xr.load_dataset`

### Minimal Complete Verifiable Example

```Python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "xarray[complete]@git+https://github.com/pydata/xarray.git@main",
# ]
# ///

import xarray as xr

xr.DataTree.from_dict({"/a": xr.Dataset({"a": 0})}).to_netcdf("test.nc")
xr.load_datatree("test.nc").to_netcdf("test.nc")
```

### Steps to reproduce

Execute the script above with uv run

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
...
RuntimeError: NetCDF: Write to read only
Raised while encoding variable 'a' with value <xarray.Variable ()> Size: 8B
[1 values with dtype=int64]
```

### Anything else we need to know?

The cause seems to be in DataTree.load(). Its second loop checks `if k not in lazy_data`, but lazy_data is keyed by node path, not by variable name (`datatree.py#L2478-L2482`). So when a variable has the same name as a node path, it isn't loaded and stays lazy. When it's written, xarray reads it from the file that is being overwritten at that moment.

### Environment

<details>
INSTALLED VERSIONS
------------------
commit: None
python: 3.14.4 (main, Apr 14 2026, 14:46:33) [Clang 22.1.3 ]
python-bits: 64
OS: Darwin
OS-release: 27.0.0
machine: arm64
processor: arm
byteorder: little
LC_ALL: en_US.utf-8
LANG: en_US.utf-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.14.6
libnetcdf: 4.9.3

xarray: 2026.9.1.dev21+g78b8e9f96
pandas: 3.0.6
numpy: 2.5.3
scipy: 1.18.1
netCDF4: 1.7.4
pydap: 3.5.11
h5netcdf: 1.8.1
h5py: 3.16.0
zarr: 3.4.0
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
numpy_groupies: 0.12.3
setuptools: None
pip: None
conda: None
pytest: None
mypy: None
IPython: None
sphinx: None
</details>
