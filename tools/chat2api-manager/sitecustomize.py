import logging
import re


TOKEN_MESSAGE = re.compile(r"(?i)(request token:\s*)(\S+)")
JWT_VALUE = re.compile(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
original_log = logging.Logger._log


def redacted_log(self, level, msg, args, *extra, **kwargs):
    if isinstance(msg, str):
        msg = TOKEN_MESSAGE.sub(r"\1[REDACTED]", msg)
        msg = JWT_VALUE.sub("[REDACTED_JWT]", msg)
    return original_log(self, level, msg, args, *extra, **kwargs)


logging.Logger._log = redacted_log
