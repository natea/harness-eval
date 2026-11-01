# Add a `.to_polars_df()` method (very similar to `.to_dataframe()`, which implicitly uses pandas)

_Opened by @DeflateAwning_

### Is your feature request related to a problem?

Pandas is much less performant, and is decreasingly used in new projects. It would be awesome to be able to move data out of xarray and into Polars directly, without jumping through Pandas. 

### Describe the solution you'd like

Add a `.to_polars_df()` method (very similar to `.to_dataframe()`, which implicitly uses pandas)

### Describe alternatives you've considered

You currently have to do:

```python
import polars as pl

pl.from_pandas(da.to_dataframe())`
```

This is slower than it could be if there was a directly-to-polars method.

### Additional context

I'd even consider renaming the `.to_dataframe()` method to `.to_pandas_df()`. Suggesting that the main/default dataframe is Pandas seems a little strange in the 2025 data analysis ecosystem.

---

## Discussion

**@max-sixty** (2025-03-16):

What would the method do internally which would be faster than going through pandas? No objection per se, but there would need to be some benefit from adding the method...

**@DeflateAwning** (2025-03-17):

I'm not too certain _exactly_ what the current mechanisms look like, but I do know there is an opportunity for improvement as converting to ~~Python~~ _Pandas_ is not a zero-cost operation. 

Other cross-compatible libraries (e.g., DuckDB) have separate methods for to-pandas vs to-polars, suggesting that there are benefits (_i.e., performance benefits). 

I believe there is a sort of dataframe-library-agnostic dataframe specification (something about `__dataframe__` maybe) which may be effective for this.

**@max-sixty** (2025-03-17):

OK, feel free to post more details when you / someone else has them. We can leave this open for a while; eventually would suggest closing until we have some legible benefit

**@DocOtak** (2025-03-17):

@DeflateAwning Here is the dataframe interchange protocol spec: https://data-apis.org/dataframe-protocol/latest/index.html

I'm also interested in polars dataframe support in xarray.

**@DeflateAwning** (2025-03-17):

> OK, feel free to post more details when you / someone else has them. We can leave this open for a while; eventually would suggest closing until we have some legible benefit

Oh, sorry that wasn't clear. The obvious benefit is performance. The secondary benefit is avoiding Pandas; it is rightfully deamed legacy tech in all organizations I work with. 

Thanks @DocOtak - that's exactly what I was talking about.

**@max-sixty** (2025-03-18):

> The obvious benefit is performance.

OK, I'm not saying this isn't valid, but I am asking how it would be meaningfully more performant. An example showing the improvement would be great...

The spec looks interesting, thanks for posting. I don't see it covering _creating_ a dataframe though...

**@TomNicholas** (2025-03-18):

I have to agree with @max-sixty - the question is not whether polars is faster / better than pandas in general (I believe you), but whether an `xarray.DataArray().to_polars_df()` method can ever be faster than `pl.from_pandas(da.to_dataframe())`, and if it actually is faster today.

**@max-sixty** (2025-03-25):

please feel free to reopen with some empirics on performance improvements (on this specific method; we def believe polars is generally faster than pandas...)

**@DeflateAwning** (2025-03-25):

Sorry, you want me to implement this and then do a performance test? Then, you'll decide if it's worth implementing?

**@max-sixty** (2025-03-25):

anything that gives us some empirical data that this is worth a new method. that could be a full implementation, it could be something as simple as a comparison of creating a dataframe from an numpy array

is that reasonable?

**@TomNicholas** (2025-03-25):

>  you want me to implement this [...] Then, you'll decide if it's worth implementing?

For context, the reason @max-sixty is asking is because adding the method to xarray incurs a longer-term maintenance cost (borne by us, the maintainers), not just the one-time cost of implementation. Sorry if that seems annoying, but we have to be judicious about adding more API surface otherwise eventually the result is a sprawling unmaintainable mess.

**@DeflateAwning** (2025-03-25):

Here's a preliminary benchmark I did. You'll see that it is actually slower. Then I realized it's because a numpy array, as created, is a row-based store and not a columnar store:  https://gist.github.com/DeflateAwning/2751ffa05bc74bad8e19d4a76c6ef8c5 [tl;dr: this benchmark is not representative; don't look at it]

So I redid the benchmarks and created this columnar benchmark version: https://gist.github.com/DeflateAwning/dd19fd9089e7529b6d26322c4aed042d

As you can see, the columnar benchmark version (which I assume more closely mimics how xarray stores the data, roughly) has significantly better performance (380 ms vs. 0.7ms, in the most extreme case).

**@max-sixty** (2025-03-25):

nice! thanks for doing that.

one question: if we turn `rechunk=False`, then the effect seems to go away:

<details>

```python

