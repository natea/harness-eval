# metadata parsing rejects zarr metadata with unknown fields

_Opened by @d-v-b_

We must accept unknown fields that are JSON objects with `"must_understand": false`, per [the spec](https://github.com/zarr-developers/zarr-specs/blob/main/docs/v3/core/index.rst#must_understand)
