# `group.require_array` is not compatible with new dtypes

_Opened by @d-v-b_

[this line](https://github.com/zarr-developers/zarr-python/blob/c21d1f92f7f2648a4c55b164510c524a951ac11d/src/zarr/core/group.py#L1271) will trigger a failure if you attempt to use a `ZDType` instance, which is incorrect and should be fixed.

cc @TomNicholas
