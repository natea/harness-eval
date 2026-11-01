# Segmentation fault during open_dataset() with dask and netcdf4

_Opened by @enrico-mi_

### What happened?

I am writing a snippet of code that reads netCDF files and convert them to a dask dataframe with the method `read_nc_to_df()`.

When opening multiple netCDF files with `open_dataset()` and `dask.delayed`, the code fails with `segmentation fault` error. Some times the segmentation fault error is preceded by more information, like:

- `*** Error in 'python3': double free or corruption (fasttop): 0x0000000003448df0 ***` (this happened only once)
- `[Errno -101] NetCDF: HDF error: 'path/to/file/output_00.nc' 
There are 28 HDF5 objects open!
Report: open objects on 72057594037927944` (this happened multiple times)

Note that I simply re-execute the same code, and different error outputs might appear, the only constant being the `segmentation fault` line.

### What did you expect to happen?

I expected the code to execute regularly, open the netcdf files, and eventually convert the multiple datasets into a dask dataframe.

### Minimal Complete Verifiable Example

```Python
import xarray as xr
import numpy as np
import dask
import dask.dataframe as dd
import pandas as pd
import threading
##########################################################################
def create_nc():
    # Create data arrays for each variable with different dimensions
    time = np.arange(10)
    lat = np.linspace(-90, 90, 180)
    lon = np.linspace(-180, 180, 360)

    for j in range(3):
        # Variable 1: 1D array (time)
        var1 = xr.DataArray(np.random.rand(len(time)), dims=["time"], coords={"time": time})

        # Variable 2: 2D array (lat, lon)
        var2 = xr.DataArray(np.random.rand(len(lat), len(lon)), dims=["lat", "lon"], coords={"lat": lat, "lon": lon})

        # Variable 3: 3D array (time, lat, lon)
        var3 = xr.DataArray(np.random.rand(len(time), len(lat), len(lon)), dims=["time", "lat", "lon"], coords={"time": time, "lat": lat, "lon": lon})

        # Combine data arrays into a dataset
        ds = xr.Dataset({
            "var1": var1,
            "var2": var2,
            "var3": var3
        })

        # Save the dataset to a NetCDF file
        ds.to_netcdf("output_" + str(j).zfill(2) + ".nc")

    return

##########################################################################
def read_nc_into_df(filename,engine,lock):
    # Read the NetCDF file into an xarray dataset

    if lock is None:
        with xr.open_dataset(filename,cache=False,engine=engine) as ds:
            # Convert the dataset to a pandas dataframe
            df = ds.to_dataframe()
    else:
        with lock:
            with xr.open_dataset(filename,cache=False,engine=engine) as ds:
                # Convert the dataset to a pandas dataframe
                df = ds.to_dataframe()

    return df

############# READING WITHOUT DASK  ######################
def no_dask(filenames,engine):

    # Read each NetCDF file into a pandas dataframe
    dfs = []
    for f in filenames:
        dfs.append( read_nc_into_df(f,engine,None) )
    df = pd.concat(dfs)

    print(df.sample(frac=0.000005, random_state=42))
    return

############# READING WITH DASK.DELAYED  ######################
def with_dask_delayed(filenames, engine, lock):

    df = [ dask.delayed(read_nc_into_df)(f, engine, lock) for f in filenames ]

    df = dd.from_delayed(df)

    print(df.sample(frac=0.000005, random_state=42).compute())

    return

########################################################################
if __name__ == "__main__":

    create_nc()

    filenames = ["output_" + str(j).zfill(2) + ".nc" for j in range(3)]

    engines = [
        "h5netcdf",
        "netcdf4"
    ]

    for engine in engines:
        print("no_dask()")
        print(f"Engine: {engine}")
        try:
            no_dask(filenames,engine)
            print(f"no_dask() + {engine}: ok")
        except Exception as e:
            print(f"Error during no_dask() with engine {engine}: {e}")
            raise
        print()

    for lock in [threading.Lock(),None]:
        for engine in engines:
            print("with_dask_delayed()")
            print(f"Engine: {engine}")
            print(f"Lock: {lock}")
            try:
                with_dask_delayed(filenames,engine,lock)
                print(f"with_dask_delayed() + {engine} + {lock}: ok")
            except Exception as e:
                print(f"Error during with_dask_delayed() with engine {engine} and lock {lock}: {e}")
                raise
            print()
```


### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [X] Complete example — the example is self-contained, including all data and the text of any traceback.
- [X] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [ ] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```
no_dask()
Engine: h5netcdf
                                 var1      var2      var3
time lat        lon                                      
5     35.698324  155.933148  0.125790  0.885606  0.719581
4    -43.743017  9.526462    0.733908  0.875954  0.543229
9    -27.653631  165.961003  0.659727  0.687533  0.700775
2     51.787709 -98.774373   0.569830  0.723463  0.108524
4     11.564246  66.685237   0.905972  0.286024  0.552127
7     85.977654  180.000000  0.058067  0.388723  0.834327
3     11.564246 -84.735376   0.896814  0.703934  0.014507
2     42.737430  156.935933  0.728145  0.424194  0.052766
      70.893855  167.966574  0.728145  0.599037  0.101830
4    -20.614525 -33.593315   0.733908  0.540253  0.788079
no_dask() + h5netcdf: ok

no_dask()
Engine: netcdf4
                                 var1      var2      var3
time lat        lon                                      
5     35.698324  155.933148  0.125790  0.885606  0.719581
4    -43.743017  9.526462    0.733908  0.875954  0.543229
9    -27.653631  165.961003  0.659727  0.687533  0.700775
2     51.787709 -98.774373   0.569830  0.723463  0.108524
4     11.564246  66.685237   0.905972  0.286024  0.552127
7     85.977654  180.000000  0.058067  0.388723  0.834327
3     11.564246 -84.735376   0.896814  0.703934  0.014507
2     42.737430  156.935933  0.728145  0.424194  0.052766
      70.893855  167.966574  0.728145  0.599037  0.101830
4    -20.614525 -33.593315   0.733908  0.540253  0.788079
no_dask() + netcdf4: ok

with_dask_delayed()
Engine: h5netcdf
Lock: <unlocked _thread.lock object at 0x2aab12ca6b40>
                                 var1      var2      var3
time lat        lon                                      
8    -9.553073   137.883008  0.285621  0.369071  0.394301
6    -60.837989  78.718663   0.621654  0.588331  0.015968
3     14.581006  45.626741   0.896814  0.346255  0.653513
7     37.709497 -151.922006  0.474633  0.286773  0.913073
9     65.865922  32.590529   0.659727  0.892672  0.478125
4    -48.770950  111.810585  0.752644  0.258328  0.041822
9     59.832402 -43.621170   0.555145  0.361261  0.079000
8     46.759777 -13.537604   0.246128  0.154291  0.980776
6     26.648045  11.532033   0.146838  0.050511  0.163982
with_dask_delayed() + h5netcdf + <unlocked _thread.lock object at 0x2aab12ca6b40>: ok

with_dask_delayed()
Engine: netcdf4
Lock: <unlocked _thread.lock object at 0x2aab12ca6b40>
                                 var1      var2      var3
time lat        lon                                      
8    -9.553073   137.883008  0.285621  0.369071  0.394301
6    -60.837989  78.718663   0.621654  0.588331  0.015968
3     14.581006  45.626741   0.896814  0.346255  0.653513
7     37.709497 -151.922006  0.474633  0.286773  0.913073
9     65.865922  32.590529   0.659727  0.892672  0.478125
4    -48.770950  111.810585  0.752644  0.258328  0.041822
9     59.832402 -43.621170   0.555145  0.361261  0.079000
8     46.759777 -13.537604   0.246128  0.154291  0.980776
6     26.648045  11.532033   0.146838  0.050511  0.163982
with_dask_delayed() + netcdf4 + <unlocked _thread.lock object at 0x2aab12ca6b40>: ok

with_dask_delayed()
Engine: h5netcdf
Lock: None
                                 var1      var2      var3
time lat        lon                                      
8    -9.553073   137.883008  0.285621  0.369071  0.394301
6    -60.837989  78.718663   0.621654  0.588331  0.015968
3     14.581006  45.626741   0.896814  0.346255  0.653513
7     37.709497 -151.922006  0.474633  0.286773  0.913073
9     65.865922  32.590529   0.659727  0.892672  0.478125
4    -48.770950  111.810585  0.752644  0.258328  0.041822
9     59.832402 -43.621170   0.555145  0.361261  0.079000
8     46.759777 -13.537604   0.246128  0.154291  0.980776
6     26.648045  11.532033   0.146838  0.050511  0.163982
with_dask_delayed() + h5netcdf + None: ok

with_dask_delayed()
Engine: netcdf4
Lock: None
Segmentation fault
```