[ins] In [5]: import numpy as np
         ...: import pandas as pd
         ...: import polars as pl
         ...: import timeit
         ...:
         ...: # Array shapes to test
         ...: shapes = [
         ...:     (10_000, 10),
         ...:     (10_000, 200),
         ...:     (100_000, 10),
         ...:     (100_000, 200),
         ...:     (1_000_000, 10),
         ...:     (1_000_000, 200),
         ...:     (10_000_000, 10),
         ...: ]
         ...:
         ...: REPEATS = 5
         ...:
         ...:
         ...: def time_numpy_to_polars(arr):
         ...:     def fn():
         ...:         df_pl = pl.from_numpy(arr, schema=[f"col{i}" for i in range(arr.shape[1])])
         ...:         assert df_pl.height > 1000
         ...:         assert len(df_pl.columns) in (10, 200)
         ...:         return df_pl
         ...:
         ...:     return timeit.timeit(fn, number=REPEATS) / REPEATS
         ...:
         ...:
         ...: def time_numpy_to_pandas_to_polars(arr):
         ...:     def fn():
         ...:         df = pd.DataFrame(arr, columns=[f"col{i}" for i in range(arr.shape[1])])
         ...:         df_pl = pl.from_pandas(df, rechunk=False)
         ...:         assert df_pl.height > 1000
         ...:         assert len(df_pl.columns) in (10, 200)
         ...:         del df
         ...:         return df_pl
         ...:
         ...:     return timeit.timeit(fn, number=REPEATS) / REPEATS
         ...:
         ...:
         ...: def benchmark():
         ...:     print(f"{'Shape':>15} | {'NumPy → Polars':>18} | {'NumPy → Pandas → Polars':>26}")
         ...:     print("-" * 65)
         ...:
         ...:     for shape in shapes:
         ...:         arr1 = np.random.rand(*shape)
         ...:         t_np_pd_polars = time_numpy_to_pandas_to_polars(arr1)
         ...:         del arr1
         ...:
         ...:         arr2 = np.random.rand(*shape)
         ...:         t_np_polars = time_numpy_to_polars(arr2)
         ...:         del arr2
         ...:
         ...:         print(f"{str(shape):>15} | {t_np_polars:>18.6f} s | {t_np_pd_polars:>26.6f} s")
         ...:
         ...:
         ...: for _ in range(5):
         ...:     benchmark()
          Shape |     NumPy → Polars |    NumPy → Pandas → Polars
-----------------------------------------------------------------
    (10000, 10) |           0.000210 s |                   0.002136 s
   (10000, 200) |           0.004562 s |                   0.017994 s
   (100000, 10) |           0.002282 s |                   0.004272 s
  (100000, 200) |           0.056629 s |                   0.043034 s
  (1000000, 10) |           0.019926 s |                   0.012140 s
 (1000000, 200) |           1.040867 s |                   0.352806 s
 (10000000, 10) |           0.203197 s |                   0.127347 s
          Shape |     NumPy → Polars |    NumPy → Pandas → Polars
-----------------------------------------------------------------
    (10000, 10) |           0.000214 s |                   0.002998 s
   (10000, 200) |           0.005002 s |                   0.020305 s
   (100000, 10) |           0.002292 s |                   0.004627 s
  (100000, 200) |           0.053998 s |                   0.042060 s
  (1000000, 10) |           0.022816 s |                   0.011790 s
 (1000000, 200) |           1.042097 s |                   0.346280 s
 (10000000, 10) |           0.208075 s |                   0.127311 s
          Shape |     NumPy → Polars |    NumPy → Pandas → Polars
