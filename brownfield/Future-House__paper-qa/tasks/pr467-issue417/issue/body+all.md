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

**@dosubot** (bot) (2024-09-16):

<!-- Greeting -->
Hey @bsvisser 👋, I'm here to help you with any bugs, questions, or contributions. Let's figure this out together!

<!-- Answer -->
The `ImportError: cannot import name 'Settings' from 'paperqa'` could be caused by a circular import issue or a missing import statement. In the `paperqa/settings.py` file, the `Settings` class is defined, but there is no explicit import statement for `Settings` within the same module.

To resolve this, ensure that the `Settings` class is correctly imported if it is defined in another module, or verify that there are no circular import issues. Here is the relevant part of the code where `Settings` is defined:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
```

And the function that uses `Settings`:

```python
def get_settings(config_or_name: MaybeSettings = None) -> Settings:
    if isinstance(config_or_name, Settings):
        return config_or_name
    if config_or_name is None:
        return Settings()
    return Settings.from_name(config_name=config_or_name)
```

Make sure that the `Settings` class is accessible from where you are trying to import it. If `Settings` is defined in `paperqa/settings.py`, you should be able to import it directly:

```python
from paperqa.settings import Settings
```

If the issue persists, check for any circular dependencies that might be causing the import to fail <sup>[[1]](https://github.com/Future-House/paper-qa/blob/main/paperqa/settings.py)</sup>.


<!-- Dosu Comment Footer -->
*To continue talking to [Dosu](https://dosu.dev), mention @dosu.*

**@jamesbraza** (2024-09-19):

Hi @bsvisser , can you please give us the output of `pip list`? I am thinking you don't have `paper-qa` version 5, likely you have v4. The `Settings` object is new in that version.

So you'll want to do something like `pip install paper-qa>=5`. Please let us know how this turns out
