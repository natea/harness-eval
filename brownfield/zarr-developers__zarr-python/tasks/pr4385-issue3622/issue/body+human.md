# Support opening >u1 dtype

_Opened by @dstansby_

### Zarr version

Latest main

### Numcodecs version

Latest

### Python Version

3.12

### Operating System

macOS

### Installation

uv from source

### Description

Trying to open the array at https://uk1s3.embassy.ebi.ac.uk/idr/zarr/v0.4/idr0073A/9798462.zarr/0 errors with

```
Traceback (most recent call last):
  File "/Users/dstansby/software/zarr/zarr-python/test.py", line 6, in <module>
    zarr.open_array("https://uk1s3.embassy.ebi.ac.uk/idr/zarr/v0.4/idr0073A/9798462.zarr/0")
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/api/synchronous.py", line 1392, in open_array
    sync(
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/sync.py", line 159, in sync
    raise return_result
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/sync.py", line 119, in _runner
    return await coro
           ^^^^^^^^^^
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/api/asynchronous.py", line 1282, in open_array
    return await AsyncArray.open(store_path, zarr_format=zarr_format)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/array.py", line 1009, in open
    return cls(store_path=store_path, metadata=_metadata_dict)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/array.py", line 334, in __init__
    metadata_parsed = parse_array_metadata(metadata)
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/array.py", line 194, in parse_array_metadata
    return ArrayV2Metadata.from_dict(data)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/metadata/v2.py", line 164, in from_dict
    dtype = get_data_type_from_json(dtype_spec, zarr_format=2)
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/dtype/__init__.py", line 184, in get_data_type_from_json
    return data_type_registry.match_json(dtype_spec, zarr_format=zarr_format)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/dstansby/software/zarr/zarr-python/src/zarr/core/dtype/registry.py", line 208, in match_json
    raise ValueError(f"No Zarr data type found that matches {data!r}")
ValueError: No Zarr data type found that matches {'name': '>u1', 'object_codec_id': None}
```

### Steps to reproduce

```python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "zarr@git+https://github.com/zarr-developers/zarr-python.git@main",
# ]
# ///
#
# This script automatically imports the development branch of zarr to check for issues

import zarr
zarr.open_array("https://uk1s3.embassy.ebi.ac.uk/idr/zarr/v0.4/idr0073A/9798462.zarr/0")
```

This works with tensorstore fine:

```python
import tensorstore as ts
arr = ts.open({"driver": "zarr", "kvstore": "https://uk1s3.embassy.ebi.ac.uk/idr/zarr/v0.4/idr0073A/9798462.zarr/0"}).result()
print(arr[0, 0, 0, 0, 0].read().result())
```

### Additional output

_No response_

---

## Discussion

**@d-v-b** (2025-12-16):

I am guessing this is zarr data created by a non-python client, because `>u1` is not a data type string that numpy will create. I can put together a fix for this.

**@dstansby** (2025-12-16):

If it's not valid Zarr v2 data that's fine too, and instead I can ask it to be fixed on the metadata end :)

**@d-v-b** (2025-12-16):

the zarr v2 spec isn't very strict about what constitutes a valid data type.  numpy turns `">u1"` into `"|u1"`, which is what we recognize in zarr-python right now. I think it's fine for us to read `>u1` or `<u1` but the owners of that data should probably use `|u1`
