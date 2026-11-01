# dividing with unloaded data causes dimension to change order

_Opened by @Pietervanhalem_

### What happened?

When I open a dataset without loading it and perform opperations with it. The data-array gets corrupted. The dimensions seem to be in a different order then the coordinates. Therefore you cannot use the data-array anymore. If I load the dataset after opening it I dont have the issue anymore.

### What did you expect to happen?

I expect the data-array to keep the correct references to the correct coordinates when doing operations with it. I expect the same to happen as when I do load the data.

### Minimal Complete Verifiable Example

```Python
import xarray as xr
import numpy as np

coords = {
    "location": ["a", "b", "c"],
    "duration": [0.3, 0.25, 0.5, 1.0, 3.0],
    "dof": ["x", "y", "z", "rx", "ry", "rz"],
    "motion": ["dis", "vel"],
    "wave_tp": np.arange(3, 19, 1),
    "wave_dir": np.arange(0, 361, 15),
}
ds = xr.Dataset(
    {
        "X": (list(coords.keys()), np.random.rand(*[len(e) for e in coords.values()])),
    },
    coords=coords,
)

with open("tmp.nc", "wb") as fp:
    ds.to_netcdf(fp)

with open("tmp.nc", "rb") as fp:
    # If I perform a .load() here, the bug disappears
    ds = xr.open_dataset(fp) #.load()

a = ds["X"].sel(
    wave_dir=np.arange(0, 360, 30),
    dof="z",
    motion="vel",
)
b = 1 / a

# Here you can see that the dataset has the wrong coordinates. 
# It says location has 12 values, but it should have 3.
display(b)

b.sel(location='a')
```

### MVCE confirmation

