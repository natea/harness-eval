# `zarr.api.asynchronous.open_like` is broken

_Opened by @d-v-b_

[this function](https://github.com/zarr-developers/zarr-python/blob/1264a4d190a0f22a3612e302d41f4413f06edf35/src/zarr/api/asynchronous.py#L1273-L1295) is intended for creating new arrays similar to existing arrays, but it has a few problems, the most significant being that it attempts to invoke `open_array` without passing a `mode` keyword argument, which errors. It's actually hard to tell what `mode=None` does in this context? I think the ultimate behavior might be store-specific, but I suspect it defaults to `r` for memory storage. This means `open_like` can only read existing arrays, which defeats its entire purpose.

We should either fix this function or remove it.
