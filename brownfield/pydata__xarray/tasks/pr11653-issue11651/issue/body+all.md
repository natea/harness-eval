# Group by median fails with dask arrays with xarray==2026.9.0

_Opened by @joshua-gould_

### What happened?

Unable to perform groupby and median aggregation with latest xarray and flox

### What did you expect to happen?

_No response_

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
import dask.array as da

xr.show_versions()


xr.DataArray(
    da.arange(8, chunks=(1,)).reshape((4, 2)),
    dims=("x", "y"), coords={"x": ['1', '2', '1', '2']}, name='').groupby("x").median()
```


### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
                                                       
  File "python3.13/site-packages/xarray/core/_aggregations.py", line 8046, in median
    return self._flox_reduce(
           ~~~~~~~~~~~~~~~~~^
        func="median",
        ^^^^^^^^^^^^^^
    ...<4 lines>...
        **kwargs,
        ^^^^^^^^^
    )
    ^
  File "python3.13/site-packages/xarray/core/groupby.py", line 1157, in _flox_reduce
    result = xarray_reduce(
        obj.drop_vars(non_numeric.keys()),
    ...<5 lines>...
        **kwargs,
    )
  File "python3.13/site-packages/flox/xarray.py", line 416, in xarray_reduce
    actual = xr.apply_ufunc(
        wrapper,
    ...<27 lines>...
        },
    )
  File "python3.13/site-packages/xarray/computation/apply_ufunc.py", line 1279, in apply_ufunc
    return apply_dataset_vfunc(
        variables_vfunc,
    ...<7 lines>...
        on_missing_core_dim=on_missing_core_dim,
    )
  File "python3.13/site-packages/xarray/computation/apply_ufunc.py", line 527, in apply_dataset_vfunc
    result_vars = apply_dict_of_variables_vfunc(
        func,
    ...<4 lines>...
        on_missing_core_dim=on_missing_core_dim,
    )
  File "python3.13/site-packages/xarray/computation/apply_ufunc.py", line 452, in apply_dict_of_variables_vfunc
    result_vars[name] = func(*variable_args)
                        ~~~~^^^^^^^^^^^^^^^^
  File "python3.13/site-packages/xarray/computation/apply_ufunc.py", line 820, in apply_variable_ufunc
    result_data = func(*input_data)
  File "python3.13/site-packages/flox/xarray.py", line 373, in wrapper
    result, *groups = groupby_reduce(array, *by, func=func, **kwargs)
                      ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "python3.13/site-packages/flox/core.py", line 1196, in groupby_reduce
    result = reindex_(
             ~~~~~~~~^
        result,
        ^^^^^^^
    ...<3 lines>...
        array_type=ReindexArrayType.AUTO,  # just reindex the received array
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ).reshape(result.shape[:-1] + grp_shape)
    ^
  File "python3.13/site-packages/flox/reindex.py", line 213, in reindex_
    reindexed = reindex_numpy(array, from_, to, fill_value, new_dtype, axis)
  File "python3.13/site-packages/flox/reindex.py", line 93, in reindex_numpy
    idx = from_.get_indexer(to)
  File "python3.13/site-packages/pandas/core/indexes/base.py", line 3892, in get_indexer
    raise InvalidIndexError(self._requires_unique_msg)
pandas.errors.InvalidIndexError: Reindexing only valid with uniquely valued Index objects
```


### Environment

INSTALLED VERSIONS
------------------
commit: None
python: 3.13.15 | packaged by conda-forge | (main, Aug 10 2026, 13:01:04) [Clang 19.1.7 ]
python-bits: 64
OS: Darwin
OS-release: 27.0.0
machine: arm64
processor: arm
byteorder: little
LC_ALL: None
LANG: C.UTF-8
LOCALE: ('C', 'UTF-8')
libhdf5: 1.14.6
libnetcdf: None
xarray: 2026.9.0
pandas: 2.3.3
numpy: 2.5.3
scipy: 1.18.1
netCDF4: None
pydap: None
h5netcdf: None
h5py: 3.14.0
zarr: 3.4.0
cftime: None
nc_time_axis: None
iris: None
bottleneck: None
dask: 2026.7.1
distributed: 2026.7.1
matplotlib: 3.11.2
cartopy: None
seaborn: 0.13.2
numbagg: None
fsspec: 2026.9.0
cupy: None
pint: 0.26.1
sparse: 0.19.2
flox: 0.11.2
numpy_groupies: 0.11.3
setuptools: 84.0.0
pip: 26.2.1
conda: None
pytest: 9.1.1
mypy: None
IPython: 9.17.1
sphinx: 9.1.0

---

## Discussion

**@headtr1ck** (2026-10-01):

git bisect shows https://github.com/pydata/xarray/pull/11239 as the root cause

**@headtr1ck** (2026-10-01):

Until this is fixed you can use the following workaround:
```python
with xr.set_options(use_flox=False):
    result = arr.groupby("x").median()
```
