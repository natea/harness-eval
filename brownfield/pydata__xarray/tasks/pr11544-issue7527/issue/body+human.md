# DataArray.idxmax converts coordinates into float64 by default

_Opened by @templiert_

### What happened?

Same example as in [DataArray.idxmax](https://docs.xarray.dev/en/stable/generated/xarray.Dataset.idxmax.html#xarray.Dataset.idxmax) but instead we look at the "y" dimension.
The starting "y" coordinates are of type int: `[-1,0,1]`

The return values of argmax are of type int64: good.
The return values of idxmax are of type float64: bad.

### What did you expect to happen?

If no fillna operation must occur, then the return values of idxmax should be the same type as from the input.
 
Else, the return type might change to a new type depending on the type of the filled value.

### Minimal Complete Verifiable Example

```Python
array = xr.DataArray(
    [
        [2.0, 1.0, 2.0, 0.0, -2.0],
        [-4.0, np.NaN, 2.0, np.NaN, -2.0],
        [np.NaN, np.NaN, 1.0, np.NaN, np.NaN],
    ],
    dims=["y", "x"],
    coords={"y": [-1, 0, 1], "x": np.arange(5.0) ** 2},
)
print(array.argmax(dim="y").dtype)
print(array.idxmax(dim="y").dtype)
```


### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [X] Complete example — the example is self-contained, including all data and the text of any traceback.
- [X] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.

### Relevant log output

```Python
In [41]: print(array.argmax(dim="y").dtype)
int64

In [42]: print(array.idxmax(dim="y").dtype)
float64
```


### Anything else we need to know?

Suggestions:
- change [these two lines](https://github.com/pydata/xarray/blob/main/xarray/core/computation.py#L2086-L2087):
```
    if skipna or (skipna is None and array.dtype.kind in na_dtypes):
        # Put the NaN values back in after removing them
```
into
```
    if (skipna or (skipna is None and array.dtype.kind in na_dtypes)) and allna.any():
        # Put the NaN values back in after removing them, if any
```


- or maybe instead, it is a bug from `DataArray.where`: this [`res = res.where(~allna, fill_value)`](https://github.com/pydata/xarray/blob/main/xarray/core/computation.py#L2088) should not change the array type if `not allna.any()`? Actually, it is a known limitation of `where`: #3570


### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.9.13 (main, Aug 25 2022, 23:51:50) [MSC v.1916 64 bit (AMD64)]
python-bits: 64
OS: Windows
OS-release: 10
machine: AMD64
processor: Intel64 Family 6 Model 158 Stepping 13, GenuineIntel
byteorder: little
LC_ALL: None
LANG: None
LOCALE: ('English_United States', '1252')
libhdf5: 1.10.6
libnetcdf: None

xarray: 0.20.1
pandas: 1.4.4
numpy: 1.24.2
scipy: 1.9.1
netCDF4: None
pydap: None
h5netcdf: None
h5py: 3.7.0
Nio: None
zarr: 2.13.3
cftime: None
nc_time_axis: None
PseudoNetCDF: None
rasterio: None
cfgrib: None
iris: None
bottleneck: 1.3.5
dask: 2022.7.0
distributed: 2022.7.0
matplotlib: 3.5.2
cartopy: None
seaborn: 0.11.2
numbagg: None
fsspec: 2022.7.1
cupy: None
pint: None
sparse: None
setuptools: 63.4.1
pip: 23.0
conda: 22.9.0
pytest: 7.1.2
IPython: 7.31.1
sphinx: 5.0.2


</details>
