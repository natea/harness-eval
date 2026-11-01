# CLI functionality in Python module

_Opened by @ivanhigueram_

I am loving this library! The README is very through showing the library functions on the CLI. For instance, it shows clearly how to name an index and save it using `pqa -i nanomaterials index`, then we can execute full-text search using `pqa -i nanomaterials search thermoelectrics`. But is not clear to me how to execute the same functionality with the Python module. Can I recreate this by doing something like: 

```python
from paperqa import Settings, ask, search_query

search_query(query="test query", index_name="pqa_index_3cd017b0934549ec2602837942e27025",  index_directory="~/.pqa/indexes/", settings=Settings())
```

I would like some hints on how to name the index and how to execute a search over the index. I would really appreciate your help.
