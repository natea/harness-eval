# Feature request: raise more informative error message for `xr.open_dataset(list_of_paths)`

_Opened by @aaronspring_

### Is your feature request related to a problem?

I sometimes use `xr.open_dataset` instead of `xr.open_mfdataset` on multiple paths. I propose to raise a more informative error message than `ValueError: did not find a match in any of xarray's currently installed IO backends ['netcdf4', 'h5netcdf', 'scipy', 'cfgrib']. Consider explicitly selecting one of the installed engines via the ``engine`` parameter, or installing additional IO dependencies, see:
https://docs.xarray.dev/en/stable/getting-started-guide/installing.html
https://docs.xarray.dev/en/stable/user-guide/io.html`.

```python
import xarray as xr

xr.__version__ # '2022.3.0'

ds = xr.tutorial.load_dataset("air_temperature")

ds.isel(time=slice(None,1500)).to_netcdf("file1.nc")
ds.isel(time=slice(1500,None)).to_netcdf("file2.nc")

xr.open_mfdataset(["file1.nc","file2.nc"]) # works
xr.open_mfdataset("file?.nc") # works

# I understand what I need to do here
xr.open_dataset("file?.nc") # fails FileNotFoundError: No such file or directory: b'/dir/file?.nc'

# I dont here; I also first try to check whether one of these files is corrupt
xr.open_dataset(["file1.nc","file2.nc"]) # fails ValueError: did not find a match in any of xarray's currently installed IO backends ['netcdf4', 'h5netcdf', 'scipy', 'cfgrib']. Consider explicitly selecting one of the installed engines via the ``engine`` parameter, or installing additional IO dependencies, see: links
```

### Describe the solution you'd like

directing the user towards the solution, i.e. "found path as list, please use open_mfdataset"

### Describe alternatives you've considered

_No response_

### Additional context

_No response_
