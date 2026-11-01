# unified runtime type checking for our json data

_Opened by @d-v-b_

Reading array metadata documents means consuming JSON-formatted data and type-checking them. We are doing this in a clunky way right now: for each field `f`, we essentially have a `parse_f` function that checks if the input data is compatible with `f`. 

A big improvement would be unifying the `parse_x` functions into something with the following form:

```python
def check_literal(value, type_annotation) -> type_annotation:
    if value in get_args(type_annotation):
        return value
    raise UsefulException

def parse_union(value, type_annotation) -> type_annotation:
    # check if the value is in the union type, return it if so

def parse_tuple(value, type_annotation) -> type_annotation:
    # check if the value is consistent with the tuple type annotation, return the input as a tuple if so

...

parse_json(value, type_annotation) -> type_annotation:
    # categorize the type annotation into Mapping, tuple, Sequence, union, literal, and call out to the relevant 
    # parsing routine
    # return data 
```

i.e., functions that take a value and a type annotation, and return data assignable to that type annotation or raise a useful exception. In my thinking these are not strict type checks, because these functions are allowed to transform the input, e.g. `parse_tuple([1,2,3], tuple[int, int, int])` would return `(1,2,3)`.

This would remove a _lot_ of redundant code. We would keep the scope narrow by only concerning ourselves with the types relevant for creating array metadata documents, namely:

- primitive types None, str, int, float, bool
- Sequences (they should come out as tuples)
- unions
- TypedDict (essential for handling JSON form of dtypes, codecs, chunk grids, and metadata itself)
- Mapping[str, T], where T is any of the other types in this list

I have have had LLMs whip up implementations of this on like 3 separate occasions, and each time it wasn't more than a few hundred LOC, so I think this would not be a huge maintenance burden.
