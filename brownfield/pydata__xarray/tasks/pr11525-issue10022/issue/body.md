# DataArray.isin does not accept sets intuitively

_Opened by @mark-boer_

### What is your issue?

This is halfway between an feature request and a bug report. I do not find the way that DataArray.isin handles sets is very intuitive:

Example:
```python
np_arr = np.arange(5)
dask_arr = da.arange(5)
xr_arr = xr.DataArray(np_arr)
pd_series = pd.Series(np_arr)

s = {1, 2}
print("numpy", np.isin(np_arr, s))
print("dask", da.isin(dask_arr, s).compute())
print("xarray", xr_arr.isin(s))
print("pandas", pd_series.isin(s))
```

Which results in:
```txt
numpy [False False False False False]
dask [False False False False False]
xarray <xarray.DataArray (dim_0: 5)> Size: 5B
array([False, False, False, False, False])
Dimensions without coordinates: dim_0
pandas 0    False
1     True
2     True
3    False
4    False
dtype: bool
```

Personally, I find only pandas handles this in an intuitive way. But I also understand, that you might want to stay consistent with numpy and dask.

I'd be interested to see what you think!
