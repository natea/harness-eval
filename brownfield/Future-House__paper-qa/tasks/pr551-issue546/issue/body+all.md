# JSON decode error when adding docs

_Opened by @Snikch63200_

Hello,

I've got this error when I try to add document with 'add' method from Doc() object : 

```
Failed to parse all of title, DOI, and authors from the ParsingSettings.structured_citation_prompt's response  {
"title": "La politique culturelle de la Communauté française de Belgique : origines, évolutions et enjeux",
"authors": ["Auby, Bénédicte"],
"doi": null
}

Explication :

Le titre de l'ouvrage est "La politique culturelle de la Communauté française de Belgique : origines, évolutions et enjeux".

Les auteurs de l'ouvrage sont Bénédicte Auby. Comme il y a un seul auteur, je l'ai renvoyé sous la forme d'une liste à une entrée.

Le DOI (Digital Object Identifier) n'était pas spécifié dans la citation MLA, donc je l'ai renvoyé comme null.</s>, consider using a manifest file or specifying a different citation prompt.
Traceback (most recent call last):
  File "C:\ProgramData\anaconda3\envs\PaperQA_env\Lib\site-packages\paperqa\docs.py", line 321, in aadd
    citation_json = json.loads(clean_text)
                    ^^^^^^^^^^^^^^^^^^^^^^
  File "C:\ProgramData\anaconda3\envs\PaperQA_env\Lib\json\__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\ProgramData\anaconda3\envs\PaperQA_env\Lib\json\decoder.py", line 340, in decode
    raise JSONDecodeError("Extra data", s, end)
json.decoder.JSONDecodeError: Extra data: line 7 column 1 (char 158)
```

Is the JSON error is a consequence of lack of DOI in text ?

---

## Discussion

**@dosubot** (bot) (2024-10-09):

<!-- Answer -->
The `JSONDecodeError` you're encountering is not due to the lack of a DOI. The error message "Extra data" suggests that there might be additional, unexpected content in the JSON string after the valid JSON object. This could be caused by extra characters or formatting issues in the input string.

To resolve this, ensure that the JSON string is correctly formatted and does not contain any extraneous data or characters outside the JSON object. Double-check the input to make sure it ends properly and doesn't have any trailing characters or syntax errors.


<!-- Dosu Comment Footer -->
*To continue talking to [Dosu](https://dosu.dev), mention @dosu.*

**@Snikch63200** (2024-10-09):

How can I check JSON string ?

@dosu.

**@dosubot** (bot) (2024-10-09):

<!-- Answer -->
You can check the JSON string by printing it out before the `json.loads()` call to see its exact content. Look for any unexpected characters or formatting issues. You can also use an online JSON validator or a tool like `jsonlint` to verify its correctness. If you find any extra data or syntax errors, correct them before attempting to parse the JSON again.


<!-- Dosu Comment Footer -->
*To continue talking to [Dosu](https://dosu.dev), mention @dosu.*

**@Snikch63200** (2024-10-09):

Here is the `clean_text` variable content printed before` json.loads` call.

```
{
"title": "La politique culturelle de la Communauté française de Belgique : origines, évolutions et enjeux",
"authors": ["Auby, Valérie"],
"doi": null
}

Explication :

J'ai analysé le fichier PDF avec le texte suivant :

Auteur : Auby, Valérie
Titre : La politique culturelle de la Communauté française de Belgique : origines, évolutions et enjeux
Source : File 59 - Auby - Pôle culturel.pdf
DOI : inconnu

Comme il n'y a pas de DOI fourni dans la citation, je renvoie la valeur DOI comme null.</s>
```

What is the problem ?? @dosu

**@dosubot** (bot) (2024-10-09):

<!-- Answer -->
The issue with your `clean_text` variable is that it contains additional text after the JSON object, which causes the `JSONDecodeError`. The JSON parser expects only the JSON object, but your string includes explanatory text after the closing brace.

To fix this, ensure that `clean_text` contains only the JSON object. You can extract the JSON part by trimming everything after the closing brace `}`. Here's a quick way to do it:

```python
import json

# Assuming clean_text is your variable
json_part = clean_text.split('}\n')[0] + '}'
citation_json = json.loads(json_part)
```

This will isolate the JSON content and allow `json.loads()` to parse it correctly.


<!-- Dosu Comment Footer -->
*To continue talking to [Dosu](https://dosu.dev), mention @dosu.*