- [x] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [x] Complete example — the example is self-contained, including all data and the text of any traceback.
- [x] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [x] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [x] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
{
	"name": "ValueError",
	"message": "conflicting sizes for dimension 'location': length 12 on <this-array> and length 3 on {'wave_dir': 'wave_dir', 'wave_tp': 'wave_tp', 'duration': 'duration', 'location': 'location'}",
	"stack": "\^[[1;31m---------------------------------------------------------------------------\^[[0m\n\^[[1;31mValueError\^[[0m                                Traceback (most recent call last)\nCell \^[[1;32mIn[1], line 37\^[[0m\n\^[[0;32m     33\^[[0m \^[[38;5;66;03m# Here you can see that the dataset has the wrong coordinates. \^[[39;00m\n\^[[0;32m     34\^[[0m \^[[38;5;66;03m# It says location has 12 values, but it should have 3.\^[[39;00m\n\^[[0;32m     35\^[[0m display(b)\n\^[[1;32m---> 37\^[[0m \^[[43mb\^[[49m\^[[38;5;241;43m.\^[[39;49m\^[[43msel\^[[49m\^[[43m(\^[[49m\^[[43mlocation\^[[49m\^[[38;5;241;43m=\^[[39;49m\^[[38;5;124;43m'\^[[39;49m\^[[38;5;124;43ma\^[[39;49m\^[[38;5;124;43m'\^[[39;49m\^[[43m)\^[[49m\n\nFile \^[[1;32mc:\\tools\\python312\\Lib\\site-packages\\xarray\\core\\dataarray.py:1683\^[[0m, in \^[[0;36mDataArray.sel\^[[1;34m(self, indexers, method, tolerance, drop, **indexers_kwargs)\^[[0m\n\^[[0;32m   1567\^[[0m \^[[38;5;28;01mdef\^[[39;00m \^[[38;5;21msel\^[[39m(\n\^[[0;32m   1568\^[[0m     \^[[38;5;28mself\^[[39m,\n\^[[0;32m   1569\^[[0m     indexers: Mapping[Any, Any] \^[[38;5;241m|\^[[39m \^[[38;5;28;01mNone\^[[39;00m \^[[38;5;241m=\^[[39m \^[[38;5;28;01mNone\^[[39;00m,\n\^[[1;32m   (...)\^[[0m\n\^[[0;32m   1573\^[[0m     \^[[38;5;241m*\^[[39m\^[[38;5;241m*\^[[39mindexers_kwargs: Any,\n\^[[0;32m   1574\^[[0m ) \^[[38;5;241m-\^[[39m\^[[38;5;241m>\^[[39m Self:\n\^[[0;32m   1575\^[[0m \^[[38;5;250m    \^[[39m\^[[38;5;124;03m\"\"\"Return a new DataArray whose data is given by selecting index\^[[39;00m\n\^[[0;32m   1576\^[[0m \^[[38;5;124;03m    labels along the specified dimension(s).\^[[39;00m\n\^[[0;32m   1577\^[[0m \n\^[[1;32m   (...)\^[[0m\n\^[[0;32m   1681\^[[0m \^[[38;5;124;03m    Dimensions without coordinates: points\^[[39;00m\n\^[[0;32m   1682\^[[0m \^[[38;5;124;03m    \"\"\"\^[[39;00m\n\^[[1;32m-> 1683\^[[0m     ds \^[[38;5;241m=\^[[39m \^[[38;5;28;43mself\^[[39;49m\^[[38;5;241;43m.\^[[39;49m\^[[43m_to_temp_dataset\^[[49m\^[[43m(\^[[49m\^[[43m)\^[[49m\^[[38;5;241m.\^[[39msel(\n\^[[0;32m   1684\^[[0m         indexers\^[[38;5;241m=\^[[39mindexers,\n\^[[0;32m   1685\^[[0m         drop\^[[38;5;241m=\^[[39mdrop,\n\^[[0;32m   1686\^[[0m         method\^[[38;5;241m=\^[[39mmethod,\n\^[[0;32m   1687\^[[0m         tolerance\^[[38;5;241m=\^[[39mtolerance,\n\^[[0;32m   1688\^[[0m         \^[[38;5;241m*\^[[39m\^[[38;5;241m*\^[[39mindexers_kwargs,\n\^[[0;32m   1689\^[[0m     )\n\^[[0;32m   1690\^[[0m     \^[[38;5;28;01mreturn\^[[39;00m \^[[38;5;28mself\^[[39m\^[[38;5;241m.\^[[39m_from_temp_dataset(ds)\n\nFile \^[[1;32mc:\\tools\\python312\\Lib\\site-packages\\xarray\\core\\dataarray.py:598\^[[0m, in \^[[0;36mDataArray._to_temp_dataset\^[[1;34m(self)\^[[0m\n\^[[0;32m    597\^[[0m \^[[38;5;28;01mdef\^[[39;00m \^[[38;5;21m_to_temp_dataset\^[[39m(\^[[38;5;28mself\^[[39m) \^[[38;5;241m-\^[[39m\^[[38;5;241m>\^[[39m Dataset:\n\^[[1;32m--> 598\^[[0m     \^[[38;5;28;01mreturn\^[[39;00m \^[[38;5;28;43mself\^[[39;49m\^[[38;5;241;43m.\^[[39;49m\^[[43m_to_dataset_whole\^[[49m\^[[43m(\^[[49m\^[[43mname\^[[49m\^[[38;5;241;43m=\^[[39;49m\^[[43m_THIS_ARRAY\^[[49m\^[[43m,\^[[49m\^[[43m \^[[49m\^[[43mshallow_copy\^[[49m\^[[38;5;241;43m=\^[[39;49m\^[[38;5;28;43;01mFalse\^[[39;49;00m\^[[43m)\^[[49m\n\nFile \^[[1;32mc:\\tools\\python312\\Lib\\site-packages\\xarray\\core\\dataarray.py:665\^[[0m, in \^[[0;36mDataArray._to_dataset_whole\^[[1;34m(self, name, shallow_copy)\^[[0m\n\^[[0;32m    662\^[[0m indexes \^[[38;5;241m=\^[[39m \^[[38;5;28mself\^[[39m\^[[38;5;241m.\^[[39m_indexes\n\^[[0;32m    664\^[[0m coord_names \^[[38;5;241m=\^[[39m \^[[38;5;28mset\^[[39m(\^[[38;5;28mself\^[[39m\^[[38;5;241m.\^[[39m_coords)\n\^[[1;32m--> 665\^[[0m \^[[38;5;28;01mreturn\^[[39;00m \^[[43mDataset\^[[49m\^[[38;5;241;43m.\^[[39;49m\^[[43m_construct_direct\^[[49m\^[[43m(\^[[49m\^[[43mvariables\^[[49m\^[[43m,\^[[49m\^[[43m \^[[49m\^[[43mcoord_names\^[[49m\^[[43m,\^[[49m\^[[43m \^[[49m\^[[43mindexes\^[[49m\^[[38;5;241;43m=\^[[39;49m\^[[43mindexes\^[[49m\^[[43m)\^[[49m\n\nFile \^[[1;32mc:\\tools\\python312\\Lib\\site-packages\\xarray\\core\\dataset.py:1133\^[[0m, in \^[[0;36mDataset._construct_direct\^[[1;34m(cls, variables, coord_names, dims, attrs, indexes, encoding, close)\^[[0m\n\^[[0;32m   1129\^[[0m \^[[38;5;250m\^[[39m\^[[38;5;124;03m\"\"\"Shortcut around __init__ for internal use when we want to skip\^[[39;00m\n\^[[0;32m   1130\^[[0m \^[[38;5;124;03mcostly validation\^[[39;00m\n\^[[0;32m   1131\^[[0m \^[[38;5;124;03m\"\"\"\^[[39;00m\n\^[[0;32m   1132\^[[0m \^[[38;5;28;01mif\^[[39;00m dims \^[[38;5;129;01mis\^[[39;00m \^[[38;5;28;01mNone\^[[39;00m:\n\^[[1;32m-> 1133\^[[0m     dims \^[[38;5;241m=\^[[39m \^[[43mcalculate_dimensions\^[[49m\^[[43m(\^[[49m\^[[43mvariables\^[[49m\^[[43m)\^[[49m\n\^[[0;32m   1134\^[[0m \^[[38;5;28;01mif\^[[39;00m indexes \^[[38;5;129;01mis\^[[39;00m \^[[38;5;28;01mNone\^[[39;00m:\n\^[[0;32m   1135\^[[0m     indexes \^[[38;5;241m=\^[[39m {}\n\nFile \^[[1;32mc:\\tools\\python312\\Lib\\site-packages\\xarray\\core\\variable.py:3072\^[[0m, in \^[[0;36mcalculate_dimensions\^[[1;34m(variables)\^[[0m\n\^[[0;32m   3070\^[[0m             last_used[dim] \^[[38;5;241m=\^[[39m k\n\^[[0;32m   3071\^[[0m         \^[[38;5;28;01melif\^[[39;00m dims[dim] \^[[38;5;241m!=\^[[39m size:\n\^[[1;32m-> 3072\^[[0m             \^[[38;5;28;01mraise\^[[39;00m \^[[38;5;167;01mValueError\^[[39;00m(\n\^[[0;32m   3073\^[[0m                 \^[[38;5;124mf\^[[39m\^[[38;5;124m\"\^[[39m\^[[38;5;124mconflicting sizes for dimension \^[[39m\^[[38;5;132;01m{\^[[39;00mdim\^[[38;5;132;01m!r}\^[[39;00m\^[[38;5;124m: \^[[39m\^[[38;5;124m\"\^[[39m\n\^[[0;32m   3074\^[[0m                 \^[[38;5;124mf\^[[39m\^[[38;5;124m\"\^[[39m\^[[38;5;124mlength \^[[39m\^[[38;5;132;01m{\^[[39;00msize\^[[38;5;132;01m}\^[[39;00m\^[[38;5;124m on \^[[39m\^[[38;5;132;01m{\^[[39;00mk\^[[38;5;132;01m!r}\^[[39;00m\^[[38;5;124m and length \^[[39m\^[[38;5;132;01m{\^[[39;00mdims[dim]\^[[38;5;132;01m}\^[[39;00m\^[[38;5;124m on \^[[39m\^[[38;5;132;01m{\^[[39;00mlast_used\^[[38;5;132;01m!r}\^[[39;00m\^[[38;5;124m\"\^[[39m\n\^[[0;32m   3075\^[[0m             )\n\^[[0;32m   3076\^[[0m \^[[38;5;28;01mreturn\^[[39;00m dims\n\n\^[[1;31mValueError\^[[0m: conflicting sizes for dimension 'location': length 12 on <this-array> and length 3 on {'wave_dir': 'wave_dir', 'wave_tp': 'wave_tp', 'duration': 'duration', 'location': 'location'}"
}
```

### Anything else we need to know?

![Image](https://github.com/user-attachments/assets/3f28013c-3308-4163-ac12-d8884d8e2d3e)

### Environment

<details>
INSTALLED VERSIONS
------------------
commit: None
python: 3.12.7 (tags/v3.12.7:0b05ead, Oct  1 2024, 03:06:41) [MSC v.1941 64 bit (AMD64)]
python-bits: 64
OS: Windows
OS-release: 11
machine: AMD64
processor: Intel64 Family 6 Model 186 Stepping 2, GenuineIntel
byteorder: little
LC_ALL: None
LANG: None
LOCALE: ('English_United Kingdom', '1252')
libhdf5: None
libnetcdf: None

xarray: 2025.4.0
pandas: 2.2.3
numpy: 2.2.6
scipy: 1.15.3
netCDF4: None
pydap: None
h5netcdf: None
h5py: None
zarr: None
cftime: None
nc_time_axis: None
iris: None
bottleneck: None
dask: None
distributed: None
matplotlib: None
cartopy: None
seaborn: None
numbagg: None
fsspec: None
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: None
pip: 25.1.1
conda: None
pytest: None
mypy: None
IPython: 9.2.0
sphinx: None
</details>

---

## Discussion

**@keewis** (2025-06-09):

I think this has to do with the fact that you're closing the file before `xarray` has a chance to read the data: try replacing
```python
with open("tmp.nc", mode="rb") as fp:
    ds = xr.open_dataset(fp)
```
with
```python
ds = xr.open_dataset("tmp.nc")
```
and you'll see that the bug goes away.

Given that, the bug may be either in the way we interact with `scipy` or somewhere within `scipy.io`.
