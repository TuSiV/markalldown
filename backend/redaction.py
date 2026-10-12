"""Optional, reversible, deterministic Markdown redaction.

No text is sent outside the machine from this module. Vaults are encrypted using
scrypt + AES-256-GCM. The caller must keep the passphrase separately.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
from collections import Counter
from bisect import bisect_left
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAX_TEXT = 5_000_000
MAX_RECOVERY_TEXT = 8_000_000
MAX_RECOVERY_OUTPUT = 32_000_000
MAX_TERMS = 1000
MAX_MATCHES = 20_000
TOKEN_PATTERN = re.compile(r"【MAD_[^】\n]{1,150}】")
MAX_TERM_LENGTH = 200
VAULT_AAD = b"MarkAllDown:RedactionVault:v1"
IDENTITY_PATTERN = re.compile(r"^<!-- MarkAllDown:document=([a-f0-9]{32});processing=([a-f0-9]{32}) -->\r?\n", re.M)


def identity_header(document_id: str, processing_id: str) -> str:
    if not all(isinstance(v, str) and re.fullmatch(r"[a-f0-9]{32}", v) for v in (document_id, processing_id)):
        raise ValueError("Invalid document identity")
    return f"<!-- MarkAllDown:document={document_id};processing={processing_id} -->\n"


def attach_identity(text: str, document_id: str, processing_id: str) -> str:
    header = identity_header(document_id, processing_id)
    # Keep a conventional YAML front matter block at the start of Markdown.
    front_matter = re.match(r"\A(?:\ufeff)?---\r?\n.*?\r?\n(?:---|\.\.\.)\r?\n", text, re.S)
    if front_matter:
        end = front_matter.end()
        return text[:end] + header + text[end:]
    return header + text

# Use conservative patterns. High-recall semantic categories (people,
# organizations, project names) must be handled via explicit custom terms/AI review.
PATTERNS = {
    "phone": [re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")],
    "email": [re.compile(r"(?<![\w.\-])[-+\w.]+@[\w-]+(?:\.[\w-]+)+(?![\w.\-])", re.I)],
    "id_card": [re.compile(r"(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)")],
    "bank_account": [re.compile(r"(?:银行账号|收款账号|银行账户|账号|账户)\s*[：:]\s*(?P<value>\d{12,19})(?!\d)")],
    "credit_code": [re.compile(r"(?:统一社会信用代码)\s*[：:]\s*(?P<value>[0-9A-HJ-NPQRTUWXY]{18})(?![A-Z0-9])", re.I)],
    "case_number": [re.compile(r"[（(](?:19|20)\d{2}[)）][^\n（）()]{1,16}?\d{1,10}号")],
    "date": [re.compile(r"(?<!\d)(?:19|20)\d{2}[年/-](?:0?[1-9]|1[0-2])[月/-](?:0?[1-9]|[12]\d|3[01])日?(?!\d)")],
    "amount": [re.compile(r"(?:人民币|￥|¥|RMB\s*|CNY\s*)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:亿元|万元|元)?")],
    "address": [re.compile(r"(?:注册地址|办公地址|通讯地址|住所地|地址)\s*[：:]\s*(?P<value>[^\n，,。；;]{4,80})")],
    "file_code": [re.compile(r"(?:合同编号|文件编号|协议编号)\s*[：:]\s*(?P<value>[A-Za-z0-9_./-]{4,60})")],
}
DEFAULT_CATEGORIES = ["phone", "email", "id_card", "bank_account", "credit_code"]


@dataclass(frozen=True)
class Match:
    start: int
    end: int
    category: str
    original: str
    priority: int


def _terms(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or len(value) > MAX_TERMS:
        raise ValueError(f"{field} must be a list of at most {MAX_TERMS} strings")
    out = []
    for v in value:
        if not isinstance(v, str) or not v.strip() or len(v) > MAX_TERM_LENGTH:
            raise ValueError(f"Invalid {field} item")
        if v not in out:
            out.append(v)
    return out


def redact_markdown(text: str, options: dict[str, Any], processing_id: str | None = None) -> tuple[str, dict[str, Any], dict[str, Any]]:
    """Return (masked_text, mapping, summary). Original input is never mutated."""
    if not isinstance(text, str) or len(text) > MAX_TEXT:
        raise ValueError("Input must be text up to 5,000,000 characters")
    if not isinstance(options, dict):
        raise ValueError("options must be an object")
    categories = options.get("categories", DEFAULT_CATEGORIES)
    if not isinstance(categories, list) or len(categories) > len(PATTERNS) or any(not isinstance(c, str) or c not in PATTERNS for c in categories):
        raise ValueError("Unknown redaction category")
    keywords = _terms(options.get("keywords", []), "keywords")
    whitelist = _terms(options.get("whitelist", []), "whitelist")
    categories = list(dict.fromkeys(categories))
    if set(options) - {"categories", "keywords", "whitelist"}:
        raise ValueError("Unsupported redaction option")

    exclusions = [(m.start(), m.end()) for m in re.finditer(r"【MAD_[^】]{1,150}】", text)]
    for term in whitelist:
        exclusions.extend((m.start(), m.end()) for m in re.finditer(re.escape(term), text))

    exclusions.sort()
    merged = []
    for start, end in exclusions:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    exclusion_starts = [x[0] for x in merged]
    def excluded(start: int, end: int) -> bool:
        i = bisect_left(exclusion_starts, end) - 1
        return i >= 0 and merged[i][1] > start


    candidates: list[Match] = []
    # Explicit user-defined exact terms take precedence over built-in patterns.
    for word in keywords:
        for match in re.finditer(re.escape(word), text):
            if not excluded(match.start(), match.end()):
                candidates.append(Match(match.start(), match.end(), "keyword", match.group(), 0))
                if len(candidates) > MAX_MATCHES:
                    raise ValueError("Too many matches; split the document")
    for category in categories:
        for pattern in PATTERNS[category]:
            for match in pattern.finditer(text):
                start, end = match.span("value") if "value" in pattern.groupindex else match.span()
                if not excluded(start, end):
                    candidates.append(Match(start, end, category, text[start:end], 1))
                    if len(candidates) > MAX_MATCHES:
                        raise ValueError("Too many matches; split the document")

    # Longest-first within a matching position; ensure no overlapping substitution.
    candidates.sort(key=lambda m: (m.priority, -(m.end-m.start), m.start))
    selected = []
    occupied = []
    occupied_starts = []
    for item in candidates:
        i = bisect_left(occupied_starts, item.start)
        if (i and occupied[i-1][1] > item.start) or (i < len(occupied) and occupied[i][0] < item.end):
            continue
        occupied.insert(i, (item.start, item.end))
        occupied_starts.insert(i, item.start)
        selected.append(item)
    selected.sort(key=lambda m: m.start)

    # Unique per file to make combined and ZIP exports restorable without token collisions.
    run_id = processing_id or uuid4().hex[:12]
    if not re.fullmatch(r"[a-f0-9]{12}|[a-f0-9]{32}", run_id):
        raise ValueError("Invalid processing identity")
    used: dict[tuple[str, str], str] = {}
    mapping: dict[str, str] = {}
    counts: Counter[str] = Counter()
    last = 0
    chunks = []
    for item in selected:
        key = (item.category, item.original)
        if key not in used:
            while True:
                counts[item.category] += 1
                ident = f"【MAD_{run_id}_{item.category.upper()}_{counts[item.category]:04d}】"
                if ident not in text and ident not in mapping:
                    break
            used[key] = ident
            mapping[ident] = item.original
        chunks.append(text[last:item.start])
        chunks.append(used[key])
        last = item.end
    chunks.append(text[last:])
    occurrences = Counter((m.category, m.original) for m in selected)
    findings = [
        {"category": category, "original": original, "count": count}
        for (category, original), count in occurrences.most_common()
    ]
    summary = {"occurrences": len(selected), "unique": len(mapping),
               "categories": dict(Counter(m.category for m in selected)), "findings": findings}
    return "".join(chunks), mapping, summary


def encrypt_mapping(mapping: dict[str, str], passphrase: str) -> dict[str, str]:
    if not isinstance(passphrase, str) or not 8 <= len(passphrase) <= 1024:
        raise ValueError("Vault passphrase must contain at least 8 characters")
    raw = json.dumps(mapping, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    key = hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    ciphertext = AESGCM(key).encrypt(nonce, raw, VAULT_AAD)
    return {"version": "MAD-R1", "kdf": "scrypt-16384-8-1", "cipher": "AES-256-GCM", "salt": base64.b64encode(salt).decode(), "nonce": base64.b64encode(nonce).decode(), "data": base64.b64encode(ciphertext).decode()}


def decrypt_mapping(vault: dict[str, Any], passphrase: str) -> dict[str, str]:
    if isinstance(vault, dict) and vault.get("version") == "MAD-R2":
        return decrypt_document(vault, passphrase)["mapping"]
    if not isinstance(vault, dict) or vault.get("version") != "MAD-R1":
        raise ValueError("Unsupported vault version")
    if vault.get("kdf") != "scrypt-16384-8-1" or vault.get("cipher") != "AES-256-GCM":
        raise ValueError("Unsupported vault encryption")
    if not isinstance(passphrase, str) or not 8 <= len(passphrase) <= 1024:
        raise ValueError("Invalid vault passphrase")
    try:
        salt = base64.b64decode(vault["salt"], validate=True)
        nonce = base64.b64decode(vault["nonce"], validate=True)
        data = base64.b64decode(vault["data"], validate=True)
        if len(salt) != 16 or len(nonce) != 12 or len(data) > 20_000_000:
            raise ValueError("Invalid vault sizes")
        key = hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
        mapping = json.loads(AESGCM(key).decrypt(nonce, data, VAULT_AAD))
    except Exception as e:
        raise ValueError("Incorrect passphrase or damaged vault") from e
    if not isinstance(mapping, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not k.startswith("【MAD_") for k, v in mapping.items()):
        raise ValueError("Invalid vault mapping")
    return mapping


def restore_markdown(text: str, vaults: list[dict[str, Any]], passphrase: str) -> tuple[str, int]:
    if not isinstance(text, str) or len(text) > MAX_RECOVERY_TEXT:
        raise ValueError("Recovery input exceeds 8,000,000 characters")
    if not isinstance(vaults, list) or len(vaults) > 5000 or not vaults:
        raise ValueError("Provide 1 to 5000 vaults")
    if len(vaults) > 100:
        raise ValueError("At most 100 vaults per recovery request")
    combined: dict[str, str] = {}
    documents = {}
    for vault in vaults:
        if isinstance(vault, dict) and vault.get("version") == "MAD-R2":
            document = decrypt_document(vault, passphrase)
            documents[document["processingId"]] = document["documentId"]
            mapping = document["mapping"]
        else:
            mapping = decrypt_mapping(vault, passphrase)
        for k, v in mapping.items():
            if k in combined and combined[k] != v:
                raise ValueError("Inconsistent vault mappings")
            combined[k] = v
    token_pattern = TOKEN_PATTERN
    # Fail closed when the input carries placeholders not present in the vault.
    # A partial document is still allowed: some known tokens may simply not
    # occur in the input. Unknown tokens indicate a mismatched/missing vault.
    unknown = [m.group(0) for m in re.finditer(r"【MAD_[^】\n]{1,150}】", text) if m.group(0) not in combined]
    if unknown:
        raise ValueError("Redacted text contains unknown placeholders; check that all mapping vaults are provided")
    has_identity = False
    if documents:
        headers = IDENTITY_PATTERN.findall(text)
        has_identity = bool(headers)
        for doc_id, proc_id in headers:
            if documents.get(proc_id) != doc_id:
                raise ValueError("Document identity does not match recovery mapping")
        text = IDENTITY_PATTERN.sub("", text)
        if "<!-- MarkAllDown:" in text:
            raise ValueError("Invalid document identity marker")
    if not combined:
        return text, 0
    # Bound the output before substitution: an imported/edited document can
    # repeat a placeholder whose encrypted original value is very large.
    output_length = len(text)
    for match in token_pattern.finditer(text):
        output_length += len(combined[match.group()]) - len(match.group())
        if output_length > MAX_RECOVERY_OUTPUT:
            raise ValueError("Restored text exceeds recovery size limit; split the document")
    restored, count = token_pattern.subn(lambda m: combined[m.group()], text)
    if count == 0 and combined and not has_identity:
        raise ValueError("No matching placeholders found in this text")
    return restored, count


def seal_payload(payload: dict, passphrase: str, version: str) -> dict:
    if not isinstance(passphrase, str) or not 8 <= len(passphrase) <= 1024:
        raise ValueError("Invalid vault passphrase")
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    key = hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    data = AESGCM(key).encrypt(nonce, raw, ("MarkAllDown:" + version).encode("ascii"))
    return {"version": version, "kdf": "scrypt-16384-8-1", "cipher": "AES-256-GCM",
            "salt": base64.b64encode(salt).decode(), "nonce": base64.b64encode(nonce).decode(), "data": base64.b64encode(data).decode()}


def open_payload(vault: dict, passphrase: str, version: str) -> dict:
    if not isinstance(vault, dict) or vault.get("version") != version or vault.get("kdf") != "scrypt-16384-8-1" or vault.get("cipher") != "AES-256-GCM":
        raise ValueError("Invalid encrypted payload")
    if not isinstance(passphrase, str) or not 8 <= len(passphrase) <= 1024:
        raise ValueError("Invalid vault passphrase")
    try:
        salt = base64.b64decode(vault["salt"], validate=True)
        nonce = base64.b64decode(vault["nonce"], validate=True)
        data = base64.b64decode(vault["data"], validate=True)
        if len(salt) != 16 or len(nonce) != 12 or len(data) > 20_000_000:
            raise ValueError("Invalid encrypted payload sizes")
        key = hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
        payload = json.loads(AESGCM(key).decrypt(nonce, data, ("MarkAllDown:" + version).encode("ascii")))
        if not isinstance(payload, dict):
            raise ValueError("Invalid encrypted payload")
        return payload
    except Exception as e:
        raise ValueError("Incorrect passphrase or damaged recovery data") from e


def decrypt_document(vault: dict, passphrase: str) -> dict:
    document = open_payload(vault, passphrase, "MAD-R2")
    identity_header(document.get("documentId"), document.get("processingId"))
    if any(not isinstance(document.get(k), str) or not re.fullmatch(r"[a-f0-9]{64}", document[k]) for k in ("sourceHash", "redactedHash")):
        raise ValueError("Invalid document hashes")
    mapping = document.get("mapping")
    if not isinstance(mapping, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not k.startswith("【MAD_" + document["processingId"] + "_") for k, v in mapping.items()):
        raise ValueError("Invalid document mapping")
    return document
