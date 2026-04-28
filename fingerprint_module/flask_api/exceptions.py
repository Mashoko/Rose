"""Domain errors surfaced as HTTP responses by the API layer."""


class ServiceError(Exception):
    """Base class; ``code`` is an HTTP status, ``message`` is safe for clients."""

    code: int = 500

    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class ValidationError(ServiceError):
    def __init__(self, message: str):
        super().__init__(message, code=400)


class NotFoundError(ServiceError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, code=404)


class ConflictError(ServiceError):
    def __init__(self, message: str):
        super().__init__(message, code=409)
