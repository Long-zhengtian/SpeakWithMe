import logging

import httpx

logger = logging.getLogger(__name__)


class LLMError(Exception):
    pass


class OpenAICompatibleLLM(object):
    """Chat-completions client. Works with OpenAI and compatible gateways."""

    name = "openai_compatible"

    def __init__(self, base_url, api_key, chat_model, correction_model, coach_model):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.chat_model = chat_model
        self.correction_model = correction_model
        self.coach_model = coach_model

    def model_for(self, task):
        if task == "correction" and self.correction_model:
            return self.correction_model
        if task == "coach" and self.coach_model:
            return self.coach_model
        return self.chat_model

    async def complete(self, system, messages, task, response_format):
        payload = {
            "model": self.model_for(task),
            "temperature": 0.7 if task == "chat" else 0.2,
            "max_tokens": 180 if task == "chat" else 400,
            "messages": [{"role": "system", "content": system}] + list(messages),
        }
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                response = await client.post(
                    "%s/chat/completions" % self.base_url,
                    headers={"Authorization": "Bearer %s" % self.api_key},
                    json=payload,
                )
                response.raise_for_status()
                body = response.json()
        except httpx.HTTPError as exc:
            logger.warning("llm request failed task=%s error=%s", task, exc.__class__.__name__)
            raise LLMError(str(exc))
        try:
            return body["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            logger.warning("llm response missing text task=%s", task)
            raise LLMError("missing completion")
