"""Input validation helpers for API routes."""


class ValidationError(ValueError):
    pass


def require_str(value, name: str, max_len: int = 200) -> str:
    if value is None or not str(value).strip():
        raise ValidationError(f"'{name}' is required")
    text = str(value).strip()
    if len(text) > max_len:
        raise ValidationError(f"'{name}' exceeds maximum length of {max_len}")
    return text


def parse_positive_int(value, name: str, default: int, maximum: int = 100) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    if number < 1:
        raise ValidationError(f"'{name}' must be a positive integer")
    return min(number, maximum)


def parse_float(value, name: str):
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValidationError(f"'{name}' must be a number")


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
