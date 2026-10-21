class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


class ProviderError(Exception):
    """External model provider failed (timeout, auth, rate limit, bad output)."""
