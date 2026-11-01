# Installation problem: cannot import name from 'paperqa'

_Opened by @bsvisser_

Sorry for the (hopefully) simple question - I'm trying to install paper-qa using mamba and it's giving me an error of not being able to import names. Trying to run the example:
```
from paperqa import Settings, ask

answer = ask(
    "What manufacturing challenges are unique to bispecific antibodies?",
    settings=Settings(temperature=0.5, paper_directory="my_papers"),
)
```
Returns:
``ImportError: cannot import name 'Settings' from 'paperqa' (C:\Users\b\mambaforge\envs\py311\Lib\site-packages\paperqa\__init__.py)``

What could cause this error? Thank you for any help in advance.

---

## Discussion

**@jamesbraza** (2024-09-19):

Hi @bsvisser , can you please give us the output of `pip list`? I am thinking you don't have `paper-qa` version 5, likely you have v4. The `Settings` object is new in that version.

So you'll want to do something like `pip install paper-qa>=5`. Please let us know how this turns out
