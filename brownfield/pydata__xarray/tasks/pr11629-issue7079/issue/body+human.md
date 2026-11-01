# open_mfdataset parallel=True failing with netcdf4 >= 1.6.1

_Opened by @cefect_

### What happened?

When using the `parallel=True` key, `open_mfdataset` fails with `NetCDF: Unknown file format`. Running the same command again (with try+except), or with `parallel=False` executes as expected.

works:
```
xr.open_mfdataset(dirpath +'\\*.nc', parallel=False)
```

works:
```
try:
   xr.open_mfdataset(dirpath +'\\*.nc', parallel=True)
except:
   xr.open_mfdataset(dirpath +'\\*.nc', parallel=True)
```

fails:
```
xr.open_mfdataset(dirpath +'\\*.nc', parallel=True)

[Errno -51] NetCDF: Unknown file format
```

all with ` engine='netcdf4'`
any help is highly appreciated as I'm a bit lost how to investigate this further. 

### What did you expect to happen?

_No response_

### Minimal Complete Verifiable Example

_No response_

### MVCE confirmation

- [X] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [X] Complete example — the example is self-contained, including all data and the text of any traceback.
- [X] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [X] New issue — a search of GitHub Issues suggests this is not a duplicate.

### Relevant log output

_No response_

### Anything else we need to know?

_No response_

### Environment

<details>



</details>

---

## Discussion

**@pnorton-usgs** (2022-09-29):

I ran into this problem yesterday reading netcdf files on our HPC with a known good script and netcdf files. Unfortunately just trying to open the files again in a try..except block did not work for me. Looking back through my environment update history I found that the netcdf4 library had been updated since I'd last successfully run the script. The current version installed was `conda-forge/linux-64::netcdf4-1.6.1-nompi_py39hfaa66c4_100`; I rolled it back to `conda-forge/linux-64::netcdf4-1.6.0-nompi_py39h6ced12a_102`. After the rollback the script started working again without error.

**@ocefpaf** (2022-10-04):

I believe you are hitting https://github.com/Unidata/netcdf4-python/issues/1192

The verdict is not out on that one yet. Your parallelization may not be thread safe, which makes 1.6.1 failures that expected. For now, if you can, downgrade to 1.6.0 or use an engine that is thread safe. Maybe h5netcdf (not sure!)?

**@ocefpaf** (2022-10-04):

Also, you can try:

```python
import dask
dask.config.set(scheduler="single-threaded")
```

That would ensure you don't use threads when reading with netcdf-c (netcdf4).

---
Edit: this is not an xarray problem and I recommend to close this issue and follow up with the one already opened upstream.

**@kthyng** (2022-10-12):

@ocefpaf and all: thank you!  What a mysterious error this has been. Using the workaround 

```
import dask
dask.config.set(scheduler="single-threaded")
```

did indeed avoid the issue for me.

**@ocefpaf** (2022-10-12):

Note that this is not a bug per se, netcdf-c was never thread safe and, when the work around were removed in netcdf4-python, this issue surfaced. The right fix is to disable threads, like in my example above, or to wait for a netcdf-c release that is thread safe. I don't think the work around will be re-added in netcdf4-python.

**@dcherian** (2022-10-12):

> The right fix is to disable threads, like in my example above

This fix will restrict you to serial compute.

You can also parallelize across processes using something like

```python
PBSCluster(
	...,
	cores=1,
	processes=2,
)
```

or `LocalCluster(threads_per_worker=1, ...)`

**@ocefpaf** (2022-10-12):

> This fix will restrict you to serial compute.

I was waiting for someone who do stuff on clusters to comment on that. Thanks! (My workflow is my own laptop only, so I'm quite limited on that front :smile:)

**@dcherian** (2022-10-12):

> My workflow is my own laptop only

Use LocalCluster! ;)

**@dcherian** (2023-01-25):

From https://github.com/conda-forge/netcdf4-feedstock/issues/141: 

> It's on users to manage locking for non-threadsafe resources like netCDF.

@pydata/xarray ~Should we be handling this by default in the netCDF4 backend now?~

EDIT: We already have locks:
https://github.com/pydata/xarray/blob/6e77f5e8942206b3e0ab08c3621ade1499d8235b/xarray/backends/netCDF4_.py#L363-L383

**@jhamman** (2023-01-25):

