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

---

## Discussion

**@shoyer** (2019-05-06):

> So maybe we make the boolean encoding optional?

Sounds good to me! We clearly don't need to be doing with data stored in zarr.

**@joshmoore** (2020-07-01):

@rabernat : I don't assume you've found a workaround for this?

**@rabernat** (2020-07-01):

My approach here was to use compression and filters to minimize the on-disk storage. Here is my .zarray for the dataset in question

```json
{
    "chunks": [
        1,
        13,
        4320,
        4320
    ],
    "compressor": {
        "check": -1,
        "filters": [
            {
                "dist": 1,
                "id": 3
            },
            {
                "id": 33,
                "preset": 1
            }
        ],
        "format": 3,
        "id": "lzma",
        "preset": null
    },
    "dtype": "|i1",
    "fill_value": null,
    "filters": null,
    "order": "C",
    "shape": [
        90,
        13,
        4320,
        4320
    ],
    "zarr_format": 2
```

This does not solve the in-memory problem, but that's a numpy issue.

**@jhamman** (2025-03-20):

With Zarr v3 (and Zarr-Python3), we ware now able to write native boolean types:

```python
In [11]: import xarray as xr
    ...: import zarr
    ...: for dtype in ['f8', 'i4', 'bool']:
    ...:     ds = xr.DataArray([1, 0]).astype(dtype).to_dataset(name='foo')
    ...:     store = {}
    ...:     ds.to_zarr(store, consolidated=False)
    ...:     za = zarr.open(store)['foo']
    ...:     print(dtype, za.dtype, za.attrs.get('dtype'))
    ...: 
f8 float64 None
i4 int32 None
bool int8 bool
```

**@elyall** (2026-04-29):

Zarr does have a boolean dtype (for both zarr_format 2 and 3) but the default is to save each bit as a byte as shown by [`zarr.Array.nbytes`](https://zarr.readthedocs.io/en/stable/api/zarr/array/#zarr.Array.nbytes):
```python
for dtype in ["f8", "i4", "bool"]:
    da = xr.DataArray([1, 0]).astype(dtype)
    store = {} 
    zarr.create_array(store, name="foo", data=da.values, zarr_format=3)
    za = zarr.open(store)["foo"]
    print(dtype, za.dtype, za.attrs.get("dtype"), za.nbytes)
```
```shell
f8 float64 None 16
i4 int32 None 8
bool bool None 2
```
This is because `zarr`'s default compression (zstd in v3 and Blosc in v2) doesn't do anything special for boolean arrays. There is a [`PackBits`](https://numcodecs.readthedocs.io/en/stable/filter/packbits.html) codec that would save each bit as a bit, decreasing file sizes by 8x. This could easily be passed into `to_zarr` via the `encoding` argument but `BooleanCoder.encode()` would need to be skipped. I suggest: 
1. At a minimum we skip `BooleanCoder` for all `to_zarr` calls given zarr natively handles boolean arrays. This would allow users to utilize `PackBits` if they want to.
2. ~~We consider implementing `PackBits` as a default encoding for boolean arrays.~~
https://github.com/pydata/xarray/blob/8ee87f14cd7f26f181821f6d171d7f01c3ce11e4/xarray/conventions.py#L68-L106
https://github.com/pydata/xarray/blob/8ee87f14cd7f26f181821f6d171d7f01c3ce11e4/xarray/coding/variables.py#L582-L608

**@elyall** (2026-04-30):

Understanding this more, it looks like the default compression algorithms (zstd and blosc) can drastically outperform PackBits in scenarios where the boolean arrays have structure (e.g. masks, labels, etc.) and chaining them together would produce minimal improvement over the default. Only for random boolean arrays would PackBits outperform the default compressions guaranteeing an 8:1 compression. So I withdraw item 2 above, but we should still implement item 1 for better interoperability with other zarr readers and to allow users to utilize boolean specific codecs like `PackBits`.
