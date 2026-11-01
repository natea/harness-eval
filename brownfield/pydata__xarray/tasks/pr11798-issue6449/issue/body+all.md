# query on coords only dataset fails

_Opened by @LunarLanding_

### What happened?

I make a dataset with some variables, and make them all coordinates.
Then I try to query on the dataset. Error ensues.

### What did you expect to happen?

No error.

### Minimal Complete Verifiable Example

```Python
import xarray as xr
import pandas as pd
x = xr.Dataset.from_dataframe(pd.DataFrame(data=[[0,1],[2,3]],columns=['a','b']))
# display(x.query(index='a==0')) #fine
y = x.set_coords(['a','b'])
# display(y) #fine
y.query(index='a==0') #error
```


### Relevant log output

```Python
---------------------------------------------------------------------------
KeyError                                  Traceback (most recent call last)
~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/scope.py in resolve(self, key, is_local)
    199             assert not is_local and not self.has_resolvers
--> 200             return self.scope[key]
    201         except KeyError:

~/miniconda3/lib/python3.9/collections/__init__.py in __getitem__(self, key)
    940                 pass
--> 941         return self.__missing__(key)            # support subclasses that define __missing__
    942 

~/miniconda3/lib/python3.9/collections/__init__.py in __missing__(self, key)
    932     def __missing__(self, key):
--> 933         raise KeyError(key)
    934 

KeyError: 'a'

During handling of the above exception, another exception occurred:

KeyError                                  Traceback (most recent call last)
~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/scope.py in resolve(self, key, is_local)
    205                 # e.g., df[df > 0]
--> 206                 return self.temps[key]
    207             except KeyError as err:

KeyError: 'a'

The above exception was the direct cause of the following exception:

UndefinedVariableError                    Traceback (most recent call last)
/tmp/ipykernel_23733/4091370488.py in <cell line: 7>()
      5 y = x.set_coords(['a','b'])
      6 display(y)
----> 7 y.query(index='a==0')

~/miniconda3/lib/python3.9/site-packages/xarray/core/dataset.py in query(self, queries, parser, engine, missing_dims, **queries_kwargs)
   7605 
   7606         # evaluate the queries to create the indexers
-> 7607         indexers = {
   7608             dim: pd.eval(expr, resolvers=[self], parser=parser, engine=engine)
   7609             for dim, expr in queries.items()

~/miniconda3/lib/python3.9/site-packages/xarray/core/dataset.py in <dictcomp>(.0)
   7606         # evaluate the queries to create the indexers
   7607         indexers = {
-> 7608             dim: pd.eval(expr, resolvers=[self], parser=parser, engine=engine)
   7609             for dim, expr in queries.items()
   7610         }

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/eval.py in eval(expr, parser, engine, truediv, local_dict, global_dict, resolvers, level, target, inplace)
    348         )
    349 
--> 350         parsed_expr = Expr(expr, engine=engine, parser=parser, env=env)
    351 
    352         # construct the engine and evaluate the parsed expression

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in __init__(self, expr, engine, parser, env, level)
    809         self.parser = parser
    810         self._visitor = PARSERS[parser](self.env, self.engine, self.parser)
--> 811         self.terms = self.parse()
    812 
    813     @property

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in parse(self)
    828         Parse an expression.
    829         """
--> 830         return self._visitor.visit(self.expr)
    831 
    832     @property

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit(self, node, **kwargs)
    413         method = "visit_" + type(node).__name__
    414         visitor = getattr(self, method)
--> 415         return visitor(node, **kwargs)
    416 
    417     def visit_Module(self, node, **kwargs):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit_Module(self, node, **kwargs)
    419             raise SyntaxError("only a single expression is allowed")
    420         expr = node.body[0]
--> 421         return self.visit(expr, **kwargs)
    422 
    423     def visit_Expr(self, node, **kwargs):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit(self, node, **kwargs)
    413         method = "visit_" + type(node).__name__
    414         visitor = getattr(self, method)
--> 415         return visitor(node, **kwargs)
    416 
    417     def visit_Module(self, node, **kwargs):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit_Expr(self, node, **kwargs)
    422 
    423     def visit_Expr(self, node, **kwargs):
--> 424         return self.visit(node.value, **kwargs)
    425 
    426     def _rewrite_membership_op(self, node, left, right):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit(self, node, **kwargs)
    413         method = "visit_" + type(node).__name__
    414         visitor = getattr(self, method)
--> 415         return visitor(node, **kwargs)
    416 
    417     def visit_Module(self, node, **kwargs):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit_Compare(self, node, **kwargs)
    721             op = self.translate_In(ops[0])
    722             binop = ast.BinOp(op=op, left=node.left, right=comps[0])
--> 723             return self.visit(binop)
    724 
    725         # recursive case: we have a chained comparison, a CMP b CMP c, etc.

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit(self, node, **kwargs)
    413         method = "visit_" + type(node).__name__
    414         visitor = getattr(self, method)
--> 415         return visitor(node, **kwargs)
    416 
    417     def visit_Module(self, node, **kwargs):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit_BinOp(self, node, **kwargs)
    534 
    535     def visit_BinOp(self, node, **kwargs):
--> 536         op, op_class, left, right = self._maybe_transform_eq_ne(node)
    537         left, right = self._maybe_downcast_constants(left, right)
    538         return self._maybe_evaluate_binop(op, op_class, left, right)

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in _maybe_transform_eq_ne(self, node, left, right)
    454     def _maybe_transform_eq_ne(self, node, left=None, right=None):
    455         if left is None:
--> 456             left = self.visit(node.left, side="left")
    457         if right is None:
    458             right = self.visit(node.right, side="right")

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit(self, node, **kwargs)
    413         method = "visit_" + type(node).__name__
    414         visitor = getattr(self, method)
--> 415         return visitor(node, **kwargs)
    416 
    417     def visit_Module(self, node, **kwargs):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/expr.py in visit_Name(self, node, **kwargs)
    547 
    548     def visit_Name(self, node, **kwargs):
--> 549         return self.term_type(node.id, self.env, **kwargs)
    550 
    551     def visit_NameConstant(self, node, **kwargs):

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/ops.py in __init__(self, name, env, side, encoding)
     96         tname = str(name)
     97         self.is_local = tname.startswith(LOCAL_TAG) or tname in DEFAULT_GLOBALS
---> 98         self._value = self._resolve_name()
     99         self.encoding = encoding
    100 

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/ops.py in _resolve_name(self)
    113 
    114     def _resolve_name(self):
--> 115         res = self.env.resolve(self.local_name, is_local=self.is_local)
    116         self.update(res)
    117 

~/miniconda3/lib/python3.9/site-packages/pandas/core/computation/scope.py in resolve(self, key, is_local)
    209                 from pandas.core.computation.ops import UndefinedVariableError
    210 
--> 211                 raise UndefinedVariableError(key, is_local) from err
    212 
    213     def swapkey(self, old_key: str, new_key: str, new_value=None) -> None:

UndefinedVariableError: name 'a' is not defined
```


