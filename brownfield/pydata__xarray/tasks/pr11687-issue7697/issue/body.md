# open_mfdataset very slow

_Opened by @groutr_

### What happened?

I am trying to open an mfdataset consisting of over 4400 files. The call completes in 342.735s on my machine. After running a profiler, I discovered that most of that time is spent reading the first 8 bytes of the file. However, on my filesystem, looking at my system resource monitor, it looks like the entire file is being read (with a sustained 40-50MB of read IO most of that time).

I traced the bottleneck down to https://github.com/pydata/xarray/blob/96030d4825159c6259736155084f38ee8db5c9bb/xarray/core/utils.py#L662 According to my profile, 264.381s (77%) of the execution time is spent on this line.

I isolated the essence of this code, by reading the first 8 bytes of each file.
```python
for f in files:
    with open(f, 'rb') as fh:
        if fh.tell() != 0:
            fh.seek(0)
        magic = fh.read(8)
        fh.seek(0)
```
Profiling this on my directory of netcdf files took 137.587s (not sure why this was faster than 264s, caching maybe?). Changing the `fh.read(8)` to `fh.read1(8)`, the execution time dropped to 1.52s.

### What did you expect to happen?

I expected open_mfdataset to be quicker.

### Minimal Complete Verifiable Example

```Python
import xarray as xr
import pathlib

files = [... <list of 4400 filenames> ...]
# This takes almost 6 minutes to finish.
D = xr.open_mfdataset(files, compat='override', coords='minimal', data_vars='minimal')
```


### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [ ] Complete example — the example is self-contained, including all data and the text of any traceback.
- [ ] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.

### Relevant log output

_No response_

### Anything else we need to know?

I cannot share the netcdf files. I believe this issue to isolated, and possibly triggered by the shared filesystems found on supercomputers.

### Environment

<details>
INSTALLED VERSIONS
------------------
commit: None
python: 3.11.0 | packaged by conda-forge | (main, Jan 14 2023, 12:27:40) [GCC 11.3.0]
python-bits: 64
OS: Linux
OS-release: 3.10.0-1160.80.1.el7.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: None
LOCALE: (None, None)
libhdf5: 1.12.2
libnetcdf: 4.9.1

xarray: 2023.2.0
pandas: 1.5.3
numpy: 1.24.2
scipy: 1.10.1
netCDF4: 1.6.2
pydap: None
h5netcdf: None
h5py: None
Nio: None
zarr: None
cftime: 1.6.2
nc_time_axis: None
PseudoNetCDF: None
rasterio: 1.3.6
cfgrib: None
iris: None
bottleneck: None
dask: 2023.3.1
distributed: None
matplotlib: 3.7.1
cartopy: None
seaborn: None
numbagg: None
fsspec: 2023.3.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 67.5.1
pip: 23.0.1
conda: None
pytest: None
mypy: None
IPython: 8.11.0
sphinx: None



</details>