### Anything else we need to know?

The same `read_nc_to_df` function works regularly when:

- using `engine='h5netcdf'`, or
- if it contained within a `with threading.Lock()` statement, or
- if executed without `dask`.

The example above illustrates these situations, too. The behaviour seems to contradict the documentation, which [states](https://docs.xarray.dev/en/stable/generated/xarray.open_dataset.html) that "By default, appropriate locks are chosen to safely read and write files with the currently active dask scheduler."

The same `read_nc_to_df` function does not work regularly when a lock is explicitly passed to `open_dataset()` through the `backend_kwargs` argument. This is not in the above example to keep it more coincise.

### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.9.10 (main, Feb 20 2022, 11:57:16) 
[GCC 8.3.1 20190311 (Red Hat 8.3.1-3)]
python-bits: 64
OS: Linux
OS-release: 3.10.0-1160.76.1.el7.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.14.2
libnetcdf: 4.9.4-development

xarray: 2024.2.0
pandas: 2.2.2
numpy: 1.26.4
scipy: 1.13.1
netCDF4: 1.7.2
pydap: None
h5netcdf: 1.4.1
h5py: 3.12.1
Nio: None
zarr: None
cftime: 1.6.4.post1
nc_time_axis: None
iris: None
bottleneck: None
dask: 2024.7.1
distributed: 2024.7.1
matplotlib: 3.9.2
cartopy: None
seaborn: None
numbagg: None
fsspec: 2023.10.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 69.5.1
pip: 24.3.1
conda: None
pytest: None
mypy: None
IPython: 8.18.1
sphinx: None


</details>

---

## Discussion

**@aradhakrishnanGFDL** (2025-03-13):

We are seeing the same issue in some form, as described [here](https://github.com/intake/intake-esm/issues/697.  I am curious if its the same issue, and what the work around might be.

**@charles-turner-1** (2025-03-25):

Hey @enrico-mi - we've been seeing what looks to be the same bug with intake-esm, as Aparna mentioned above. 

I've tried to reproduce the bug with your script & and the same dependencies, and these are the only error I'm getting on (tried on Mac OS & Ubuntu):
1.
```python
with_dask_delayed()
Engine: netcdf4
Lock: None
Error during with_dask_delayed() with engine netcdf4 and lock None: NetCDF: Not a valid ID
Traceback (most recent call last):
  File "/Users/u1166368/scratch/segfault/segfault_xr.py", line 104, in <module>
    with_dask_delayed(filenames,engine,lock)
  File "/Users/u1166368/scratch/segfault/segfault_xr.py", line 71, in with_dask_delayed
    print(df.sample(frac=0.000005, random_state=42).compute())
  File "/Users/u1166368/miniforge3/envs/segfault-3.9/lib/python3.9/site-packages/dask_expr/_collection.py", line 476, in compute
    return DaskMethodsMixin.compute(out, **kwargs)
  File "/Users/u1166368/miniforge3/envs/segfault-3.9/lib/python3.9/site-packages/dask/base.py", line 376, in compute
    (result,) = compute(self, traverse=False, **kwargs)
  File "/Users/u1166368/miniforge3/envs/segfault-3.9/lib/python3.9/site-packages/dask/base.py", line 662, in compute
    results = schedule(dsk, keys, **kwargs)
  File "/Users/u1166368/scratch/segfault/segfault_xr.py", line 43, in read_nc_into_df
    df = ds.to_dataframe()
  File "/Users/u1166368/miniforge3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/core/common.py", line 1488, in __exit__
    self.close()
  File "/Users/u1166368/miniforge3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/core/common.py", line 1271, in close
    self._close()
  File "/Users/u1166368/miniforge3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/netCDF4_.py", line 578, in close
    self._manager.close(**kwargs)
  File "/Users/u1166368/miniforge3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/file_manager.py", line 234, in close
    file.close()
  File "src/netCDF4/_netCDF4.pyx", line 2669, in netCDF4._netCDF4.Dataset.close
  File "src/netCDF4/_netCDF4.pyx", line 2636, in netCDF4._netCDF4.Dataset._close
  File "src/netCDF4/_netCDF4.pyx", line 2164, in netCDF4._netCDF4._ensure_nc_success
RuntimeError: NetCDF: Not a valid ID
```
2.
```python
with_dask_delayed()
Engine: netcdf4
Lock: None
Error during with_dask_delayed() with engine netcdf4 and lock None: NetCDF: Can't open HDF5 attribute
Traceback (most recent call last):
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/file_manager.py", line 211, in _acquire_with_cache_info
    file = self._cache[self._key]
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/lru_cache.py", line 56, in __getitem__
    value = self._cache[key]
KeyError: [<class 'netCDF4._netCDF4.Dataset'>, ('/home/ct/segfault/output_01.nc',), 'r', (('clobber', True), ('diskless', False), ('format', 'NETCDF4'), ('persist', False)), '291e0e57-9a63-441d-9e39-4374768c48ed']

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/home/ct/segfault/segfault_xr.py", line 104, in <module>
    with_dask_delayed(filenames,engine,lock)
  File "/home/ct/segfault/segfault_xr.py", line 71, in with_dask_delayed
    print(df.sample(frac=0.000005, random_state=42).compute())
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/dask_expr/_collection.py", line 476, in compute
    return DaskMethodsMixin.compute(out, **kwargs)
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/dask/base.py", line 376, in compute
    (result,) = compute(self, traverse=False, **kwargs)
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/dask/base.py", line 662, in compute
    results = schedule(dsk, keys, **kwargs)
  File "/home/ct/segfault/segfault_xr.py", line 41, in read_nc_into_df
    with xr.open_dataset(filename,cache=False,engine=engine) as ds:
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/api.py", line 573, in open_dataset
    backend_ds = backend.open_dataset(
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/netCDF4_.py", line 646, in open_dataset
    store = NetCDF4DataStore.open(
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/netCDF4_.py", line 409, in open
    return cls(manager, group=group, mode=mode, lock=lock, autoclose=autoclose)
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/netCDF4_.py", line 356, in __init__
    self.format = self.ds.data_model
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/netCDF4_.py", line 418, in ds
    return self._acquire()
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/netCDF4_.py", line 412, in _acquire
    with self._manager.acquire_context(needs_lock) as root:
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/contextlib.py", line 119, in __enter__
    return next(self.gen)
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/file_manager.py", line 199, in acquire_context
    file, cached = self._acquire_with_cache_info(needs_lock)
  File "/home/ct/anaconda3/envs/segfault-3.9/lib/python3.9/site-packages/xarray/backends/file_manager.py", line 217, in _acquire_with_cache_info
    file = self._opener(*self._args, **kwargs)
  File "src/netCDF4/_netCDF4.pyx", line 2540, in netCDF4._netCDF4.Dataset.__init__
  File "src/netCDF4/_netCDF4.pyx", line 2055, in netCDF4._netCDF4._get_vars
  File "src/netCDF4/_netCDF4.pyx", line 2164, in netCDF4._netCDF4._ensure_nc_success
RuntimeError: NetCDF: Can't open HDF5 attribute
```

I suspect I'm not perfectly reproducing the environment you're using - If I hard pin everything listed in your post, the solver fails. If you're using conda, could you post an `env.yml` file that I can use to reproduce the environment?

**@enrico-mi** (2025-03-25):

Hi @aradhakrishnanGFDL -- my workaround has been to pass a lock myself instead of relying on xarray, I have not solved the segmentation fault.

Hi @charles-turner-1 -- I'm not using conda, just plain pip, so I cannot help with the `env.yml`. Is there any other way I can help? Like setting up a different environment?

**@charles-turner-1** (2025-03-25):

Hey @enrico-mi  cheers for the reply - I used your manual locking solution, which seems to solve the issue @aradhakrishnanGFDL linked.

No worries with the environment - you've posted everything in your initial bug report, so I'll try spinning up a docker image or similar with the same dependencies & shared objects & pip install everything.

My understanding is that (in the issue linked) this is all stemming from the libnetcdf not being thread safe. I've posted a heap of debugging info in that issue, but the TLDR is that most of the time the segmentation faults seem to be from multiple threads attempting to access the same netcdf file at the same time. 

Not sure if it's exactly the same in your case, but it might help tease apart the issue?

**@enrico-mi** (2025-03-25):

Yes, @charles-turner-1 , I had the same suspicion given that using a lock solves it and that [the netCDF C library is not thread-safe](https://docs.unidata.ucar.edu/netcdf-c/current/faq.html). So any code that does not have a lock properly implemented should face competition issues at some point when accessing netCDF with dask.

I think it is a bug because xarray should take care of the locking given its integration with dask? [xarray open_dataset docs](https://docs.xarray.dev/en/stable/generated/xarray.open_dataset.html) says that xarray would deal with locks itself with dask, which would make sense and I think it's the expected behavior that the user should not care about locks when using dask+xarray. It also says that `open_dataset` takes a lock as an argument, but in my case it does not work if I pass it down from dask.

It might be a niche case or just not the designed behavior for xarray though!

**@dcherian** (2025-03-25):

Yes netCDF-C removed some kind of lock in v1.6.0 and since then, we've been seeing failures. 

We are missing a lock someplace but no one has debugged this. We would very much appreciate if someone could dig in and see where this is failing, and where we might be missing a lock.

Though I am not sure locking explains the original failure.

**@charles-turner-1** (2025-03-26):

I've attached a gdb backtrace from my looking into this issue over in [the intake-esm issue](https://github.com/intake/intake-esm/issues/697#issuecomment-2712196926)

```bash
...
(gdb) bt
#0  __pthread_kill_implementation (no_tid=0, signo=6, threadid=<optimized out>) at ./nptl/pthread_kill.c:44
#1  __pthread_kill_internal (signo=6, threadid=<optimized out>) at ./nptl/pthread_kill.c:78
#2  __GI___pthread_kill (threadid=<optimized out>, signo=signo@entry=6) at ./nptl/pthread_kill.c:89
#3  0x00007ffff7c4527e in __GI_raise (sig=sig@entry=6) at ../sysdeps/posix/raise.c:26
#4  0x00007ffff7c288ff in __GI_abort () at ./stdlib/abort.c:79
#5  0x00007ffff7c297b6 in __libc_message_impl (fmt=fmt@entry=0x7ffff7dce8d7 "%s\n") at ../sysdeps/posix/libc_fatal.c:134
#6  0x00007ffff7ca8ff5 in malloc_printerr (str=str@entry=0x7ffff7dd1eb8 "malloc(): unaligned tcache chunk detected") at ./malloc/malloc.c:5772
#7  0x00007ffff7cad94c in tcache_get_n (ep=<optimized out>, tc_idx=<optimized out>) at ./malloc/malloc.c:3183
#8  tcache_get (tc_idx=<optimized out>) at ./malloc/malloc.c:3199
#9  __GI___libc_malloc (bytes=bytes@entry=29) at ./malloc/malloc.c:3320
#10 0x00007ffff7cb435f in __GI___strdup (s=0x7fffc00aecf0 "\256") at ./string/strdup.c:42
#11 0x00007fffd09a68cf in H5MM_xstrdup () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#12 0x00007fffd08f247e in H5E__push_stack () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#13 0x00007fffd08f2577 in H5E_printf_stack () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#14 0x00007fffd0993537 in H5I_dec_ref () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#15 0x00007fffd08f2a2a in H5E__clear_entries () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#16 0x00007fffd08f2b19 in H5E_clear_stack () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#17 0x00007fffd0a64372 in H5Tget_size () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#18 0x00007fffd109d8d5 in H5DSis_scale () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5_hl-123198ff.so.310.0.2
#19 0x00007fffd0ebd61a in read_hdf5_obj () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libnetcdf-1423d252.so.22
#20 0x00007fffd095ddf5 in H5G__iterate_cb () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#21 0x00007fffd09601f9 in H5G__link_iterate_table () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#22 0x00007fffd0956095 in H5G__compact_iterate () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#23 0x00007fffd0966a1c in H5G__obj_iterate () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#24 0x00007fffd095ee2f in H5G_iterate () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#25 0x00007fffd099f6dc in H5L_iterate () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#26 0x00007fffd0b151c4 in H5VL__native_link_specific () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#27 0x00007fffd0b04afc in H5VL_link_specific () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#28 0x00007fffd0998859 in H5Literate2 () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
#29 0x00007fffd0ebb9e9 in rec_read_metadata () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libnetcdf-1423d252.so.22
#30 0x00007fffd0ebeb4b in NC4_open () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libnetcdf-1423d252.so.22
#31 0x00007fffd0e8370b in NC_open () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libnetcdf-1423d252.so.22
#32 0x00007fffd0e837e4 in nc_open () from /home/ct/intake-esm-seg/venv/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libnetcdf-1423d252.so.22
#33 0x00007fffd12989ad in __pyx_pf_7netCDF4_8_netCDF4_7Dataset___init__ (__pyx_v_kwargs=0x7fffcf73cd40, __pyx_v_auto_complex=<optimized out>, __pyx_v_info=<optimized out>, __pyx_v_comm=<optimized out>, __pyx_v_parallel=<optimized out>, __pyx_v_encoding=0x7fffcf783690,
    __pyx_v_memory=<optimized out>, __pyx_v_keepweakref=<optimized out>, __pyx_v_persist=<optimized out>, __pyx_v_diskless=<optimized out>, __pyx_v_format=<optimized out>, __pyx_v_clobber=0x94f6e0 <_Py_TrueStruct>, __pyx_v_mode=0x95ff20 <_PyRuntime+66720>,
    __pyx_v_filename=<optimized out>, __pyx_v_self=0x7fffd00fc840) at src/netCDF4/_netCDF4.c:27897
#34 __pyx_pw_7netCDF4_8_netCDF4_7Dataset_1__init__ (__pyx_v_self=0x7fffd00fc840, __pyx_args=<optimized out>, __pyx_kwds=<optimized out>) at src/netCDF4/_netCDF4.c:26376
#35 0x000000000051b6ab in type_call (type=<optimized out>, args=0x7fffcf7803d0, kwds=0x7fffd01d2280) at /usr/local/src/conda/python-3.12.7/Objects/typeobject.c:1679
#36 0x000000000055aab5 in _PyObject_Call (tstate=0x2e2c6c0, callable=0x7fffd12f64c0 <__pyx_type_7netCDF4_8_netCDF4_Dataset>, args=0x7fffcf7803d0, kwargs=<optimized out>) at /usr/local/src/conda/python-3.12.7/Objects/call.c:367
#37 0x000000000052acad in PyCFunction_Call (kwargs=0x7fffd01d2280, args=0x7fffcf7803d0, callable=0x7fffd12f64c0 <__pyx_type_7netCDF4_8_netCDF4_Dataset>) at /usr/local/src/conda/python-3.12.7/Objects/call.c:387
#38 _PyEval_EvalFrameDefault (tstate=<optimized out>, frame=0x7ffff2e40488, frame@entry=0x7fffcf5835e8, throwflag=throwflag@entry=0) at Python/bytecodes.c:3263
```

I've got some other backtraces I've saved if they're any help? I'm happy to have a crack, but I'm not a C expert by any stretch of the imagination...

**@dopplershift** (2025-03-26):

> Yes netCDF-C removed some kind of lock in v1.6.0 and since then, we've been seeing failures.

Clarification: netcdf-c has never locked or been threadsafe. netcdf4-python has had [multiple](https://github.com/Unidata/netcdf4-python/pull/370) [PRs](https://github.com/Unidata/netcdf4-python/pull/1181) that release the GIL over the last 10 years. The problem is that the GIL is a big lock for the entire Python interpreter, and there are many potential use cases where it might be nice to let other operations progress while waiting on I/O-heavy netCDF operations.

There's no world where you should be throwing a threadpool at netCDF operations without a lock. Relying on the GIL for that just hid the problem.

**@dcherian** (2025-03-26):

Yes I agree, we were _unintentionally_ relying on the GIL, and we haven't tracked down where yet.

**@enrico-mi** (2025-03-28):

> Yes netCDF-C removed some kind of lock in v1.6.0 and since then, we've been seeing failures.
> 
> We are missing a lock someplace but no one has debugged this. We would very much appreciate if someone could dig in and see where this is failing, and where we might be missing a lock.
> 
> Though I am not sure locking explains the original failure.

Would you have any pointer for where to start? I'd be happy to give it try.

**@charles-turner-1** (2025-04-04):

I did some more digging over in the [intake-esm issue](https://github.com/intake/intake-esm/issues/697#issuecomment-2774797035) I linked above, which seems to be the same error.

To my eye (although admittedly I'm fairly green debugging this sort of issue), it looks like the segfaults seems to be the result of locks being created within threads? 

```gdb
gdb  --args python3-dbg -m pytest tests/test_core.py::test_to_datatree -v                                                                              
...
Thread 20 "python3-dbg" received signal SIGSEGV, Segmentation fault.
[Switching to Thread 0x7fffc2ffd6c0 (LWP 1287079)]
0x00007fffc2345fde in H5FL_fac_free () from /home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/netCDF4/../netCDF4.libs/libhdf5-0b47eb58.so.310.2.0
(gdb) py-bt
Traceback (most recent call first):
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/file_manager.py", line 217, in _acquire_with_cache_info
    file = self._opener(*self._args, **kwargs)
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/file_manager.py", line 199, in acquire_context
    file, cached = self._acquire_with_cache_info(needs_lock)
  File "/usr/lib/python3.12/contextlib.py", line 137, in __enter__
    return next(self.gen)
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/netCDF4_.py", line 455, in _acquire
    with self._manager.acquire_context(needs_lock) as root:
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/netCDF4_.py", line 461, in ds
    return self._acquire()
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/netCDF4_.py", line 393, in __init__
    self.format = self.ds.data_model
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/netCDF4_.py", line 452, in open
    return cls(manager, group=group, mode=mode, lock=lock, autoclose=autoclose)
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/netCDF4_.py", line 666, in open_dataset
    store = NetCDF4DataStore.open(
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/xarray/backends/api.py", line 687, in open_dataset
    backend_ds = backend.open_dataset(
  File "/home/ct/intake-esm/intake_esm/source.py", line 82, in _open_dataset
    ds = xr.open_dataset(url, **xarray_open_kwargs)
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/dask/utils.py", line 77, in apply
    return func(*args, **kwargs)
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/dask/_task_spec.py", line 755, in __call__
    return self.func(*new_argspec)
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/dask/local.py", line 229, in execute_task
    result = task(data)
  File "/home/ct/intake-esm-seg/venv-dbg/lib/python3.12/site-packages/dask/local.py", line 243, in batch_execute_tasks
    return [execute_task(*a) for a in it]
  File "/usr/lib/python3.12/concurrent/futures/thread.py", line 58, in run
    result = self.fn(*self.args, **self.kwargs)
  File "/usr/lib/python3.12/concurrent/futures/thread.py", line 92, in _worker
    work_item.run()
  File "/usr/lib/python3.12/threading.py", line 1010, in run
    self._target(*self._args, **self._kwargs)
  File "/usr/lib/python3.12/threading.py", line 1073, in _bootstrap_inner
    self.run()
  File "/usr/lib/python3.12/threading.py", line 1030, in _bootstrap
    self._bootstrap_inner()
```


More info in the thread over there, I don't want to clutter this issue up whilst I'm not 100% it's the same issue.

**@CptOrange16** (2025-08-25):

What is the status on this? 
I am having this issue with python3.13, netcdf4 1.7.2, xarray 2025.4.0
