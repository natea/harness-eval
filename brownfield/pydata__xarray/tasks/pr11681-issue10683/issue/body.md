# interp() performance regression in 2025.1.0+

_Opened by @k-collie_

### What happened?

A performance regression has been introduced between 2024.11.0 and 2025.1.0, possibly in #9881, as was the case in #10287.  This issue is still present in 2025.8.0. In the example running on my machine it is a 76x performance regression. It seems to be present when interpolating 2D arrays but the degradation is more extreme with 3D arrays.

### What did you expect to happen?

No performance regression.

### Minimal Complete Verifiable Example

```Python
import numpy as np
import xarray as xr

import time

n_repeats = 10

# array dims
n_t = 122
n_r = 65
n_z = 65

# generate some random data to interpolate
rng = np.random.default_rng(seed=42)

data = rng.random((n_t, n_r, n_z))
data_t = np.linspace(0.01, 0.855, n_t)
data_r = np.linspace(0.04, 4., n_r)
data_z = np.linspace(-1.2, 1.2, n_z)

da = xr.DataArray(
    data=data,
    dims=["t", "r", "z"],
    coords=dict(
        t=data_t,
        r=data_r,
        z=data_z,
    ),
)

interp_z_data = rng.random((n_t))
interp_z = xr.DataArray(
    data=interp_z_data,
    dims=["t"],
    coords=dict(
        t=data_t,
    ),
)

start = time.time()
for _ in range(n_repeats):
    # regression is here:
    da.interp(z=interp_z)
end = time.time()

t_elapsed = end - start
print(f"Time elapsed: {t_elapsed}")
```

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
pip install "xarray==2024.11.0"
python test.py
Time elapsed: 0.22251605987548828

pip install "xarray==2025.1.0"
python test.py
Time elapsed: 16.765803813934326
```

### Anything else we need to know?

_No response_

### Environment

<details>
INSTALLED VERSIONS
------------------
commit: None
python: 3.13.7 (main, Aug 14 2025, 00:00:00) [GCC 15.2.1 20250808 (Red Hat 15.2.1-1)]
python-bits: 64
OS: Linux
OS-release: 6.16.3-200.fc42.x86_64
machine: x86_64
processor:
byteorder: little
LC_ALL: None
LANG: en_GB.UTF-8
LOCALE: ('en_GB', 'UTF-8')
libhdf5: None
libnetcdf: None

xarray: 2025.1.0
pandas: 2.3.2
numpy: 2.3.2
scipy: 1.16.1
netCDF4: None
pydap: None
h5netcdf: None
h5py: None
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
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: None
pip: 24.3.1
conda: None
pytest: None
mypy: None
IPython: None
sphinx: None
</details>
