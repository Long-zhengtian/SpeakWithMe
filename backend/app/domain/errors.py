class AppError(Exception):
    def __init__(self, status, code, message, slot=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.slot = slot
