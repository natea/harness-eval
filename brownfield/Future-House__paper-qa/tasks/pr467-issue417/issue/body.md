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
