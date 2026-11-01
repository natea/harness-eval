# Memory overflow when concatenating Dask-backed DataArrays with mixed dtypes (Boolean and Float)

_Opened by @josephnowak_

### What happened?

I had a process that needed to concatenate a Boolean matrix with a 3D float tensor, and every time I try to run a sum operation over it, it killed all the workers of my cluster. 

After investigation, I found that the boolean matrix was being converted into an integer before being concatenated (a detail on the code) and for some unexpected reason, this was causing the memory overflow (at least the mvce shows that) and if I apply an additional astype(np.float64) then everything works fine (with a higher use of memory but it does not kill my workers). 

I am unsure if the root cause lies within Xarray's concatenation logic, Dask's task graph generation for mixed dtypes, or an interaction between the two. I am reporting it because the memory overflow from this implicit type conversion was unexpected and difficult to debug.

### What did you expect to happen?

I expect that the process will run using a similar amount of memory, even if I do not use the astype(np.float64)

### Minimal Complete Verifiable Example

```Python
import dask.array as da
import xarray as xr
import numpy as np

from dask.distributed import Client


client = Client()

x_size = 500
y_size = 20000
z_size = 57
coords = {
    "x": list(range(x_size)),
    "y": list(range(y_size)),
    "z": list(range(z_size)),
}


a = xr.DataArray(
    da.full(
        (x_size, y_size, 7),
        chunks=(30, -1, -1),
        fill_value=1.0,
    ),
    dims=["x", "y", "z"],
    coords={
        "x": coords["x"],
        "y": coords["y"],
        "z": coords["z"][:7],
    },
)
b = xr.DataArray(
    np.full(
        (y_size, z_size - 7),
        fill_value=0,
        dtype=np.bool
    ),
    dims=["y", "z"],
    coords={
        "y": coords["y"],
        "z": coords["z"][7:],
    }
).chunk(y=-1, z=-1).astype(int)

c = xr.DataArray(
    da.full(
        (x_size, y_size, z_size),
        chunks=(30, -1, -1),
        fill_value=1.0,
    ),
    dims=["x", "y", "z"],
    coords={
        "x": coords["x"],
        "y": coords["y"],
        "z": coords["z"],
    },
)

def concat_and_converting_to_float64():
    return xr.concat([a, b.astype(np.float64)], dim="z").chunk(z=-1).sum().compute()


def concat_and_converting_to_int64():
    return xr.concat([a, b.astype(np.int64)], dim="z").chunk(z=-1).sum().compute()

def concat_and_converting_to_int64_to_float64():
    return xr.concat([a, b.astype(np.int64).astype(np.float64)], dim="z").chunk(z=-1).sum().compute()

def custom_concat_pure_dask_to_int64():
    return da.concatenate(
        [
            a.data,
            b.data[None, :, :][[0] * len(a.data)].astype(np.int64)
        ],
        axis=-1
    ).rechunk(
        chunks=(30, -1, -1)
    ).sum().compute()

def no_concat():
    return c.chunk(z=-1).sum().compute()

# I think an ideal scenario, so it is useful to have a base to compare.
print(no_concat())

# This can be executed, but it consumes almost twice the amount of memory as the no_concat
print(concat_and_converting_to_float64())

# This function is useful to illustrate that apparently the problem is not related to xr.concat
# if not to the astype method in some way (but it contradicts the next function)
print(concat_and_converting_to_int64_to_float64())

# I did not find a proper way to recreate exactly what the concat of Xarray does, but
# I tried to do it differently, and the function can run without killing the workers
print(custom_concat_pure_dask_to_int64())

# This kills my workers, which have 8 GiB of memory on my local, but it can kill any worker
print(concat_and_converting_to_int64())
```

### Steps to reproduce

