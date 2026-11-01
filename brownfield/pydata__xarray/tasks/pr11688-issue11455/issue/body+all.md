# unstack is slow for regular data

_Opened by @takluyver_

### What happened?

Unstacking an array with a 'regular' MultiIndex, i.e. a cartesian product which doesn't need any missing value handling, is unexpectedly slow.

E.g. unstacking (300_000, 1024) -> (10_000, 30, 1024) takes ~660 ms in my test, whereas reshaping the numpy array is massively quicker.

### What did you expect to happen?

Where possible, I'd like unstack to make a view rather than a copy. I know it won't match the performance of reshape because it has to deal with coordinates etc., but it could be a lot closer.

xarray actually already has the code to do what I want, in `Dataset._unstack_full_reindex()` and `Variable.unstack()`. If I call `._unstack_full_reindex()` by hand, I get a significant speedup. But unstack prefers the "fast path" `_unstack_once` added in #4746, which is not fast in this scenario:

<img width="936" height="280" alt="Image" src="https://github.com/user-attachments/assets/f3975a07-de33-4db3-9cd0-9803255e782a" />

IIUC, `_unstack_once` is meant to speed up dealing with missing values, when a new array has to be allocated. But unfortunately it always allocates a new array and copies the data across, even if there are no missing values to handle.

### Minimal Complete Verifiable Example

```Python
import time
import pandas as pd
import xarray as xr

xr.show_versions()

da = xr.DataArray(data=np.ones((300_000, 1024)), dims=["midx", "other"], coords={
    "midx": pd.MultiIndex.from_product([range(10_000), range(30)])
})

t0 = time.perf_counter()

da.unstack()
t1 = time.perf_counter()

da.values.reshape(10_000, 30, 1024)
t2 = time.perf_counter()

tds = da.to_dataset(name="tmp")
tds._unstack_full_reindex('midx', tds._get_stack_index('midx', multi=True), xr.core.dtypes.NA, False)['tmp']
t3 = time.perf_counter()

print(f"unstack: {t1-t0:.4g} s")
print(f"reshape: {t2-t1:.4g} s")
print(f"_unstack_full_reindex: {t3-t2:.4g} s")
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
unstack: 0.6793 s
reshape: 6.684e-05 s
_unstack_full_reindex: 0.02158 s
```

### Anything else we need to know?

_No response_

### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.11.13 | packaged by conda-forge | (main, Jun  4 2025, 14:48:23) [GCC 13.3.0]
python-bits: 64
OS: Linux
OS-release: 5.14.0-687.25.1.el9_8.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.14.6
libnetcdf: 4.9.2

xarray: 2025.6.1
pandas: 2.3.0
numpy: 1.26.4
scipy: 1.16.0
netCDF4: 1.7.2
pydap: None
h5netcdf: 1.6.3
h5py: 3.14.0
zarr: 3.0.9
cftime: 1.6.4
nc_time_axis: None
iris: None
bottleneck: 1.5.0
dask: 2025.5.1
distributed: 2025.5.1
matplotlib: 3.8.2
cartopy: None
seaborn: 0.13.2
numbagg: None
fsspec: 2025.5.1
cupy: None
pint: 0.24.4
sparse: None
flox: None
numpy_groupies: None
setuptools: 80.9.0
pip: 26.0.1
conda: None
pytest: 8.4.1
mypy: None
IPython: 8.21.0
sphinx: 7.3.7

</details>

---

## Discussion

**@welcome** (bot) (2026-07-17):

Thanks for opening your first issue here at xarray! Be sure to follow the issue template!
If you have an idea for a solution, we would really welcome a Pull Request with proposed changes.
See the [Contributing Guide](https://docs.xarray.dev/en/latest/contributing.html) for more.
It may take us a while to respond here, but we really value your contribution. Contributors like you help make xarray better.
Thank you!

**@dcherian** (2026-07-17):

> even if there are no missing values to handle

The trick is to infer this from the `pd.MultiIndex`. Can it be done?

**@takluyver** (2026-07-17):

I believe this code in `_unstack_full_reindex` checks for this:

https://github.com/pydata/xarray/blob/5c765c33a3135dc5572cc67ce8eb8ff3fb0b31b8/xarray/core/dataset.py#L5567-L5572

Before spotting this, I had been playing around with how to check this. So this function is faster, but not battle-tested:

```python
def _multiindex_regular_labels(mix: "pandas.MultiIndex"):
    """Return a tuple of indexes if mix is a cartesian product, else None"""
    import pandas as pd
    if mix.has_duplicates:
        return None

    k1_sel, k1_subix = mix.get_loc_level(mix[0][0])
    rpt_len = len(k1_subix)
    rpt, rem = divmod(len(mix), rpt_len)
    if rem != 0:
        return None

    if isinstance(k1_subix, pd.MultiIndex):
        inner_labels = _multiindex_regular_labels(k1_subix)
        if inner_labels is None:
            return None
    else:
        inner_labels = (k1_subix,)

    # Check that the outermost level has each value rpt_len times
    outer_codes = mix.codes[0].reshape(-1, rpt_len)
    if (outer_codes != outer_codes[:, 0, np.newaxis]).any():
        return None

    # Check that each inner level is repeating regularly
    for level in range(1, mix.nlevels):
        codes = mix.codes[level].reshape(-1, rpt_len)
        if (codes != codes[0]).any():
            return None

    outer_labels = mix.levels[0][outer_codes[:, 0]]
    return (outer_labels,) + inner_labels
```

**@sahilmathur254** (2026-07-20):

@takluyver The check in `_unstack_full_reindex` looks like the right anchor, and I'd like to work on this.
I’ll profile the current Dataset, unstack dispatch to determine why a full Cartesian MultiIndex still reaches the slower reindexing path, then make fast path selection explicit when the required invariants hold and add regression coverage for regular indexes while confirming that missing combinations, duplicates, and irregular indexes retain their existing behaviour, along with an ASV benchmark based on the reproducer. 
I’ll keep the change focused on fast path selection unless the existing regularity check proves insufficient.