-----------------------------------------------------------------
    (10000, 10) |           0.000466 s |                   0.004395 s
   (10000, 200) |           0.004703 s |                   0.020835 s
   (100000, 10) |           0.001563 s |                   0.004102 s
  (100000, 200) |           0.052693 s |                   0.046256 s
  (1000000, 10) |           0.021292 s |                   0.013224 s
 (1000000, 200) |           1.052150 s |                   0.345346 s
 (10000000, 10) |           0.204095 s |                   0.129334 s
          Shape |     NumPy → Polars |    NumPy → Pandas → Polars
-----------------------------------------------------------------
    (10000, 10) |           0.000628 s |                   0.003400 s
   (10000, 200) |           0.003552 s |                   0.020649 s
   (100000, 10) |           0.001446 s |                   0.003422 s
  (100000, 200) |           0.056508 s |                   0.045235 s
  (1000000, 10) |           0.023728 s |                   0.012902 s
 (1000000, 200) |           1.062767 s |                   0.341092 s
 (10000000, 10) |           0.219106 s |                   0.149330 s
          Shape |     NumPy → Polars |    NumPy → Pandas → Polars
-----------------------------------------------------------------
    (10000, 10) |           0.000442 s |                   0.003436 s
   (10000, 200) |           0.004077 s |                   0.017220 s
   (100000, 10) |           0.001618 s |                   0.003177 s
  (100000, 200) |           0.059910 s |                   0.045847 s
  (1000000, 10) |           0.020943 s |                   0.015437 s
 (1000000, 200) |           1.066620 s |                   0.361707 s
 (10000000, 10) |           0.208172 s |                   0.131291 s
