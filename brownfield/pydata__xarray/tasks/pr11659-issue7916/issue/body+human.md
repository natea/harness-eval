# .item() breaks on dataarray if dask arrays are (implicitely) used

_Opened by @eiphione_

### What happened?

When using .item() to get a value (for example of a calculated average via .mean()) of an dataarray, this results in an error if the underlying array is a dask array.

### What did you expect to happen?

I did not explicitely use dask, therefore I expected .item() to work. If dask arrays can be used implicitely, then I would expect the API to work, regardless of the underlying array data type.

### Minimal Complete Verifiable Example

```Python
import xarray as xr

ds = xr.tutorial.open_dataset("air_temperature", chunks="auto")  # force dask usage but this can also happen implicitly

ds.air.mean().item()
```


### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [X] Complete example — the example is self-contained, including all data and the text of any traceback.
- [X] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.

### Relevant log output

```Python
Traceback (most recent call last):
  File "/home/tschmitt/.cache/pypoetry/virtualenvs/xr-bug-ugHUypuW-py3.9/lib/python3.9/site-packages/xarray/core/ops.py", line 191, in _call_possibly_missing_method
    method = getattr(arg, name)
AttributeError: 'Array' object has no attribute 'item'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/home/tschmitt/software/xr_bug/mwe.py", line 6, in <module>
    ds.air.mean().item()
  File "/home/tschmitt/.cache/pypoetry/virtualenvs/xr-bug-ugHUypuW-py3.9/lib/python3.9/site-packages/xarray/core/ops.py", line 203, in func
    return _call_possibly_missing_method(self.data, name, args, kwargs)
  File "/home/tschmitt/.cache/pypoetry/virtualenvs/xr-bug-ugHUypuW-py3.9/lib/python3.9/site-packages/xarray/core/ops.py", line 193, in _call_possibly_missing_method
    duck_array_ops.fail_on_dask_array_input(arg, func_name=name)
  File "/home/tschmitt/.cache/pypoetry/virtualenvs/xr-bug-ugHUypuW-py3.9/lib/python3.9/site-packages/xarray/core/duck_array_ops.py", line 77, in fail_on_dask_array_input
    raise NotImplementedError(msg % func_name)
NotImplementedError: 'item' is not yet a valid method on dask arrays
Exception ignored in: <function CachingFileManager.__del__ at 0x7f8da8e1b1f0>
Traceback (most recent call last):
  File "/home/tschmitt/.cache/pypoetry/virtualenvs/xr-bug-ugHUypuW-py3.9/lib/python3.9/site-packages/xarray/backends/file_manager.py", line 246, in __del__
TypeError: 'NoneType' object is not callable
```


### Anything else we need to know?

_No response_

### Environment

<details>

INSTALLED VERSIONS
------------------
commit: None
python: 3.9.12 | packaged by conda-forge | (main, Mar 24 2022, 23:22:55)
[GCC 10.3.0]
python-bits: 64
OS: Linux
OS-release: 3.10.0-862.14.4.el7.x86_64
machine: x86_64
processor: x86_64
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.12.2
libnetcdf: 4.9.3-development

xarray: 2023.4.0
pandas: 2.0.2
numpy: 1.24.3
scipy: None
netCDF4: 1.6.4
pydap: None
h5netcdf: None
h5py: None
Nio: None
zarr: None
cftime: 1.6.2
nc_time_axis: None
PseudoNetCDF: None
iris: None
bottleneck: None
dask: 2023.6.0
distributed: None
matplotlib: None
cartopy: None
seaborn: None
numbagg: None
fsspec: 2023.6.0
cupy: None
pint: None
sparse: None
flox: None
numpy_groupies: None
setuptools: 62.3.2
pip: 22.1.1
conda: None
pytest: None
mypy: None
IPython: None
sphinx: None

</details>

---

## Discussion

**@TomNicholas** (2023-06-13):

Thanks for reporting this. Here's an even simpler example reproducing the error:

