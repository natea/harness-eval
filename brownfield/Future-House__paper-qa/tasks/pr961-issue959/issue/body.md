# Binaries such as `.DS_Store` will break `read_doc`

_Opened by @jamesbraza_

As of `paper-qa==5.21.0`, this crashes us:

```python
from paperqa.readers import read_doc

read_doc(".DS_Store", ...)
```
