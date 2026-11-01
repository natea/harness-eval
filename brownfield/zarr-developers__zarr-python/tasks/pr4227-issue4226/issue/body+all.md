# consolidated metadata does not capture differently-cased keys

_Opened by @ilan-gold_

### Zarr version

3.3.0

### Numcodecs version

0.16.5

### Python Version

3.14

### Operating System

Mac

### Installation

pip

### Description

Consolidated metadata does not respect case-sensitivity, it seems?

### Steps to reproduce

```python
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "zarr@git+https://github.com/zarr-developers/zarr-python.git@main",
# ]
# ///
#
# This script automatically imports the development branch of zarr to check for issues

import zarr
import numpy as np

z = zarr.open("foo.zarr", mode="w")
z["bar"] = np.array([0, 1])
z["Bar"] = np.array([1, 2])
zarr.consolidate_metadata(z.store)
z = zarr.open_consolidated("foo.zarr")
assert "bar" not in z
z["bar"] # raises error, see issue for traceback
```


### Additional output

This error shows, I think, the problem

<details>

```pytb
/Users/ilangold/Coding/anndata/venv/lib/python3.14/site-packages/zarr/api/asynchronous.py:246: ZarrUserWarning: Consolidated metadata is currently not part in the Zarr format 3 specification. It may not be supported by other zarr implementations and may change in the future.
  warnings.warn(
---------------------------------------------------------------------------
KeyError                                  Traceback (most recent call last)
File ~/Coding/anndata/venv/lib/python3.14/site-packages/zarr/core/group.py:769, in AsyncGroup._getitem_consolidated(self, store_path, key, prefix)
    768 try:
--> 769     metadata = metadata.consolidated_metadata.metadata[indexer]
    770 except KeyError as e:
    771     # The Group Metadata has consolidated metadata, but the key
    772     # isn't present. We trust this to mean that the key isn't in
    773     # the hierarchy, and *don't* fall back to checking the store.

KeyError: 'bar'

The above exception was the direct cause of the following exception:

KeyError                                  Traceback (most recent call last)
Cell In[3], line 10
      8 z = zarr.open_consolidated("foo.zarr")
      9 assert "bar" not in z
---> 10 z["bar"] # raises error

File ~/Coding/anndata/venv/lib/python3.14/site-packages/zarr/core/group.py:1903, in Group.__getitem__(self, path)
   1873 def __getitem__(self, path: str) -> AnyArray | Group:
   1874     """Obtain a group member.
   1875 
   1876     Parameters
   (...)   1901 
   1902     """
-> 1903     obj = self._sync(self._async_group.getitem(path))
   1904     if isinstance(obj, AsyncArray):
   1905         return Array(obj)

File ~/Coding/anndata/venv/lib/python3.14/site-packages/zarr/core/sync.py:199, in SyncMixin._sync(self, coroutine)
    196 def _sync[T](self, coroutine: Coroutine[Any, Any, T]) -> T:
    197     # TODO: refactor this to take *args and **kwargs and pass those to the method
    198     # this should allow us to better type the sync wrapper
--> 199     return sync(
    200         coroutine,
    201         timeout=config.get("async.timeout"),
    202     )

File ~/Coding/anndata/venv/lib/python3.14/site-packages/zarr/core/sync.py:154, in sync(coro, loop, timeout)
    151 return_result = next(iter(finished)).result()
    153 if isinstance(return_result, BaseException):
--> 154     raise return_result
    155 else:
    156     return return_result

File ~/Coding/anndata/venv/lib/python3.14/site-packages/zarr/core/sync.py:114, in _runner(coro)
    109 """
    110 Await a coroutine and return the result of running it. If awaiting the coroutine raises an
    111 exception, the exception will be returned.
    112 """
    113 try:
--> 114     return await coro
    115 except Exception as ex:
    116     return ex

File ~/Coding/anndata/venv/lib/python3.14/site-packages/zarr/core/group.py:731, in AsyncGroup.getitem(self, key)
    729 # Consolidated metadata lets us avoid some I/O operations so try that first.
    730 if self.metadata.consolidated_metadata is not None:
--> 731     return self._getitem_consolidated(store_path, key, prefix=self.name)
    732 try:
    733     return await get_node(
    734         store=store_path.store, path=store_path.path, zarr_format=self.metadata.zarr_format
    735     )

File ~/Coding/anndata/venv/lib/python3.14/site-packages/zarr/core/group.py:775, in AsyncGroup._getitem_consolidated(self, store_path, key, prefix)
    770     except KeyError as e:
    771         # The Group Metadata has consolidated metadata, but the key
    772         # isn't present. We trust this to mean that the key isn't in
    773         # the hierarchy, and *don't* fall back to checking the store.
    774         msg = f"'{key}' not found in consolidated metadata."
--> 775         raise KeyError(msg) from e
    777 # update store_path to ensure that AsyncArray/Group.name is correct
    778 if prefix != "/":

KeyError: "'bar' not found in consolidated metadata."
```
</details>

Raised in https://github.com/scverse/anndata/issues/2576
