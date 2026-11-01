# DataArray.groupby drops empty coordinates

_Opened by @eugene57_

### What happened?

When I run groupby on an empty `DataArray`, empty coordinates are dropped.
This is is xarray version 2024.10.0.

```
import numpy as np
import xarray as xr

data = xr.DataArray(np.empty((0, 2)), dims=['x', 'y'], coords={'x': [], 'y': [1, 1]})
print(data.groupby('y').sum())


<xarray.DataArray (x: 0, y: 1)> Size: 0B
array([], shape=(0, 1), dtype=float64)
Coordinates:
  * y        (y) int64 8B 1
Dimensions without coordinates: x
```
As you see, `x` coordinate is not longer present.

### What did you expect to happen?

I expect `x` coordinate to be preserved.
E.g., here is the optuput of the same snippet in xarray==2024.2.0:
```
<xarray.DataArray (x: 0, y: 1)> Size: 0B
array([], shape=(0, 1), dtype=float64)
Coordinates:
  * x        (x) float64 0B 
  * y        (y) int64 8B 1
```

### Minimal Complete Verifiable Example

```Python
import xarray as xr
xr.show_versions()

# your reproducer code ...
import numpy as np
import xarray as xr

data = xr.DataArray(np.empty((0, 2)), dims=['x', 'y'], coords={'x': [], 'y': [1, 1]})
assert 'x' in data.groupby('y').sum().coords
```

### Steps to reproduce

_No response_

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [ ] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python

```

### Anything else we need to know?

This issue is caused by the change introduced to `DataArray._replace_maybe_drop_dims` function in scope of https://github.com/pydata/xarray/issues/5361.

In this case `self.dims == ('x', 'y')` and `variable.dims == ('y', 'x')` so the condition `set(self.dims) == set(variable.dims)` is True.
However, the next line `new_sizes = dict(zip(self.dims, variable.shape, strict=True))` assumes that the dims order is the same, otherwise it does not have any sense.

### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.12.7 (main, Oct  1 2024, 02:05:46) [GCC 13.3.0]
python-bits: 64
OS: Linux
OS-release: 4.18.0-553.34.1.el8_10.x86_64
machine: x86_64
processor: 
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.14.5
libnetcdf: 4.9.2

xarray: 2024.10.0
pandas: 2.2.3
numpy: 1.26.4
scipy: 1.14.1
netCDF4: 1.7.1.post2
pydap: None
h5netcdf: 1.4.0
h5py: 3.12.1
zarr: 3.1.1
cftime: 1.6.4
nc_time_axis: 1.4.1
iris: None
bottleneck: 1.4.0
dask: 2025.11.0
distributed: 2025.11.0
matplotlib: 3.9.2
cartopy: None
seaborn: 0.13.2
numbagg: 0.8.2
fsspec: 2024.3.0
cupy: 13.3.0
pint: None
sparse: 0.15.4
flox: None
numpy_groupies: None
setuptools: 75.1.1.post0
pip: 24.0
conda: None
pytest: 8.3.3
mypy: 1.11.2
IPython: 8.29.0
sphinx: 7.4.7


</details>

---

## Discussion

**@ianhi** (2026-02-25):

Hi @eugene57 thanks for the report and debugging pass!

a quick workaround for you is to install [flox](https://flox.readthedocs.io/en/latest/) into your environment which xarray will then automatically use. This fixes your bug and should also be faster (or as fast) as the default. xarray groupby.

note for any one else trying to repro this means that to reproduce from a dev env you must set:  `xr.set_options(use_flox=False)`

nevertheless there is a bug here as you have identified. Its also beyond just empty dims. I think its any time you group by a non-leading dim (i.e. reordering hapapens) and the dims don't have the same lengths

**@kkollsga** (2026-03-08):

@ianhi confirmed — it's any non-leading dim groupby where dims have different lengths.

The root cause is in `_replace_maybe_drop_dims` ([dataarray.py:529-531](https://github.com/pydata/xarray/blob/main/xarray/core/dataarray.py#L529-L531)). PR #9517 relaxed the `elif` condition to `set(self.dims) == set(variable.dims)`, but the next line still assumes matching order:

```python
new_sizes = dict(zip(self.dims, variable.shape, strict=True))
```

When dims are reordered, this maps wrong shapes to wrong dims, so the coordinate filter drops coords it shouldn't. Fix: replace with `dict(variable.sizes)`.