It would be great if someone could put together a MCVE that reproduces the issue here. We have multiple tests in our test suite that use `open_mfdataset` with `parallel=True`, including [one](https://github.com/pydata/xarray/blob/f128f248f87fe0442c9b213c2772ea90f91d168b/xarray/tests/test_distributed.py#L153) that runs against a distributed scheduler and [one](https://github.com/pydata/xarray/blob/f128f248f87fe0442c9b213c2772ea90f91d168b/xarray/tests/test_backends.py#L3312) that runs against the threaded scheduler, so I'm surprised we're not catching this. In any event, the next step would be to develop a test that that triggers the error so we can sort out a fix.

**@dcherian** (2023-01-25):

> o I'm surprised we're not catching this.

Turns out we're running tests on an older working version ([logs](https://github.com/pydata/xarray/actions/runs/4007135596/jobs/6879584623)) even though  we don't have a pin.
```
netcdf4                   1.6.0           nompi_py310h0a86a1f_103    conda-forge
```

**@keewis** (2023-01-25):

`iris` has the pin in their package metadata

**@trexfeathers** (2023-01-30):

> `iris` has the pin in their package metadata

Note that this will hopefully be removed soon - SciTools/iris#5095 - but the reviewer has been assigned to other urgent work so it's paused right now.

**@jhamman** (2023-01-30):

I've opened #7488 which I think has actually exposed a few other failures. I doubt I'll have much time to put into this issue in the near time so anyone should feel free to jump in here.

**@jhamman** (2023-01-31):

Update: I pushed two new tests to #7488. They are not failing in our test env. If someone that has reported this issue could try running the test suite, that would be super helpful in terms of confirming where the problem lies.

**@jhamman** (2023-03-27):

@cefect, @pnorton-usgs, @kthyng - Is this still an issue for you? If so, could you try to run the xarray test suite in #7079 and report back? We haven't been able to trigger the error reported here so we could use some help running the test suite in an "offending" environment.

**@kthyng** (2023-03-30):

@jhamman Sorry for my delay — I started this the other day and got waylaid. I'll try to get back to it today or tomorrow.

**@kthyng** (2023-03-31):

I was able to reproduce the error with the current version of xarray and then have it work with the new version. Here is what I did:

Make new environment
```
conda create -n test_xarray xarray netcdf4 dask
```

Check version
```
(test_xarray) kthyng@adams ~ % conda list xarray
# packages in environment at /Users/kthyng/miniconda3/envs/test_xarray:
#
# Name                    Version                   Build  Channel
xarray                    2023.3.0           pyhd8ed1ab_0    conda-forge
```

In python:
```
import xarray as xr
urls = ["https://opendap.co-ops.nos.noaa.gov/thredds/dodsC/NOAA/WCOFS/MODELS/2023/03/31/nos.wcofs.2ds.n001.20230331.t03z.nc",
        "https://opendap.co-ops.nos.noaa.gov/thredds/dodsC/NOAA/WCOFS/MODELS/2023/03/31/nos.wcofs.2ds.n002.20230331.t03z.nc"]
xr.open_mfdataset(urls)
``` 
returns the following the first time `xr.open_mfdataset(urls)` is run but the second time it runs fine.
```
OSError: [Errno -70] NetCDF: DAP server error: 'https://opendap.co-ops.nos.noaa.gov/thredds/dodsC/NOAA/WCOFS/MODELS/2023/03/31/nos.wcofs.2ds.n002.20230331.t03z.nc'
```

Next I used the PR version of xarray and reran the code above and then it was able to read in ok on the first try.


Note: after a week or so those files won't work and will have to be updated with something more current but the pattern to use is clear from the file names.

**@jhamman** (2023-04-01):

@kthyng - any difference when running with `parallel=True` vs `parallel=False`?

**@kthyng** (2023-04-03):

@jhamman Yes, using the PR version of xarray, with `parallel=True` I met the error but with `parallel=False` I did not.

**@ocefpaf** (2023-04-03):

@kthyng those files are on a remote server and that may not be the segfault from the original issue here. It may be a server that is not happy with parallel access. Can you try that with local files?

PS: you can also try with `netcdf4<1.6.1` and, if that also fails, it is most likely the server than the issue here.

**@kthyng** (2023-04-03):

Ok I downloaded the two files and indeed there is no error with `parallel=True` nor `parallel=False`.

**@kthyng** (2023-04-03):

I'm not really sure what to think any more — we have had a real, consistent issue that seemed to fit the description of this issue which went away with one of the fixes above (using single threading), but using local files at the moment seems to remove the error even with the current version of xarray and either `parallel` option.