```

</details>

are we confident that the resulting polars arrays are identically laid out between each comparison? can we add a check for that?

for context: I really don't want to seem overly skeptical — I'm a big fan of polars, and xarray would be keen to add modest features to allow better support. but I don't have a good theory for how pandas is adding overhead for array construction assuming it's laid out the same between pandas and polars (which might not be the case, hence the difference, in particular if polars supports row-major storage?)

**@dcherian** (2025-03-25):

I believe the key difference here (at least theoretically) is the index creation? That MultiIndex can be quite large, and slow to build IME.

So for API perhaps we can accept `create_index: bool, dataframe_constructor: Callable`? Assuming the constructors are compatible, looks like we just pass in a dict to `pd.DataFrame`

**@DocOtak** (2025-03-26):

@max-sixty 
> The spec looks interesting, thanks for posting. I don't see it covering creating a dataframe though...

I think the intent is the the producing libraries (e.g. xarray) don't make the dataframe themselves, but provide an interface for dataframe libraries like pandas and polars to consume.

In pandas it would be this: https://pandas.pydata.org/docs/reference/api/pandas.api.interchange.from_dataframe.html
In polars it is this: https://docs.pola.rs/api/python/stable/reference/api/polars.from_dataframe.html

**@max-sixty** (2025-03-26):

ok interesting, is the suggestion that xarray should implement the dataframe interface?

**@DeflateAwning** (2025-03-26):

I'd say yes - the likely-best way to implement this is with the [Dataframe Interchange Protocol](https://data-apis.org/dataframe-protocol/latest/index.html).

Then, when the next hot dataframe library that uses quantum computing instead of _lame 2025-era multithreading_ comes around, it'll be able to efficiently consume that. 

Adding the `.to_polars()` method is a 1-liner once the Dataframe Interchange Protocol is implemented.

**@max-sixty** (2025-03-26):

does that mean that a dataset / dataarray would be advertising itself as a dataframe, though?

**@keewis** (2025-03-26):

What if instead we added a method that returned an intermediate object defining only the dataframe protocol? With that, the explicit conversion would be something like `pd.DataFrame(ds.to_df())` or `pl.DataFrame(ds.to_df())` (not sure if that's actually how you'd feed dataframe-like objects to `pandas` / `polars`)

**@max-sixty** (2025-03-27):

that sounds ideal @keewis !

**@MarcoGorelli** (2025-03-27):

Definitely interested in going from XArray to Polars without needing pandas as a dependency, but I'd suggest not using the dataframe interchange protocol. pandas core dev Will Ayd wrote about his experiences with it [here](https://willayd.com/leveraging-the-arrow-c-data-interface.html)

> While initially promising, this soon became problematic. [...] After many unexpected segfaults, I started to grow weary of this solution.
> it only talks about how to consume data, but offers no guidance on how to produce it. If starting from your extension, you have no tools or library to manually build buffers. Much like the [status quo](https://willayd.com/leveraging-the-arrow-c-data-interface.html#status-quo), this meant reading from a Hyper database to a pandas DataFrame would likely be going through Python objects.

Furthermore, based on [my own experience trying to fixup the interchange protocol implementation in pandas](https://github.com/pandas-dev/pandas/issues/57643), my suggestion is to never use it for anything.

Instead, you may want to look at the [PyCapsule Interface](https://arrow.apache.org/docs/format/CDataInterface/PyCapsuleInterface.html). Continuing on from Will's blog post:

> After stumbling around the DataFrame Protocol Interface for a few weeks, [Joris Van den Bossche](https://jorisvandenbossche.github.io/pages/about.html) [another pandas core dev] asked me why I didn’t look at the [Arrow C Data Interface](https://arrow.apache.org/docs/format/CDataInterface.html). [...]. Almost immediately my issues went away. I felt more confident in the implementation and had to deal with less memory corruption / crashes than before. And, perhaps most importantly, I saved a lot of time.

@kylebarron is one of the leading advocates for PyCapsule Interface (https://github.com/apache/arrow/issues/39195) and expert in geospatial data science, and so might be good loop in here. Reckon XArray is a good candidate to export a PyCapsule object which dataframe libraries could consume?

**@kylebarron** (2025-03-27):

I agree that I would dissuade you from trying to implement the dataframe interchange protocol and would encourage adoption of the Arrow PyCapsule Interface.

> What would the method do internally which would be faster than going through pandas? No objection per se, but there would need to be some benefit from adding the method...

This is also not clear to me. I don't know xarray internals that well; I thought xarray uses pandas as a required dependency, and so I figure that most xarray data is stored in a pandas `DataFrame` or `Series`? Then I figure the fastest (and simplest to implement) way to convert xarray to polars would be to reuse pandas' implementation of the PyCapsule Interface.

Pandas has implemented PyCapsule Interface export for a little while. https://github.com/pandas-dev/pandas/pull/56587, https://github.com/pandas-dev/pandas/issues/59518

**@max-sixty** (2025-03-27):

> I thought xarray uses pandas as a required dependency, and so I figure that most xarray data is stored in a pandas `DataFrame` or `Series`?

xarray currently has a required pandas dependency for its indexing. the standard backend is a numpy array

**@kylebarron** (2025-03-27):

Seems like your options are either:

- implement a specific numpy -> polars implementation for `to_polars_df`
- implement a generic DataFrame Interchange Protocol backend on top of how you store numpy data.
- implement a generic Arrow PyCapsule Interface integration. This would require some Arrow backend, such as pandas' default pyarrow backend. However pyarrow is a massive dependency, which has some downsides. I wrote https://github.com/kylebarron/arro3 as a much smaller Arrow implementation, which you might be able to use to convert numpy data to Arrow.

**@max-sixty** (2025-03-27):

> implement a generic Arrow PyCapsule Interface integration. This would require some Arrow backend, such as pandas' default pyarrow backend. However pyarrow is a massive dependency...

if someone wants to take this on, we could have `pyarrow` as an optional dependency, that could work. it's optional for polars & pandas

but pandas itself seem like a satisfactory interchange format! whether or not the initially encouraging results are driven by alignment vs. real determines whether there's a perf improvement

**@DeflateAwning** (2025-03-28):

Pandas uses "nan" to represent nulls in string columns. It is a prime example of hacking things together. It is an awful interchange format. 

Why not make Polars the interchange format.

**@kylebarron** (2025-03-28):

Arrow makes more sense than Polars to be an interchange format. It's explicitly designed as such, and is already used under the hood in Polars.

**@vladidobro** (2025-07-31):

Hi!

I too think that in the long run, the best solution would be to implement `Dataset.to_arrow() -> arro3-backed object implementing PyCapsule`. However, given the tight integration of xarray with pandas, I think the best solution for now would be to allow `Dataset.to_dataframe()` to return an pyarrow-backed `pandas.DataFrame` in the most optimal way possible for further processing in polars/duckdb.

Taking this for an example to understand how `.to_dataframe()` works:
```py
import xarray as xr
from pprint import pp

