import re
import structlog
from typing import List, Dict

logger = structlog.get_logger("testdeck.secret_scanner")

AZURE_STORAGE_KEY: re.Pattern = re.compile(
    r"AccountKey=[A-Za-z0-9+/]{86}=="
)

SQL_CONNECTION: re.Pattern = re.compile(
    r"(?i)(Password\s*=\s*[^;'\"]{4,}|Initial Catalog\s*=\s*\w+)"
)

INTERNAL_IP: re.Pattern = re.compile(
    r"\b(10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)\b"
)

GOOGLE_API_KEY: re.Pattern = re.compile(
    r"AIza[0-9A-Za-z\-_]{35}"
)

_PATTERNS: List[tuple[str, re.Pattern]] = [
    ("AZURE_STORAGE_KEY", AZURE_STORAGE_KEY),
    ("SQL_CONNECTION",    SQL_CONNECTION),
    ("INTERNAL_IP",       INTERNAL_IP),
    ("GOOGLE_API_KEY",    GOOGLE_API_KEY),
]

_PREVIEW_LENGTH: int = 20

logger.info("secret_scanner_loaded")


def scan_for_secrets(text: object) -> List[Dict]:
    if not isinstance(text, str):
        logger.warning(
            "secret_scanner_invalid_input",
            input_type=type(text).__name__,
        )
        return []

    findings: List[Dict] = []

    for pattern_name, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            raw: str = match.group(0)
            preview: str = raw[:_PREVIEW_LENGTH]

            findings.append(
                {
                    "pattern_name": pattern_name,
                    "match_preview": preview,
                }
            )

            logger.warning(
                "secret_pattern_detected",
                pattern_name=pattern_name,
                match_preview=f"{preview}…",
            )

    if findings:
        logger.warning(
            "secret_scan_complete",
            finding_count=len(findings),
            pattern_names=[f["pattern_name"] for f in findings],
        )

    return findings


def contains_secrets(text: str) -> bool:
    return bool(scan_for_secrets(text))


def redact_for_external(text: str, placeholder: str = "[REDACTED]") -> tuple[str, List[Dict]]:
    findings = scan_for_secrets(text)
    redacted = text

    all_spans: List[tuple[int, int]] = []
    for _, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            all_spans.append((match.start(), match.end()))

    for start, end in sorted(all_spans, key=lambda s: s[0], reverse=True):
        redacted = redacted[:start] + placeholder + redacted[end:]

    if findings:
        logger.warning(
            "secret_redact_complete",
            finding_count=len(findings),
            placeholder=placeholder,
        )

    return redacted, findings