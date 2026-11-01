# "ValueError: dimensions [...] must have the same length as the number of data dimensions" when slicing by zero-dimensional CuPy array

_Opened by @dranjan_

### What happened?

I'm slicing a DataArray by another zero-dimensional array. It works as I would expect when the DataArray and indexing array are backed by NumPy, but not when they're CuPy arrays:

```python
a = xr.DataArray(cp.arange(24).reshape(4, 6), dims=['x', 'y'])
idx = xr.DataArray(cp.array(2))
print(a.isel(x=idx))
```

which results in:

```
Traceback (most recent call last):
  File "/home/darsh/work/dr-0338/example.py", line 8, in <module>
    print(a.isel(x=idx))
          ^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/dataarray.py", line 1471, in isel
    ds = self._to_temp_dataset()._isel_fancy(
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/dataset.py", line 2994, in _isel_fancy
    new_var = var.isel(indexers=var_indexers)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 993, in isel
    return self[key]
           ~~~~^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 767, in __getitem__
    return self._finalize_indexing_result(dims, data)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 771, in _finalize_indexing_result
    return self._replace(dims=dims, data=data)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 917, in _replace
    return type(self)(dims, data, attrs, encoding, fastpath=True)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 365, in __init__
    super().__init__(
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/namedarray/core.py", line 264, in __init__
    self._dims = self._parse_dimensions(dims)
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/namedarray/core.py", line 490, in _parse_dimensions
    raise ValueError(
ValueError: dimensions ('x', 'y') must have the same length as the number of data dimensions, ndim=1
```

### What did you expect to happen?

If the example is run with NumPy arrays instead of CuPy arrays, we get this, as expected:
```
<xarray.DataArray (y: 6)> Size: 48B
array([12, 13, 14, 15, 16, 17])
Dimensions without coordinates: y
```


### Minimal Complete Verifiable Example

```Python
#!/usr/bin/env python3

import cupy as cp
import xarray as xr

a = xr.DataArray(cp.arange(24).reshape(4, 6), dims=['x', 'y'])
idx = xr.DataArray(cp.array(2))
print(a.isel(x=idx))
```


### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [X] Complete example — the example is self-contained, including all data and the text of any traceback.
- [X] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [X] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
Traceback (most recent call last):
  File "/home/darsh/work/dr-0338/example.py", line 8, in <module>
    print(a.isel(x=idx))
          ^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/dataarray.py", line 1471, in isel
    ds = self._to_temp_dataset()._isel_fancy(
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/dataset.py", line 2994, in _isel_fancy
    new_var = var.isel(indexers=var_indexers)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 993, in isel
    return self[key]
           ~~~~^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 767, in __getitem__
    return self._finalize_indexing_result(dims, data)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 771, in _finalize_indexing_result
    return self._replace(dims=dims, data=data)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 917, in _replace
    return type(self)(dims, data, attrs, encoding, fastpath=True)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/core/variable.py", line 365, in __init__
    super().__init__(
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/namedarray/core.py", line 264, in __init__
    self._dims = self._parse_dimensions(dims)
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/darsh/virtualenvs/python3.11/lib/python3.11/site-packages/xarray/namedarray/core.py", line 490, in _parse_dimensions
    raise ValueError(
ValueError: dimensions ('x', 'y') must have the same length as the number of data dimensions, ndim=1
```


### Anything else we need to know?

I briefly looked into this but haven't discovered the cause yet. What I know:
- It appears the buggy behavior was introduced in version 2023.3.0. With 2023.2.0, it gives the correct output.
- I confirmed in the debugger that the indexing operation itself seems to work, and it's really just the dimensions `('x', 'y')` that are computed incorrectly.

### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.11.8 (main, Feb 25 2024, 16:41:26) [GCC 9.4.0]
python-bits: 64
OS: Linux
OS-release: 5.15.0-100-generic
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: None
libnetcdf: None

xarray: 2024.2.0
pandas: 1.5.3
numpy: 1.26.4
scipy: None
netCDF4: None
pydap: None
h5netcdf: None
h5py: None
Nio: None
zarr: None
cftime: None
nc_time_axis: None
iris: None
bottleneck: None
dask: None
distributed: None
matplotlib: None
cartopy: None
seaborn: None
numbagg: None
fsspec: None
cupy: 13.0.0
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: None
pip: None
conda: None
pytest: None
mypy: None
IPython: None
sphinx: None
</details>

---

## Discussion

**@keewis** (2024-08-04):

apologies we let this sit for so long, @dranjan, and thanks for the report.

The reason this works with `numpy` but not `cupy` is that we explicitly unpack 0d `numpy` arrays to standard python:
https://github.com/pydata/xarray/blob/1ac19c4231e3e649392add503ae5a13d8e968aef/xarray/core/variable.py#L625-L633

This issue has been introduced in #5873, which as you say was merged between 2023.02.0 and 2023.03.0; before that we were always trying to call `.item()` on the indexer's data. As far as I can tell the aim of that PR was to allow 0d `dask` arrays, but it appears to accidentally have broken support for 0d arrays other than `numpy` arrays.
