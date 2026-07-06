from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
ENV_PATH = ROOT / ".env"
DEFAULT_TIMEOUT = 18
DEFAULT_BALANCE_RATE_SCAN_INTERVAL = 60
DEFAULT_AUTO_PROBE_INTERVAL = DEFAULT_BALANCE_RATE_SCAN_INTERVAL
DEFAULT_RATE_PROBE_INTERVAL = DEFAULT_BALANCE_RATE_SCAN_INTERVAL
DEFAULT_MODEL_MONITOR_INTERVAL = 60
DEFAULT_UPSTREAM_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
}


def _unquote_env_value(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_root_env() -> None:
    if not ENV_PATH.exists():
        return

    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export ") :].strip()
        key, separator, value = stripped.partition("=")
        if not separator:
            continue
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = _unquote_env_value(value.strip())


def _env_str(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None or raw_value.strip() == "":
        return default
    try:
        return int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer, got {raw_value!r}") from error


def _env_path(name: str, default: Path) -> Path:
    raw_value = os.environ.get(name)
    if raw_value is None or raw_value.strip() == "":
        return default
    env_path = Path(raw_value)
    return env_path if env_path.is_absolute() else ROOT / env_path


@dataclass(frozen=True)
class ApiSettings:
    host: str
    port: int
    data_dir: Path
    balance_rate_scan_interval: int
    auto_probe_interval: int
    rate_probe_interval: int
    model_monitor_interval: int


load_root_env()

settings = ApiSettings(
    host=_env_str("API_HOST", "127.0.0.1"),
    port=_env_int("API_PORT", 4176),
    data_dir=_env_path("API_DATA_DIR", ROOT / "data"),
    balance_rate_scan_interval=_env_int("BALANCE_RATE_SCAN_INTERVAL", DEFAULT_BALANCE_RATE_SCAN_INTERVAL),
    auto_probe_interval=_env_int("AUTO_PROBE_INTERVAL", DEFAULT_AUTO_PROBE_INTERVAL),
    rate_probe_interval=_env_int("RATE_PROBE_INTERVAL", DEFAULT_RATE_PROBE_INTERVAL),
    model_monitor_interval=_env_int("MODEL_MONITOR_INTERVAL", DEFAULT_MODEL_MONITOR_INTERVAL),
)

DB_PATH = _env_path("API_DB_PATH", settings.data_dir / "radar.db")
