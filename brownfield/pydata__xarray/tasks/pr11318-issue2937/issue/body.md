# encoding of boolean dtype in zarr

_Opened by @rabernat_

I want to store an array with 1364688000 boolean values in zarr. I will have to read this array many times, so I am trying to do it as efficiently as possible.

I have noticed that, if we try to write boolean data to zarr from xarray, zarr stores it as `i8`. ~This means we are using 8x more memory than we actually need.~ 
In researching this, I actually learned that numpy bools use [a full byte of memory](https://stackoverflow.com/questions/5602155/numpy-boolean-array-with-1-bit-entries) 😲!
However, we could still improve performance (albeit very marginally) by skipping the unnecessary dtype encoding that happens here. 

Example
```python
import xarray as xr
import zarr
for dtype in ['f8', 'i4', 'bool']:
    ds = xr.DataArray([1, 0]).astype(dtype).to_dataset('foo')
    store = {}
    ds.to_zarr(store)
    za = zarr.open(store)['foo']
    print(dtype, za.dtype, za.attrs.get('dtype'))
```
gives
```
f8 float64 None
i4 int32 None
bool int8 bool
```

So it seems like, during serialization of bool data, xarray is converting the data to int8 and then adding a `{'dtype': 'bool'}` to the attributes as encoding. When the data is read back, this gets decoded and the data is coerced back to bool.

#### Problem description

Since zarr is fully capable of storing bool data directly, we should not need to encode the data as i8.

I think this happens in `encode_cf_variable`:
https://github.com/pydata/xarray/blob/612d390f925e5490314c363e5e368b2a8bd5daf0/xarray/conventions.py#L236

which calls `maybe_encode_bools`:
https://github.com/pydata/xarray/blob/612d390f925e5490314c363e5e368b2a8bd5daf0/xarray/conventions.py#L105-L112

So maybe we make the boolean encoding optional?

#### Output of ``xr.show_versions()``

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.6.7 | packaged by conda-forge | (default, Feb 28 2019, 09:07:38) 
[GCC 7.3.0]
python-bits: 64
OS: Linux
OS-release: 3.10.0-693.17.1.el7.centos.plus.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: en_US.UTF-8
libhdf5: 1.8.18
libnetcdf: 4.4.1.1

xarray: 0.12.1
pandas: 0.20.3
numpy: 1.13.3
scipy: 1.1.0
netCDF4: 1.3.0
pydap: None
h5netcdf: 0.5.0
h5py: 2.7.1
Nio: None
zarr: 2.3.1
cftime: None
nc_time_axis: None
PseudonetCDF: None
rasterio: None
cfgrib: None
iris: None
bottleneck: 1.2.1
dask: 0.19.0+3.g064ebb1
distributed: 1.21.8
matplotlib: 3.0.3
cartopy: 0.16.0
seaborn: 0.8.1
setuptools: 36.6.0
pip: 9.0.1
conda: None
pytest: 3.2.1
IPython: 6.2.1
sphinx: None

</details>