ds = xr.tutorial.load_dataset('air_temperature')
print('-'*20+'\nDataset:\n')
pp(ds)

df = ds.to_dataframe()
print('-'*20+'\nDataframe:\n')
pp(df)

print('-'*20+'\nDataframe index:\n')
pp(df.index)

print('-'*20+'\nDataframe index levels:\n')
pp(df.index.levels)

print('-'*20+'\nDataframe index codes:\n')
pp(df.index.codes)
```

Results in
```
--------------------
Dataset:

<xarray.Dataset> Size: 31MB
Dimensions:  (lat: 25, time: 2920, lon: 53)
Coordinates:
  * lat      (lat) float32 100B 75.0 72.5 70.0 67.5 65.0 ... 22.5 20.0 17.5 15.0
  * lon      (lon) float32 212B 200.0 202.5 205.0 207.5 ... 325.0 327.5 330.0
  * time     (time) datetime64[ns] 23kB 2013-01-01 ... 2014-12-31T18:00:00
Data variables:
    air      (time, lat, lon) float64 31MB 241.2 242.5 243.5 ... 296.2 295.7
Attributes:
    Conventions:  COARDS
    title:        4x daily NMC reanalysis (1948)
    description:  Data is from NMC initialized reanalysis\n(4x/day).  These a...
    platform:     Model
    references:   http://www.esrl.noaa.gov/psd/data/gridded/data.ncep.reanaly...
--------------------
Dataframe:

                                   air
lat  time                lon
75.0 2013-01-01 00:00:00 200.0  241.20
                         202.5  242.50
                         205.0  243.50
                         207.5  244.00
                         210.0  244.10
...                                ...
15.0 2014-12-31 18:00:00 320.0  297.39
                         322.5  297.19
                         325.0  296.49
                         327.5  296.19
                         330.0  295.69

[3869000 rows x 1 columns]
--------------------
Dataframe index:

MultiIndex([(75.0, '2013-01-01 00:00:00', 200.0),
            (75.0, '2013-01-01 00:00:00', 202.5),
            (75.0, '2013-01-01 00:00:00', 205.0),
            (75.0, '2013-01-01 00:00:00', 207.5),
            (75.0, '2013-01-01 00:00:00', 210.0),
            (75.0, '2013-01-01 00:00:00', 212.5),
            (75.0, '2013-01-01 00:00:00', 215.0),
            (75.0, '2013-01-01 00:00:00', 217.5),
            (75.0, '2013-01-01 00:00:00', 220.0),
            (75.0, '2013-01-01 00:00:00', 222.5),
            ...
            (15.0, '2014-12-31 18:00:00', 307.5),
            (15.0, '2014-12-31 18:00:00', 310.0),
            (15.0, '2014-12-31 18:00:00', 312.5),
            (15.0, '2014-12-31 18:00:00', 315.0),
            (15.0, '2014-12-31 18:00:00', 317.5),
            (15.0, '2014-12-31 18:00:00', 320.0),
            (15.0, '2014-12-31 18:00:00', 322.5),
            (15.0, '2014-12-31 18:00:00', 325.0),
            (15.0, '2014-12-31 18:00:00', 327.5),
            (15.0, '2014-12-31 18:00:00', 330.0)],
           names=['lat', 'time', 'lon'], length=3869000)
--------------------
Dataframe index levels:

