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
