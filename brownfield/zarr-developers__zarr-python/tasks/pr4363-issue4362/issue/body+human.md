# Bad assert usage

_Opened by @mezdej_

In core/group.py

Line 414:
``    def from_dict(cls, data: dict[str, Any]) -> GroupMetadata:
        data = dict(data)

        assert data.pop("node_type", None) in ("group", None)``

If code is run with -O it does not work correctly

---

## Discussion

**@d-v-b** (2026-09-16):

I agree, it is bad. happy to review a PR that fixes it
