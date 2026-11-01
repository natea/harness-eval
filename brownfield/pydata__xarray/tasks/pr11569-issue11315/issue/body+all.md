# Cannot call .chunk('auto') on DataTree.

_Opened by @BorisTheBrave_

### What happened?

Got an error when calling data_tree.chunk('auto')

This is pretty frustrating, when `xr.open_datatree` supports it. I would expect both to be equivalent.

### What did you expect to happen?

I expect it to succeed, and be equivalent to chunking the dataset, or opening the datatree with the chunks="auto" argument.

Both the type of the argument andthe docs imply this should work.

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
# your reproducer code ...

import numpy as np
import xarray as xr

ds = xr.Dataset({"a": (("x", "y"), np.zeros((10, 5)))})
dt = xr.DataTree(ds)

ds.chunk("auto")  # works
dt.chunk("auto")  # TypeError
```

### Steps to reproduce

uv run the above script.

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [ ] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
Traceback (most recent call last):
       File "/root/timaeus/.claude/worktrees/auto-chunking/repro_script.py", line 23, in &lt;module&gt;
         dt.chunk("auto")  # TypeError
         ^^^^^^^^^^^^^^^^
       File "/.uv/cache/environments-v2/repro-script-8f1b2638dcd6a5aa/lib/python3.11/site-packages/xarray/core/datatree.py", line 2655, in
     chunk
         raise TypeError(
     TypeError: invalid type for chunks: &lt;class 'str'&gt;. Only mappings are supported.
```

### Anything else we need to know?

I've worked aorund with
`dt.map_over_datasets(lambda ds: ds.chunk("auto"))`
which I think is equivalent?

### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.11.11 (main, Mar 17 2025, 21:02:09) [Clang 20.1.0 ]
python-bits: 64
OS: Linux
OS-release: 5.15.0-139-generic
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: C.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.14.6
libnetcdf: 4.9.3

xarray: 2026.4.0
pandas: 3.0.2
numpy: 2.4.4
scipy: 1.17.1
netCDF4: 1.7.4
pydap: None
h5netcdf: None
h5py: None
zarr: 3.1.6
cftime: 1.6.5
nc_time_axis: None
iris: None
bottleneck: None
dask: 2026.3.0
distributed: 2026.3.0
matplotlib: 3.10.8
cartopy: None
seaborn: 0.13.2
numbagg: None
fsspec: 2025.3.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 82.0.1
pip: 26.0.1
conda: None
pytest: 7.4.3
mypy: None
IPython: 9.10.1
sphinx: 7.3.7
/root/timaeus/.venv/lib/python3.11/site-packages/_distutils_hack/__init__.py:30: UserWarning: Setuptools is replacing distutils. Support for replacing an already imported distutils is deprecated. In the future, this condition will fail. Register concerns at https://github.com/pypa/setuptools/issues/new?template=distutils-deprecation.yml
  warnings.warn(


</details>

---

## Discussion

**@welcome** (bot) (2026-04-29):

Thanks for opening your first issue here at xarray! Be sure to follow the issue template!
If you have an idea for a solution, we would really welcome a Pull Request with proposed changes.
See the [Contributing Guide](https://docs.xarray.dev/en/latest/contributing.html) for more.
It may take us a while to respond here, but we really value your contribution. Contributors like you help make xarray better.
Thank you!