Copy and paste the script into a Python console or run the code on a Jupyter Notebook

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
2025-11-18 13:04:24,491 - distributed.nanny.memory - WARNING - Worker tcp://127.0.0.1:50640 (pid=11224) exceeded 95% memory budget. Restarting...
2025-11-18 13:04:24,501 - distributed.scheduler - WARNING - Removing worker 'tcp://127.0.0.1:50640' caused the cluster to lose already computed task(s), which will be recomputed elsewhere: {('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 12, 0, 1), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 13, 0, 1), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 3, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 0, 0, 0), ('astype-8387caad616f4d481de00240b53e295c', 0, 0, 0), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 14, 0, 1), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 15, 0, 1), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 1, 0, 0)} (stimulus_id='handle-worker-cleanup-1763467464.4998846')
2025-11-18 13:04:31,948 - distributed.nanny.memory - WARNING - Worker tcp://127.0.0.1:50639 (pid=38932) exceeded 95% memory budget. Restarting...
2025-11-18 13:04:31,955 - distributed.scheduler - WARNING - Removing worker 'tcp://127.0.0.1:50639' caused the cluster to lose already computed task(s), which will be recomputed elsewhere: {('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 12, 0, 1), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 12, 0, 0), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 13, 0, 1), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 13, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 6, 0, 0), ('astype-8387caad616f4d481de00240b53e295c', 0, 0, 0), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 14, 0, 1), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 10, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 2, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 15, 0, 1)} (stimulus_id='handle-worker-cleanup-1763467471.9536104')
2025-11-18 13:04:41,200 - distributed.nanny.memory - WARNING - Worker tcp://127.0.0.1:50641 (pid=39696) exceeded 95% memory budget. Restarting...
2025-11-18 13:04:41,207 - distributed.scheduler - WARNING - Removing worker 'tcp://127.0.0.1:50641' caused the cluster to lose already computed task(s), which will be recomputed elsewhere: {('concatenate-c192cfc3e5e1820bb851b3ea24260927', 5, 0, 0), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 9, 0, 1), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 16, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 9, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 15, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 3, 0, 0), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 10, 0, 1), ('astype-8387caad616f4d481de00240b53e295c', 0, 0, 0), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 11, 0, 1), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 11, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 1, 0, 0), ('concatenate-c192cfc3e5e1820bb851b3ea24260927', 15, 0, 1)} (stimulus_id='handle-worker-cleanup-1763467481.206626')
2025-11-18 13:04:50,946 - distributed.nanny.memory - WARNING - Worker tcp://127.0.0.1:64554 (pid=35028) exceeded 95% memory budget. Restarting...
2025-11-18 13:04:50,951 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 5, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,951 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 3, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,951 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 0, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,951 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 7, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,958 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 16, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,958 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 1, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,959 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 4, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,959 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 2, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,959 - distributed.scheduler - ERROR - Task ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 8, 0, 1) marked as failed because 4 workers died while trying to run it
2025-11-18 13:04:50,959 - distributed.scheduler - WARNING - Removing worker 'tcp://127.0.0.1:64554' caused the cluster to lose already computed task(s), which will be recomputed elsewhere: {('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 9, 0, 1), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 6, 0, 1), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 10, 0, 1), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 11, 0, 1), ('astype-8387caad616f4d481de00240b53e295c', 0, 0, 0), ('rechunk-merge-rechunk-split-concatenate-c192cfc3e5e1820bb851b3ea24260927', 15, 0, 1)} (stimulus_id='handle-worker-cleanup-1763467490.952382')
```

### Anything else we need to know?

_No response_

### Environment

<details>
INSTALLED VERSIONS
------------------
commit: None
python: 3.11.13 (main, Jul 11 2025, 22:36:59) [MSC v.1944 64 bit (AMD64)]
python-bits: 64
OS: Windows
OS-release: 10
machine: AMD64
processor: Intel64 Family 6 Model 165 Stepping 2, GenuineIntel
byteorder: little
LC_ALL: en_US.UTF-8
LANG: en_US.UTF-8
LOCALE: ('es_ES', 'cp1252')
libhdf5: None
libnetcdf: None

xarray: 2025.11.0
pandas: 2.3.3
numpy: 2.3.5
scipy: 1.15.3
netCDF4: None
pydap: None
h5netcdf: None
h5py: None
zarr: 3.0.8
cftime: None
nc_time_axis: None
iris: None
bottleneck: 1.5.0
dask: 2025.11.0
distributed: 2025.11.0
matplotlib: None
cartopy: None
seaborn: None
numbagg: None
fsspec: 2025.10.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: 0.11.3
setuptools: 80.9.0
pip: 25.1.1
conda: None
pytest: 9.0.1
mypy: None
IPython: 9.4.0
sphinx: None


</details>
