# ImportError: cannot import name 'Settings' from 'paperqa'

_Opened by @zhiyiZeng_

Hello, I encountered an ImportError while trying to import the Settings class from the paperqa package. Below are the details of the issue:
![image](https://github.com/user-attachments/assets/d857c6aa-cf16-47ab-8d79-edd500be6217)

I've tried in both windows and linux. I appreciate any help.

---

## Discussion

**@jamesbraza** (2024-09-22):

Hi @zhiyiZeng I think the issue is you need paper-qa version 5. The `settings` module didn't exist before then in versions such as version 4.

Can you `pip install -U paper-qa` or `pip install paper-qa>=5` to get version 5

**@habema** (2024-09-23):

Hello @zhiyiZeng

I was just running into the same issue and solved it by upgrading python3.10 to 3.11.

There are no installation candidates for `pip install paper-qa>=5` on python3.10.

**@zhiyiZeng** (2024-09-23):

@habema Thanks, it solves my problem. I install the package using the latest `.whl`  file and the error message suggests that I need to use Python 3.11, just like what you said. Also appreciate your help @jamesbraza for building this wondereful package.
