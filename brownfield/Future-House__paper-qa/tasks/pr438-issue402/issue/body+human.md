# CLI functionality in Python module

_Opened by @ivanhigueram_

I am loving this library! The README is very through showing the library functions on the CLI. For instance, it shows clearly how to name an index and save it using `pqa -i nanomaterials index`, then we can execute full-text search using `pqa -i nanomaterials search thermoelectrics`. But is not clear to me how to execute the same functionality with the Python module. Can I recreate this by doing something like: 

```python
from paperqa import Settings, ask, search_query

search_query(query="test query", index_name="pqa_index_3cd017b0934549ec2602837942e27025",  index_directory="~/.pqa/indexes/", settings=Settings())
```

I would like some hints on how to name the index and how to execute a search over the index. I would really appreciate your help.

---

## Discussion

**@ivanhigueram** (2024-09-14):

This is good, but how can I use a previous `ask` object index to execute a search? that is the part that is not clear in the documentation. 

In the example you provide, I'd have to add each document individually, but I just want to use the ones used in a previous query (i.e. using `agent_query`) and do everything in Python.

**@ivanhigueram** (2024-09-14):

I guess I can get that from the documentation, but again, this is using the CLI, I want to execute this search in Python.

**@mskarlin** (2024-09-14):

hey @ivanhigueram -- you should be able to find all your indexes in the `PQA_HOME` directory (defaults to `~/.pqa/indexes/`), you can see the names for each of them there. All answers (no matter from where they originated) will go into the `answers` index, which you can also search via the `search_query ` function. In that case, it'll return `Answer` objects with relevant details for each answer. 

If you have several paper indexes, and you're trying to work out which goes with your settings of interest, just make a new `Settings` object with the paper directory and settings that you previously used and then do: `settings.get_index_name()` -- it'll tell you the name of the index.
