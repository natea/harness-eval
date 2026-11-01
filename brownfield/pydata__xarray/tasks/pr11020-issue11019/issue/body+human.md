# Problem using assign_attrs() in map()

_Opened by @dopplershift_

### What is your issue?

In MetPy we have an attribute managing helper that calls `DataArray.assign_attrs()` within a callable passed to `Dataset.map()`. With recent versions of xarray, it is impossible to have the attributes assigned using `assign_attrs()` to be present in the result. See the following example:

```python
import numpy as np
import xarray as xr

ds = xr.DataArray(np.zeros((3)),
    coords={'b': xr.DataArray(np.arange(3), dims='b')},
    dims=['b'], attrs={'units': 'kelvin'}, name='test').to_dataset()

def add_attr(da):
    d = da.assign_attrs(my_attr='foobar')
    return d

ds2 = ds.map(add_attr, keep_attrs=True)

print(ds2['test'].attrs)
```

This gives `{'units': 'kelvin'}`. If instead, `keep_attrs=False` is used, then we get `{}`.

This boils down to the fact that there are only two options for a `DataArray` processed within `map()`:
1. Get a direct copy (really, reference) to the original `DataArray`'s `.attrs`
2. Have `.attrs` set to `{}`

There's no option to tell `map()` to just leave the created `DataArray` alone. The only work-around I've found is to modify the original `DataArray` directly instead of using `assign_attrs()`, which is suboptimal. Things worked fine as recently as xarray 2025.6.1. I know the `keep_attrs` default changed to `True` this fall, but I'm surprised setting to `False` doesn't restore the previous behavior.