```python
In [2]: da = xr.DataArray([2])

In [3]: da.item()
Out[3]: 2

In [4]: da.chunk().item()
---------------------------------------------------------------------------
AttributeError                            Traceback (most recent call last)
File ~/Documents/Work/Code/xarray/xarray/core/ops.py:193, in _call_possibly_missing_method(arg, name, args, kwargs)
    192 try:
--> 193     method = getattr(arg, name)
    194 except AttributeError:

AttributeError: 'Array' object has no attribute 'item'

During handling of the above exception, another exception occurred:

NotImplementedError                       Traceback (most recent call last)
Cell In[4], line 1
----> 1 da.chunk().item()

File ~/Documents/Work/Code/xarray/xarray/core/ops.py:205, in _values_method_wrapper.<locals>.func(self, *args, **kwargs)
    204 def func(self, *args, **kwargs):
--> 205     return _call_possibly_missing_method(self.data, name, args, kwargs)

File ~/Documents/Work/Code/xarray/xarray/core/ops.py:195, in _call_possibly_missing_method(arg, name, args, kwargs)
    193     method = getattr(arg, name)
    194 except AttributeError:
--> 195     duck_array_ops.fail_on_dask_array_input(arg, func_name=name)
    196     if hasattr(arg, "data"):
    197         duck_array_ops.fail_on_dask_array_input(arg.data, func_name=name)

File ~/Documents/Work/Code/xarray/xarray/core/duck_array_ops.py:79, in fail_on_dask_array_input(values, msg, func_name)
     77 if func_name is None:
     78     func_name = inspect.stack()[1][3]
---> 79 raise NotImplementedError(msg % func_name)

NotImplementedError: 'item' is not yet a valid method on dask arrays
```

You've managed to find a piece of what I think is pretty rarely-used code - can I ask why you're using `.item()` instead of e.g. `.values`?

The error here is indicating the fact that the `.item()` method exists for numpy arrays but does not exist for dask arrays. 

The question is whether calling `.item()` on a dask array should raise an error or whether xarray should coerce the dask array to numpy before calling `.item()`. The argument for the latter would be that `.item()` is defined as returning a python scalar not an array, so it doesn't make sense for it to return a lazy dask array. We could treat `.item()` like `.values` instead, and ensure it always returns an eager python scalar. @shoyer what do you think? Looks like this code hasn't changed since you wrote it in 2015 :sweat_smile:

**@dcherian** (2023-06-13):

IIUC `item` returns a python scalar object and would implicitly compute which is why dask doesn't support it. You can always `.compute().item()`

**@TomNicholas** (2023-06-13):

Right - what I'm saying is that maybe xarray should do that compute for you.

**@eiphione** (2023-06-14):

Thanks for the quick reply.
I started to use .item() and not .values in cases where I like to obtain a scalar, not an array that contains a single value. Mostly this is after calculating a mean or standard deviation. After a brief discussion with collegues this seemed to be the intention of .item() to us. And it worked fine, until I encounterd a case where a dask array was the underlying array.

We also figured out, that .compute().item() works in the specific case, but also came to @TomNicholas conclusion, that most likely this should be handled in the background, so that the API does not break unexpectedly.

Personally I am pretty new to how xarray actually works "under the hood", so I can only speak from a the point of view of a user that most of the timer did not bother about what type of array is actually holding the data.

**@slevang** (2023-06-14):

> Right - what I'm saying is that maybe xarray should do that compute for you.

+1 to this suggestion. I've been bitten by this many times actually, where I want to extract a simple python scalar with `.item()` when moving the results of some computation out of xarray. Everything runs fine, then I go back and modify something upstream to end up with a dask array and the code breaks. I grumpily add a `.compute().item()` and tell myself I'm going to draft a PR for this but never get around to it.

**@dcherian** (2023-06-14):

I'm not too sure. I think we should defer to the underlying array type since they provide `item` like how `.values` defers to the array type's implementation for `np.asarray` (`.values` fails for cupy arrays for example).

`.as_numpy().item()` will always work regardless of array type. Perhaps we add this to the error message and/or docstring.

cc @shoyer

**@slevang** (2023-06-15):

Adding `dask.array.item()` has apparently been an [open PR](https://github.com/dask/dask/pull/3630)  for 5(!) years. Maybe the best option is to push that over the finish line. Although the current thinking there is to return a dask delayed scalar which you still have to call compute on.

From the xarray side the `as_numpy().item()` suggestion should at least be in the docstring.

**@shoyer** (2023-06-15):

I don't think it's a great idea for Xarray operations to implicit compute Dask arrays. We've been very careful to avoid this in the past, because it can result in huge and hard to tract down performance penalties.

I agree with @dcherian and @slevang. We should consider implementing `.item()` in dask (where it will return a delayed scalar), and also should document it on Xarray's `item()` method.

**@eiphione** (2023-06-19):

So should this be done independantly of the open PR for `dask.array.item()` or should it wait to see how it is resolved there? I would be willing to have a go at it here, but after looking at the PR at dask I have to say the structure there is a bit above my head.

**@nightcityblade** (2026-08-18):

Hi, I'd like to work on this. I'll submit a focused documentation PR shortly.

— OpenAI Codex acting on behalf of @nightcityblade
