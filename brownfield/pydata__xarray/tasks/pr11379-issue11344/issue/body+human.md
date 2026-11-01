# Load failure (in rain to flood toolkit)

_Opened by @janhec_

### What happened?

a python exception during version check in  function module_available() in xarray/namedarray/utils.py.

### What did you expect to happen?

that the module/toolkit would load

### Minimal Complete Verifiable Example

```Python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "xarray[complete]@git+https://github.com/pydata/xarray.git@main",
# ]
# ///
#
# This script automatically imports the development branch of xarray to check for issues.
# Please delete this header if you have _not_ tested this script with `uv run`!

import xarray as xr
xr.show_versions()
# your reproducer code ...
```

### Steps to reproduce

_No response_

### MVCE confirmation

- [ ] Minimal example — the example is as focused as reasonably possible to demonstrate the underlying issue in xarray.
- [ ] Complete example — the example is self-contained, including all data and the text of any traceback.
- [ ] Verifiable example — the example copy & pastes into an IPython prompt or [Binder notebook](https://mybinder.org/v2/gh/pydata/xarray/main?urlpath=lab/tree/doc/examples/blank_template.ipynb), returning the result.
- [ ] New issue — a search of GitHub Issues suggests this is not a duplicate.
- [ ] Recent environment — the issue occurs with the latest version of xarray and its dependencies.

### Relevant log output

```Python
TypeError: expected string or bytes-like object, got 'NoneType' 
Traceback (most recent call last):
  File "C:\Users/Jan/AppData/Roaming/QGIS/QGIS4\profiles\default/python/plugins\Rain2Flood\processing_provider.py", line 22, in loadAlgorithms
    missing = DependencyManager.check_dependencies()
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users/Jan/AppData/Roaming/QGIS/QGIS4\profiles\default/python/plugins\Rain2Flood\dependency_manager.py", line 19, in check_dependencies
    importlib.import_module(package)
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\importlib\__init__.py", line 90, in import_module
    return _bootstrap._gcd_import(name[level:], package, level)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "", line 1387, in _gcd_import
  File "", line 1360, in _find_and_load
  File "", line 1331, in _find_and_load_unlocked
  File "", line 935, in _load_unlocked
  File "", line 999, in exec_module
  File "", line 488, in _call_with_frames_removed
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\imdlib\__init__.py", line 1, in 
    from imdlib.core import IMD, open_data, get_data
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\imdlib\core.py", line 10, in 
    import xarray as xr
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\__init__.py", line 3, in 
    from xarray import coders, groupers, indexes, testing, tutorial, ufuncs
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\coders.py", line 6, in 
    from xarray.coding.times import CFDatetimeCoder, CFTimedeltaCoder
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\coding\times.py", line 15, in 
    from xarray.coding.common import (
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\coding\common.py", line 8, in 
    from xarray.core import indexing
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\core\indexing.py", line 20, in 
    from xarray.core import duck_array_ops
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\core\duck_array_ops.py", line 27, in 
    from xarray.compat import dask_array_compat, dask_array_ops
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\compat\dask_array_ops.py", line 6, in 
    from xarray.core import dtypes, nputils
  File "C:\PROGRA~1/QGIS 4.0/apps/qgis/./python\qgis\utils.py", line 1084, in _import
    mod = _builtin_import(name, globals, locals, fromlist, level)
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\core\nputils.py", line 15, in 
    if module_available("numpy", minversion="2.0.0.dev0"):
       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\xarray\namedarray\utils.py", line 63, in module_available
    return Version(version) >= Version(minversion)
           ^^^^^^^^^^^^^^^^
  File "C:\PROGRA~1\QGIS 4.0\apps\Python312\Lib\site-packages\packaging\version.py", line 200, in __init__
    match = self._regex.search(version)
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^
TypeError: expected string or bytes-like object, got 'NoneType'
```

### Anything else we need to know?

I changed the function code to:
   ```
 if importlib.util.find_spec(module) is None:
        return False

    if minversion is not None:
        version = importlib.metadata.version(module)

    if version is None:
        return False
    return Version(version) >= Version(minversion)
```

after which the module loaded.

### Environment

<details>



</details>

---

## Discussion

**@headtr1ck** (2026-05-24):

I think we would accept a PR with this change, are you willing to submit one?

But I am not sure if you really want to use carry without numpy? I think that would not get you very far...
