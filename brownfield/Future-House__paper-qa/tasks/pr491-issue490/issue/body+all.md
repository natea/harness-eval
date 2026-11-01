# path.open AttributeError：str object has no attribute 'open'

_Opened by @fiyen_

In readers.py, parsed_text, the code open a file with its path calling open directly. This happens when the file is not .pdf. As far as I know, the str object can not be opened directly, use open(path, 'r') will be better.

---

## Discussion

**@dosubot** (bot) (2024-09-27):

<!-- Greeting -->
Hello @fiyen! I'm here to help you with any bugs, questions, or contributions while you wait for a human maintainer. Let's tackle this together!

<!-- Answer -->
To fix the `AttributeError: 'str' object has no attribute 'open'` in `readers.py`, you need to ensure that the `path` parameter is a `Path` object from the `pathlib` module, not a string. The `path.open()` method is available on `Path` objects, not on strings.

Here is the relevant part of the code that needs to be fixed:

```python
def parse_text(
    path: Path, html: bool = False, split_lines: bool = False, use_tiktoken: bool = True
) -> ParsedText:
    """Simple text splitter, can optionally use tiktoken, parse html, or split into newlines.

    Args:
        path: path to file.
        html: flag to use html2text library for parsing.
        split_lines: flag to split lines into a list.
        use_tiktoken: flag to use tiktoken library to encode text.
    """
    try:
        with path.open() as f:
            text = list(f) if split_lines else f.read()
    except UnicodeDecodeError:
        with path.open(encoding="utf-8", errors="ignore") as f:
            text = f.read()

    parsing_libraries: list[str] = ["tiktoken (cl100k_base)"] if use_tiktoken else []
    if html:
        if not isinstance(text, str):
            raise NotImplementedError(
                "HTML parsing is not yet set up to work with split_lines."
            )
        text = html2text(text)
        parsing_libraries.append(f"html2text ({html2text_version})")

    return ParsedText(
        content=text,
        metadata=ParsedMetadata(
            parsing_libraries=parsing_libraries,
            paperqa_version=pqa_version,
            total_parsed_text_length=(
                len(text) if isinstance(text, str) else sum(len(t) for t in text)
            ),
            parse_type="txt" if not html else "html",
        ),
    )
```

Ensure that when you call `parse_text`, you pass a `Path` object, not a string. For example:

```python
from pathlib import Path

# Correct usage
path = Path("path/to/your/file.txt")
parsed_text = parse_text(path)
```

If you are passing a string path elsewhere in your code, convert it to a `Path` object before calling `parse_text` <sup>[[1]](https://github.com/Future-House/paper-qa/blob/main/paperqa/readers.py)</sup>.


<!-- Dosu Comment Footer -->
*To continue talking to [Dosu](https://dosu.dev), mention @dosu.*

**@jamesbraza** (2024-09-27):

Hi @fiyen it's because `parse_text` intakes a `pathlib.Path`, not a `str`. However, it's fine to allow `str` path there, so I will make a PR for that. You will see it in the next release coming tomorrow
