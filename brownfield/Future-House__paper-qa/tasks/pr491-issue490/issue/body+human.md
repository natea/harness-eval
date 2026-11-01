# path.open AttributeError：str object has no attribute 'open'

_Opened by @fiyen_

In readers.py, parsed_text, the code open a file with its path calling open directly. This happens when the file is not .pdf. As far as I know, the str object can not be opened directly, use open(path, 'r') will be better.

---

## Discussion

**@jamesbraza** (2024-09-27):

Hi @fiyen it's because `parse_text` intakes a `pathlib.Path`, not a `str`. However, it's fine to allow `str` path there, so I will make a PR for that. You will see it in the next release coming tomorrow