FrozenList([[75.0, 72.5, 70.0, 67.5, 65.0, 62.5, 60.0, 57.5, 55.0, 52.5, 50.0, 47.5, 45.0, 42.5, 40.0, 37.5, 35.0, 32.5, 30.0, 27.5, 25.0, 22.5, 20.0, 17.5, 15.0], [2013-01-01 00:00:00, 2013-01-01 06:00:00, 2013-01-01 12:00:00, 2013-01-01 18:00:00, 2013-01-02 00:00:00, 2013-01-02 06:00:00, 2013-01-02 12:00:00, 2013-01-02 18:00:00, 2013-01-03 00:00:00, 2013-01-03 06:00:00, 2013-01-03 12:00:00, 2013-01-03 18:00:00, 2013-01-04 00:00:00, 2013-01-04 06:00:00, 2013-01-04 12:00:00, 2013-01-04 18:00:00, 2013-01-05 00:00:00, 2013-01-05 06:00:00, 2013-01-05 12:00:00, 2013-01-05 18:00:00, 2013-01-06 00:00:00, 2013-01-06 06:00:00, 2013-01-06 12:00:00, 2013-01-06 18:00:00, 2013-01-07 00:00:00, 2013-01-07 06:00:00, 2013-01-07 12:00:00, 2013-01-07 18:00:00, 2013-01-08 00:00:00, 2013-01-08 06:00:00, 2013-01-08 12:00:00, 2013-01-08 18:00:00, 2013-01-09 00:00:00, 2013-01-09 06:00:00, 2013-01-09 12:00:00, 2013-01-09 18:00:00, 2013-01-10 00:00:00, 2013-01-10 06:00:00, 2013-01-10 12:00:00, 2013-01-10 18:00:00, 2013-01-11 00:00:00, 2013-01-11 06:00:00, 2013-01-11 12:00:00, 2013-01-11 18:00:00, 2013-01-12 00:00:00, 2013-01-12 06:00:00, 2013-01-12 12:00:00, 2013-01-12 18:00:00, 2013-01-13 00:00:00, 2013-01-13 06:00:00, 2013-01-13 12:00:00, 2013-01-13 18:00:00, 2013-01-14 00:00:00, 2013-01-14 06:00:00, 2013-01-14 12:00:00, 2013-01-14 18:00:00, 2013-01-15 00:00:00, 2013-01-15 06:00:00, 2013-01-15 12:00:00, 2013-01-15 18:00:00, 2013-01-16 00:00:00, 2013-01-16 06:00:00, 2013-01-16 12:00:00, 2013-01-16 18:00:00, 2013-01-17 00:00:00, 2013-01-17 06:00:00, 2013-01-17 12:00:00, 2013-01-17 18:00:00, 2013-01-18 00:00:00, 2013-01-18 06:00:00, 2013-01-18 12:00:00, 2013-01-18 18:00:00, 2013-01-19 00:00:00, 2013-01-19 06:00:00, 2013-01-19 12:00:00, 2013-01-19 18:00:00, 2013-01-20 00:00:00, 2013-01-20 06:00:00, 2013-01-20 12:00:00, 2013-01-20 18:00:00, 2013-01-21 00:00:00, 2013-01-21 06:00:00, 2013-01-21 12:00:00, 2013-01-21 18:00:00, 2013-01-22 00:00:00, 2013-01-22 06:00:00, 2013-01-22 12:00:00, 2013-01-22 18:00:00, 2013-01-23 00:00:00, 2013-01-23 06:00:00, 2013-01-23 12:00:00, 2013-01-23 18:00:00, 2013-01-24 00:00:00, 2013-01-24 06:00:00, 2013-01-24 12:00:00, 2013-01-24 18:00:00, 2013-01-25 00:00:00, 2013-01-25 06:00:00, 2013-01-25 12:00:00, 2013-01-25 18:00:00, ...], [200.0, 202.5, 205.0, 207.5, 210.0, 212.5, 215.0, 217.5, 220.0, 222.5, 225.0, 227.5, 230.0, 232.5, 235.0, 237.5, 240.0, 242.5, 245.0, 247.5, 250.0, 252.5, 255.0, 257.5, 260.0, 262.5, 265.0, 267.5, 270.0, 272.5, 275.0, 277.5, 280.0, 282.5, 285.0, 287.5, 290.0, 292.5, 295.0, 297.5, 300.0, 302.5, 305.0, 307.5, 310.0, 312.5, 315.0, 317.5, 320.0, 322.5, 325.0, 327.5, 330.0]])
--------------------
Dataframe index codes:

