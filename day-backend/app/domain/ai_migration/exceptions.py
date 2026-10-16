class AIServiceUnavailable(Exception):
    """The ai-service could not be reached: not deployed, down, or not answering.

    Its text is a stable code, not a sentence: an import job stores str(exc) as
    its error, and the web shows "AI import is unavailable" for this code.
    """

    CODE = "ai_service_unavailable"

    def __init__(self) -> None:
        super().__init__(self.CODE)