### Anything else we need to know?

If the dataset has one data variable, then the error does not happen.

### Environment

INSTALLED VERSIONS
------------------
commit: None
python: 3.9.12 | packaged by conda-forge | (main, Mar 24 2022, 23:25:59) 
[GCC 10.3.0]
python-bits: 64
OS: Linux
OS-release: 4.19.0-19-amd64
machine: x86_64
processor: 
byteorder: little
LC_ALL: None
LANG: en_US.UTF-8
LOCALE: ('en_US', 'UTF-8')
libhdf5: 1.12.1
libnetcdf: 4.8.1

xarray: 2022.3.0
pandas: 1.4.1
numpy: 1.22.3
scipy: 1.8.0
netCDF4: 1.5.8
pydap: None
h5netcdf: 1.0.0
h5py: 3.6.0
Nio: None
zarr: 2.11.1
cftime: 1.5.2
nc_time_axis: None
PseudoNetCDF: None
rasterio: None
cfgrib: None
iris: None
bottleneck: None
dask: 2022.03.0
distributed: 2022.3.0
matplotlib: 3.5.1
cartopy: None
seaborn: 0.11.2
numbagg: None
fsspec: 2022.02.0
cupy: None
pint: 0.18
sparse: 0.13.0
setuptools: 59.8.0
pip: 22.0.4
conda: 4.12.0
pytest: 7.1.1
IPython: 7.32.0
sphinx: None

---

## Discussion

**@max-sixty** (2022-04-14):

This does look like a bug, here's another case:

```python
In [78]:
    ...: >>> a = np.arange(0, 5, 1)
    ...: >>> b = np.linspace(0, 1, 5)
    ...: >>> ds = xr.Dataset({"a": ("x", a), "b": ("x", b)})
    ...: >>> ds
Out[78]:
<xarray.Dataset>
Dimensions:  (x: 5)
Dimensions without coordinates: x
Data variables:
    a        (x) int64 0 1 2 3 4
    b        (x) float64 0.0 0.25 0.5 0.75 1.0

In [79]: ds.query(x="a > 2")
Out[79]:
<xarray.Dataset>
Dimensions:  (x: 2)
Dimensions without coordinates: x
Data variables:
    a        (x) int64 3 4
    b        (x) float64 0.75 1.0

In [80]: ds.set_coords('a').query(x="a > 2")
Out[80]:
<xarray.Dataset>
Dimensions:  (x: 2)
Coordinates:
    a        (x) int64 3 4
Dimensions without coordinates: x
Data variables:
    b        (x) float64 0.75 1.0

In [81]: ds.set_coords(['a','b']).query(x="a > 2")

# fails
```