FrozenList([[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ...], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, ...]])
```

In short the way I understand the current implementation (I may be wrong):
- the dataset holds both data variables and coordinates as multidimensional numpy arrays
- string data in xarray are stored as numpy 'S*' and 'U*' dtypes, but can be optionally stored as pandas extension dtypes
- during .to_dataframe(), the data variables are flattened into 1-D numpy arrays (I am not sure what exactly happens to extension arrays)
- the dimension arrays need to be repeated/tiled in the result, because each row needs to hold it's dimension values. This is achieved by creating a pandas.MultiIndex, which doesn't repeat the data, but instead stores the original dimension arrays in `index.levels` without repeating, and a meshgrid of indices in `index.codes` (see above), which is akin to dictionary encoding. Obviously it also creates some Index on top of these.
- If the dimension arrays are needed as actual columns, `df.reset_index()` must be called, which does the heavy work of tiling the arrays into a contiguous array


All in all I think the inefficiencies of the current approach (xr.Dataset -> pd.DataFrame (numpy-backed) -> anything arrow-backed)) boil down to
1. Creating the MultiIndex even if we don't care about it
2. Numpy string types ('<U10' et al) are unnecessarilly converted to object-dtype, only to be then again converted to arrow strings.
3. Tiling the dimension arrays may be done better (by leveraging arrow's Dictionary?)

I will stress that the current implementation of `Dataset.to_dataframe()` already has ready
`data: dict[str, np.ndarray]` for the variables, suitable for passing into `pd.DataFrame(**data)`, and a tuple of np.ndarray levels and codes (indices) for the coordinates, so almost all of the work is done. The only missing piece of creating the pyarrow-backed dataframe in an optimal way is converting these flat 1-D arrays into pyarrow, and creating dictionaries from the levels+indices.

Unfortunately, pandas doesn't seem to have any utility function, like `pd.Series(array, dtype_backend='pyarrow')` that would infer the correct arrow dtype, there is only `pd.Series(array, dtype='string[pyarrow]')`, but that would mean we would have to maintain our own mapping from numpy to arrow dtypes. But surely there is already some ready solution to this.

What would you suggest @kylebarron, for a solution that would require minimal maintenance of the numpy->arrow convertion on xarray's side?

**@MarcoGorelli** (2025-07-31):

> Unfortunately, pandas doesn't seem to have any utility function, like pd.Series(array, dtype_backend='pyarrow') that would infer the correct arrow dtype

as far as I can tell, it can only done after the fact (`pd.Series(array).convert_dtypes(dtype_backend='pyarrow')`)

> I will stress that the current implementation of Dataset.to_dataframe() already has ready
data: dict[str, np.ndarray] for the variables, suitable for passing into pd.DataFrame(**data)

Data in such a format is also accepted by the PyArrow constructor, right? Using that directly would be an improvement over having to go via pandas (even pyarrow-backed)

```python
In [60]: data = {'a': np.array([1,2,3]), 'b': np.array(['foo', 'bar', 'baz'])}

In [61]: pd.DataFrame(data)
Out[61]:
   a    b
0  1  foo
1  2  bar
2  3  baz

In [62]: pa.table(data)
Out[62]:
pyarrow.Table
a: int64
b: string
----
a: [[1,2,3]]
b: [["foo","bar","baz"]]
```

**@jules-ch** (2025-12-08):

Integrating with the Apache Arrow ecosystem would be the best course of action to be able to interoperate with Parquet, Polar, DuckDB.
Although leveraging the current Numpy, Multi index way of encoding Dataset and DataArray and converting back to pyarrow backed dtype feels clunky.

Pyarrow does have Fixed shaped Tensor which could be the perfect ExtensionType for DataArray no ?
https://arrow.apache.org/docs/python/generated/pyarrow.FixedShapeTensorArray.html

Dimensions, coordinates, attributes could be encoded in the metadata of the pyarrow Table so that we can map, columns shape with dimensions.

Going even further, DataArray could be an Extension type of its own with its own metadata serialized using `__arrow_ext_serialize__` `__arrow_ext_deserialize__`, pyarrow allow this.
Dimensions would be serialized, along `attrs` and other xarray internals.

https://arrow.apache.org/docs/python/generated/pyarrow.ExtensionType.html

**@TomNicholas** (2025-12-09):

> Pyarrow does have Fixed shaped Tensor which could be the perfect ExtensionType for DataArray no ?

Is this widely used? Is it consumable by libraries like Polars?

**@alippai** (2025-12-10):

@TomNicholas AFAIK DuckDB, Parquet and Polars supports it. The parquet reading performance is less then perfect, but it works reliably.

What I did in one of the projects is creating the meshgrid / tile / repeat in numpy and then call pyarrow.array(numpy_array). It's by far the most performant method. By doing the Cartesian product on numpy side, the Coordinates and values are converted to numpy, which can have overhead or lose type information compared to pandas, pyarrow types (extension arrays).

The issue for creating convenient pyarrow methods:
https://github.com/apache/arrow/issues/47382

My little experiment to support more data types in the numpy->pyarrow conversion (efficiently):
https://github.com/apache/arrow/pull/48391

**@kylebarron** (2025-12-10):

Polars supports fixed-size lists (they call it Array I think), and they now support extension types, so you can maintain the metadata required by the [Fixed-shape tensor canonical extension type](https://arrow.apache.org/docs/format/CanonicalExtensions.html#fixed-shape-tensor).

(Last I checked, DuckDB does _not_ support a fixed-size list type)

**@alippai** (2025-12-10):

@kylebarron DuckDB has fixed-size list under the name Array: https://duckdb.org/docs/stable/sql/data_types/array and it round-trips with Arrow and Polars

**@jules-ch** (2025-12-10):

With a naive implementation of arrow array protocol on `xr.DataArray`

```python

    def __arrow_array__(self, type=None):
        import pyarrow as pa

        values = self._variable.data
        dims = self._variable.dims
        tensor_type = pa.fixed_shape_tensor(
            value_type=pa.from_numpy_dtype(values.dtype),
            shape=values.shape,
            dim_names=dims,
        )
        total_size = values.size
        flat_values = values.ravel()

        value_array = pa.array(flat_values)
        storage = pa.FixedSizeListArray.from_arrays(value_array, total_size)
        return pa.ExtensionArray.from_storage(tensor_type, storage)
