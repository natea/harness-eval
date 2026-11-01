# Assigning `pd.Series` as a coord drops the index name, causing a confusing error

_Opened by @max-sixty_

### What happened?

Assigning a `pd.Series` as a coord doesn't respect the index name of the series, and causes a quite confusing error message. This worked a while ago but no longer does (possibly because we did some other good things which happened to break this...)

```python
da =  xr.tutorial.open_dataset("air_temperature")['air']
slice = da.isel(time=0, lat=0).reset_coords(drop=True)

slice
```

```
<xarray.DataArray 'air' (lon: 53)> Size: 424B
[53 values with dtype=float64]
Coordinates:
  * lon      (lon) float32 212B 200.0 202.5 205.0 207.5 ... 325.0 327.5 330.0
```

This works:

```python
da.assign_coords(lat_at_0=xr.DataArray(slice.to_pandas())
```

```
<xarray.DataArray 'air' (time: 2920, lat: 25, lon: 53)> Size: 31MB
[3869000 values with dtype=float64]
Coordinates:
  * lat       (lat) float32 100B 75.0 72.5 70.0 67.5 ... 22.5 20.0 17.5 15.0
  * lon       (lon) float32 212B 200.0 202.5 205.0 207.5 ... 325.0 327.5 330.0
  * time      (time) datetime64[ns] 23kB 2013-01-01 ... 2014-12-31T18:00:00
    lat_at_0  (lon) float64 424B 241.2 242.5 243.5 244.0 ... 232.8 235.5 238.6
```


But if we remove the surrounding `xr.DataArray`:

```python
da.assign_coords(lat_at_0=(slice.to_pandas()))
```

...we get a quite confusing error message:

```
---------------------------------------------------------------------------
ValueError                                Traceback (most recent call last)
Cell In[66], line 1
----> 1 da.assign_coords(lat_at_0=(slice.to_pandas()))

File ~/workspace/xarray/xarray/core/common.py:644, in DataWithCoords.assign_coords(self, coords, **coords_kwargs)
    641 else:
    642     results = self._calc_assign_results(coords_combined)
--> 644 data.coords.update(results)
    645 return data

File ~/workspace/xarray/xarray/core/coordinates.py:566, in Coordinates.update(self, other)
    560 # special case for PandasMultiIndex: updating only its dimension coordinate
    561 # is still allowed but depreciated.
    562 # It is the only case where we need to actually drop coordinates here (multi-index levels)
    563 # TODO: remove when removing PandasMultiIndex's dimension coordinate.
    564 self._drop_coords(self._names - coords_to_align._names)
--> 566 self._update_coords(coords, indexes)

File ~/workspace/xarray/xarray/core/coordinates.py:844, in DataArrayCoordinates._update_coords(self, coords, indexes)
    842 dims = calculate_dimensions(coords_plus_data)
    843 if not set(dims) <= set(self.dims):
--> 844     raise ValueError(
    845         "cannot add coordinates with new dimensions to a DataArray"
    846     )
    847 self._data._coords = coords
    849 # TODO(shoyer): once ._indexes is always populated by a dict, modify
    850 # it to update inplace instead.

ValueError: cannot add coordinates with new dimensions to a DataArray
```

This is because we discard the `lon` index name when converting the Series, and so we think we're trying to add a dim named `lat_at_0`. Note that it's _not_ the pandas conversion that loses information — I've designed the example so the breaking case has fewer conversions.

### What did you expect to happen?

- This should "just work"
- It seems like it would be _simpler_ internal code if we just ran `xr.DataArray(series)` on pandas series, rather than having some other custom conversion when adding it as a coord...
- The error message could generally be better — would be nice if we said what the new dim was...

### Minimal Complete Verifiable Example

```Python
(as above)
```


### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [X] Complete example — the example is self-contained, including all data and the text of any traceback.
- [X] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [X] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

_No response_

### Anything else we need to know?

_No response_

### Environment

<details>


INSTALLED VERSIONS
------------------
commit: 42ed6d30e81dce5b9922ac82f76c5b3cd748b19e
python: 3.11.9 (main, Apr  2 2024, 08:25:04) [Clang 15.0.0 (clang-1500.3.9.4)]
python-bits: 64
OS: Darwin
OS-release: 23.5.0
machine: arm64
processor: arm
byteorder: little
LC_ALL: en_US.UTF-8
LANG: None
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.12.2
libnetcdf: 4.9.3-development

xarray: 2024.3.1.dev31+gb9163a6f
pandas: 2.2.2
numpy: 1.26.4
scipy: 1.13.0
netCDF4: 1.6.5
pydap: None
h5netcdf: 1.3.0
h5py: 3.11.0
zarr: 2.17.2
cftime: 1.6.3
nc_time_axis: 1.4.1
iris: None
bottleneck: 1.3.8
dask: 2024.4.1
distributed: 2024.4.1
matplotlib: 3.8.4
cartopy: None
seaborn: 0.13.2
numbagg: 0.8.1
fsspec: 2024.3.1
cupy: None
pint: 0.23
sparse: None
flox: None
numpy_groupies: 0.10.2
setuptools: 69.2.0
pip: 24.0
conda: None
pytest: 8.1.1
mypy: 1.8.0
IPython: 8.24.0
sphinx: None

</details>
