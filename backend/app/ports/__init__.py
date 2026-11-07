from typing import Dict, List, Protocol


class LLMProvider(Protocol):
    """One completion call for every agent.

    `task` is `chat`, `correction`, `coach`, or `recap`. A new agent can pass a
    new task name. The OpenAI-compatible provider falls back to the chat model.
    `response_format` is `text` or `json`.
    """

    name = ""

    async def complete(self, system, messages, task, response_format):
        # type: (str, List[Dict[str, str]], str, str) -> str
        ...