```

```python
import os

import polars as pl
import pyarrow as pa

import xarray as xr

os.environ["POLARS_UNKNOWN_EXTENSION_TYPE_BEHAVIOR"] = "load_as_extension"
ds = xr.tutorial.load_dataset("air_temperature")


arrow_array = pa.array(ds.air)
pl.from_arrow(arrow_array)


extension<arrow.fixed_shape_tensor[value_type=double, shape=[2920,25,53], dim_names=[time,lat,lon]]>
```

Though there isn't much support in polars to explode it to a `pl.Dataframe` but it works 😅

**@dcherian** (2025-12-12):

nice! we'd take a PR for that if you're up for it :)

**@jules-ch** (2025-12-12):

> nice! we'd take a PR for that if you're up for it :)

Maybe a bit early though, I think we can create an issue to discuss how to better integrate better with apache arrow ecosystem. We can leverage the experience of the community members with the format and protocols.

There a lot of use cases that can be discussed there:
- Enabling back and forth processing with zero copy from and to `xarray` core data structure -> think transform with polars, duckdb etc and go back to xarray.
- Support pyarrow array storage support like (dask, numpy at the moment)
- Maybe a Iceberg storage backend, it would be quite similar to Zarr with parquet for file format (They have similar structure)

**@TomNicholas** (2025-12-12):

> Maybe a Iceberg storage backend, it would be quite similar to Zarr with parquet for file format (They have similar structure)

Can you say more about this? I'm also interested in whether we can "virtualize" parquet/iceberg as Zarr (see https://github.com/zarr-developers/VirtualiZarr/issues/441 - might make more sense to discuss over there).

**@jules-ch** (2025-12-17):

I feel like a Iceberg backend could be a nice addition to the ecosystem.
Catalogs can handle and store the partition + metadata stuff with parquet files as the data layer.

Zarr is pretty similar in that regard.

Implementing arrow protocols for Data arrays will also ease serialization to parquet files. We can discuss what's is the best way to serialize data from the parquet later, there are several options between compactness and query-ability.

We could get better integrations with tools that uses parquet files, querying, chunking would be eased quite a lot when offloading / pushing down filters using native libraries that handle this with parquet. I'm not too familiar with how it's done regarding Zarr or dask.

> > Maybe a Iceberg storage backend, it would be quite similar to Zarr with parquet for file format (They have similar structure)
> 
> Can you say more about this? I'm also interested in whether we can "virtualize" parquet/iceberg as Zarr (see https://github.com/zarr-developers/VirtualiZarr/issues/441 - might make more sense to discuss over there).

**@jenchen95** (2026-05-05):

Hi, is there any new progress in  implementing xarray to polars natively?
