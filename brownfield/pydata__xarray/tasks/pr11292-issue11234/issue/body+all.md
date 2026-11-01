# Request a warning for when coord names are ignored when dims are specified

_Opened by @sol-et-stellae_

### What is your issue?

When coords are specified in tuple format, their names are silently ignored when `dims` names are also specified.

The following expression yields a DataArray that retains no reference to the otherwise specified coords of a, b, and c, in favor of the positionally-associated names of `dims`, x, y, and z.

```
DataArray(
    data=[[[1]], [[2]], [[3]]],
    dims=["x", "y", "z"],
    coords=[("a", [5, 6, 7]), ("b", [8]), ("c", [9])]
)
```

The result is:

```
<xarray.DataArray (x: 3, y: 1, z: 1)> Size: 24B
array([[[1]],
       [[2]],
       [[3]]])
Coordinates:
  * x        (x) int64 24B 5 6 7
  * y        (y) int64 8B 8
  * z        (z) int64 8B 9
```

Even though this behavior is documented, I think the user should be warned that the coordinate names do not match the dimension names and have been overridden.

---

## Discussion

**@welcome** (bot) (2026-03-16):

Thanks for opening your first issue here at xarray! Be sure to follow the issue template!
If you have an idea for a solution, we would really welcome a Pull Request with proposed changes.
See the [Contributing Guide](https://docs.xarray.dev/en/latest/contributing.html) for more.
It may take us a while to respond here, but we really value your contribution. Contributors like you help make xarray better.
Thank you!

**@dcherian** (2026-03-17):

That is wild. looks like it just treats it as "`dict.from_items`"
