# explicit_indexing_adapter fails for empty list as key

_Opened by @Berndone_

### What happened?

I am implementing my own lazy loadable backend based on https://docs.xarray.dev/en/latest/internals/how-to-add-new-backend.html#how-to-support-lazy-loading using the xr.core.indexing.explicit_indexing_adapter. 

I noticed that when you use `data[[]]` the method crashes, whilst a "normal" data array just returns an empty list.


### What did you expect to happen?

Same result when using a normal data array, not an exception.

### Minimal Complete Verifiable Example

```Python
import xarray as xr
import numpy as np


def raw_indexing_method(key):
    assert False


class MyBackend(xr.backends.BackendArray):
    def __init__(self, array):
        self.shape = array.shape
        self.dtype = array.dtype

    def __getitem__(self, key):
        return xr.core.indexing.explicit_indexing_adapter(
            key,
            self.shape,
            xr.core.indexing.IndexingSupport.BASIC,
            raw_indexing_method,
        )


data1 = xr.DataArray(np.random.randn(2, 3), dims=("x", "y"), coords={"x": [10, 20]})
backend_array = MyBackend(np.random.randn(2, 3))
data = xr.core.indexing.LazilyIndexedArray(backend_array)

data2 = xr.DataArray(
    data,
    dims=("x", "y"),
    coords={"x": [10, 20]},
)

idx = []

print(data1[idx].values) # Works
print(data2[idx].values) # Crashes somewhere in numpy
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
  File "/tmp/test123.py", line 36, in <module>
    print(data2[idx].values)
          ^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/dataarray.py", line 785, in values
    return self.variable.values
           ^^^^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/variable.py", line 540, in values
    return _as_array_or_item(self._data)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/variable.py", line 338, in _as_array_or_item
    data = np.asarray(data)
           ^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/indexing.py", line 524, in __array__
    return np.asarray(self.get_duck_array(), dtype=dtype)
                      ^^^^^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/indexing.py", line 647, in get_duck_array
    array = self.array[self.key]
            ~~~~~~~~~~^^^^^^^^^^
  File "/tmp/test123.py", line 15, in __getitem__
    return xr.core.indexing.explicit_indexing_adapter(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/indexing.py", line 1010, in explicit_indexing_adapter
    raw_key, numpy_indices = decompose_indexer(key, shape, indexing_support)
                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/indexing.py", line 1045, in decompose_indexer
    return _decompose_outer_indexer(indexer, shape, indexing_support)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/xarray/core/indexing.py", line 1290, in _decompose_outer_indexer
    backend_indexer.append(slice(np.min(k), np.max(k) + 1))
                                 ^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/numpy/core/fromnumeric.py", line 2953, in min
    return _wrapreduction(a, np.minimum, 'min', axis, None, out,
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/.../.pyenv/lib/python3.11/site-packages/numpy/core/fromnumeric.py", line 88, in _wrapreduction
    return ufunc.reduce(obj, axis, dtype, out, **passkwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
ValueError: zero-size array to reduction operation minimum which has no identity
```


### Anything else we need to know?

_No response_

### Environment

<details>
INSTALLED VERSIONS
------------------
commit: None
python: 3.11.9 (main, May 10 2024, 17:39:01) [GCC 13.2.1 20240210]
python-bits: 64
OS: Linux
OS-release: 6.6.30-gentoo-dist
machine: x86_64
processor: Intel(R) Core(TM) i7-1065G7 CPU @ 1.30GHz
byteorder: little
LC_ALL: None
LANG: de_DE.utf8
LOCALE: ('de_DE', 'UTF-8')
libhdf5: 1.12.2
libnetcdf: 4.9.3-development

xarray: 2024.5.0
pandas: 2.2.0
numpy: 1.26.4
scipy: 1.12.0
netCDF4: 1.6.5
pydap: None
h5netcdf: None
h5py: None
zarr: None
cftime: 1.6.3
nc_time_axis: None
iris: None
bottleneck: None
dask: 2024.2.0
distributed: None
matplotlib: 3.8.2
cartopy: None
seaborn: None
numbagg: None
fsspec: 2024.2.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 69.0.3
pip: 24.0
conda: None
pytest: 7.4.4
mypy: None
IPython: 8.20.0
sphinx: None
</details>
