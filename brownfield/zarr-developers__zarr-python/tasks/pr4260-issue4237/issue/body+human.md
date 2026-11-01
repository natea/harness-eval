# "ValueError: Input array must be contiguous" when *cast_value* codec next to *transpose* codec

_Opened by @raphaeljolivet_

### Zarr version

v3.3.1.dev3+g976be695

### Numcodecs version

v0.16.5

### Python Version

3.12.11

### Operating System

Debian

### Installation

uv sync

### Description

When combined with the **transpose** codec **cast_value** fails because the array is not continugous.

According to [the specification](https://zarr-specs.readthedocs.io/en/latest/v3/codecs/transpose/),
 the transpose codec is expected to produce "views".

Thus, it should be the responsibility of **every** codec to ensure it makes it contiguous, if needed.

If my interpretation is correct, I will prepare a PR to fix this, with proper unit test.
I guess we should test the behavior on *every* other codec ... 


### Steps to reproduce

```python

def test_enforce_contiguous_arrays() :
    """
    Transpose codec produces non continguous arrays.
    Ensure cast_value make them contiguous before processing.
    """
    data = np.arange(20, dtype=np.float32).reshape(5, 2, 2)

    def make_array(filters):
        return zarr.create_array(
            store=MemoryStore(),
            shape=data.shape,
            dtype=data.dtype,
            chunks=data.shape,
            filters=filters,
            serializer=zarr.codecs.BytesCodec(endian="little"),
            compressors=None,
            zarr_format=3,
        )

    # Cast before tranpose : may fail on read.
    array = make_array([
        zarr.codecs.CastValue(data_type="uint16"),
        zarr.codecs.TransposeCodec(order=(1, 2, 0)),
    ])

    # Write should be ok
    array[:] = data

    # Read may fail
    assert_array_equal(array[:], data)

    # Cast after tranpose : may fail on write
    array = make_array([
        zarr.codecs.TransposeCodec(order=(1, 2, 0)),
        zarr.codecs.CastValue(data_type="uint16"),
    ])

    # Write may fail
    array[:] = data

```
    # Read should be ok
    assert_array_equal(array[:], data)

### Additional output

_No response_

---

## Discussion

**@d-v-b** (2026-08-05):

thanks for the report, this looks like a bug in cast_value. it should be changed to handle non-contiguous arrays.

**@raphaeljolivet** (2026-08-05):

I just did [a PR](https://github.com/zarr-developers/zarr-python/compare/main...raphaeljolivet:zarr-python:bugfix/4237-cast-value-transpose-input-aray-should-be-contiguous)

The "lint" CI fails while prek works fine locally.
I am not sure why.
