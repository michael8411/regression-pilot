import json


class FrameError(Exception):
    pass


def encode(message: dict) -> bytes:
    """Encode a JSON-RPC message as a single LF-terminated line."""
    payload = json.dumps(message, separators=(",", ":"))
    return (payload + "\n").encode("utf-8")


def decode(line: bytes) -> dict:
    """Decode a single LF-terminated line into a JSON-RPC message dict."""
    text = line.decode("utf-8", errors="replace").strip()
    if not text:
        raise FrameError("empty frame")
    try:
        msg = json.loads(text)
    except json.JSONDecodeError as e:
        raise FrameError(f"bad json: {e}") from e
    if not isinstance(msg, dict):
        raise FrameError("frame is not an object")
    return msg
