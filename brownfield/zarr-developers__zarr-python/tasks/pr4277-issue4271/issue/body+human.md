# handle missing codecs by telling users what package to install to get the codec

_Opened by @d-v-b_

(follows up on discussion in #4269)

for codecs we don't support, but which are supported by known python packages, we should name those packages in the error message that reports our failure to find an implementation for the codec. this means we need a little internal mapping that relates codec names to sets of package names. this mapping would be used to generate an error message like `An implementation for codec <codec name> is not available. Register one explicitly using the codec registry (see <docs page where that's explained>), or install a Python package that registers a codec implementation with zarr. Known packages supporting this codec: <list of packages>"`
