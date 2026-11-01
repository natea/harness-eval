# open_mfdataset segfaults when using engine="netcdf4" and Prallel=Tru

_Opened by @ArielDeVora_

### What happened?

When opening a mf_dataset using netcdf4 engine and parallel=True a segmentation fault arises. The whole open_mfdataset and all operations are wrapped in a class inheriting from xr.Dataset. I would like to know whether netcdf4 engine is compatible with parallel=True, or if there are other ways of doing this. Don't mind the preprocess steps, it changes a dimension name. 

PS : Using h5netcdf engine with parallel=True increases the reading time compared to using the serial netcdf4 engine

### What did you expect to happen?

No segmentation fault.

### Minimal Complete Verifiable Example

```Python
import os

os.environ["HDF5_USE_FILE_LOCKING"] = "FALSE"

import re
from typing import List, Optional, Any

import numpy as np
import xarray as xr
import dask

mf_dataset = xr.open_mfdataset(
  self.data_paths, engine="netcdf4", preprocess=preprocess, combine="by_coords", mask_and_scale=False, decode_cf=False, parallel=False,
)
```

### Steps to reproduce

_No response_

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [ ] Complete example — the example is self-contained, including all data and the text of any traceback.
- [ ] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [ ] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python

```

### Anything else we need to know?

_No response_

### Environment

<details>

commit: None
python: 3.13.8 (main, Dec 11 2025, 09:26:20) [GCC 11.5.0 20240719 (Red Hat 11.5.0-5)]
python-bits: 64
OS: Linux
OS-release: 5.14.0-611.13.1.el9_7.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: fr_FR.UTF-8
LOCALE: ('fr_FR', 'UTF-8')
libhdf5: 1.14.6
libnetcdf: 4.9.3

xarray: 2025.7.1
pandas: 2.3.3
numpy: 2.3.4
scipy: 1.16.3
netCDF4: 1.7.2
pydap: None
h5netcdf: 1.6.1
h5py: 3.14.0
zarr: None
cftime: 1.6.4
nc_time_axis: None
iris: None
bottleneck: 1.5.0
dask: 2025.7.0
distributed: 2025.7.0
matplotlib: 3.10.7
cartopy: None
seaborn: None
numbagg: None
fsspec: 2025.9.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 80.9.0
pip: 25.1.1
conda: None
pytest: 9.0.2
mypy: None
IPython: 9.8.0
sphinx: 8.1.3

</details>
