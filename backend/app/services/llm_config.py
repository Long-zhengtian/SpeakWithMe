from urllib.parse import urlparse

import httpx

from app.domain.errors import AppError
from app.domain.llm_providers import PRESETS, preset_for
from app.domain.models import LlmSettings

LEGACY_OPENAI = ("openai_compatible", "mock", "unconfigured", "")


def key_hint(api_key):
    key = api_key or ""
    if not key:
        return ""
    if len(key) < 8:
        return "已保存"
    return "%s…%s" % (key[:3], key[-4:])


def _known_provider(provider_id):
    if provider_id in LEGACY_OPENAI:
        return "openai"
    if preset_for(provider_id) is None:
        return "openai"
    return provider_id


def normalize(record):
    provider = _known_provider(record.provider)
    keys = dict(record.keys or {})
    models = dict(record.models or {})
    bases = dict(record.bases or {})
    if record.api_key:
        keys.setdefault(provider, record.api_key)
    if record.model:
        models.setdefault(provider, record.model)
    if record.base_url and provider == "compatible":
        bases.setdefault(provider, record.base_url)
    catalog = {}
    for name, ids in (record.model_catalog or {}).items():
        catalog[name] = [item for item in ids if item]
    active_key = keys.get(provider, "")
    return LlmSettings(
        provider=provider,
        base_url=bases.get(provider, "") if provider == "compatible" else (record.base_url or ""),
        model=models.get(provider, ""),
        api_key=active_key,
        keys=keys,
        models=models,
        bases=bases,
        model_catalog=catalog,
    )


def current_record(container):
    stored = container.repository.get_llm_settings()
    if stored is not None:
        return normalize(stored)
    key = container.settings.llm_api_key or ""
    keys = {"openai": key} if key else {}
    return LlmSettings(provider="openai", api_key=key, keys=keys)


def _resolved(record, provider_id):
    preset = preset_for(provider_id)
    remembered = (record.models or {}).get(provider_id, "")
    if preset.custom_url:
        base_url = ((record.bases or {}).get(provider_id) or "").rstrip("/")
        model = remembered
    else:
        base_url = preset.base_url
        model = remembered
    return base_url, model


def public_view(record):
    record = normalize(record)
    active_base, active_model = _resolved(record, record.provider)
    providers = []
    for preset in PRESETS:
        base_url, model = _resolved(record, preset.id)
        key = (record.keys or {}).get(preset.id, "")
        providers.append(
            {
                "id": preset.id,
                "label": preset.label,
                "base_url": base_url,
                "model": model,
                "custom_url": preset.custom_url,
                "api_key_set": bool(key),
                "api_key_hint": key_hint(key),
                "models": list((record.model_catalog or {}).get(preset.id) or []),
            }
        )
    active_key = (record.keys or {}).get(record.provider, "")
    return {
        "provider": record.provider,
        "base_url": active_base,
        "model": active_model,
        "api_key_set": bool(active_key),
        "api_key_hint": key_hint(active_key),
        "providers": providers,
    }


def _clean_base_url(value):
    base_url = (value or "").strip().rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise AppError(422, "bad_base_url", "接口地址要以 http:// 或 https:// 开头。")
    if len(base_url) > 200:
        raise AppError(422, "bad_base_url", "接口地址太长了。")
    return base_url


def _clean_model(value):
    model = (value or "").strip()
    if not model or len(model) > 80 or any(char.isspace() for char in model):
        raise AppError(422, "bad_model", "模型名称写成一行就好。")
    return model


def _clean_key(value):
    key = (value or "").strip()
    if any(char.isspace() for char in key) or len(key) > 400:
        raise AppError(422, "bad_api_key", "密钥里不要加空格，贴完整的一行。")
    return key


def prepare_record(container, body):
    current = normalize(current_record(container))
    provider = _known_provider((body.provider or "").strip() or current.provider)
    preset = preset_for(provider)
    keys = dict(current.keys or {})
    models = dict(current.models or {})
    bases = dict(current.bases or {})
    if body.clear_api_key:
        keys.pop(provider, None)
        key = ""
    elif (body.api_key or "").strip():
        key = _clean_key(body.api_key)
        keys[provider] = key
    else:
        key = keys.get(provider, "")
    catalog = {name: list(ids) for name, ids in (current.model_catalog or {}).items()}
    if preset.custom_url:
        base_url = _clean_base_url(body.base_url or bases.get(provider) or "")
        bases[provider] = base_url
    else:
        base_url = preset.base_url
    if body.clear_api_key:
        model = models.get(provider, "")
    else:
        listed = catalog.get(provider) or []
        model = (body.model or "").strip() or models.get(provider, "")
        if model not in listed:
            raise AppError(422, "model_not_listed", "先读取这个地址上的模型，再从列表里选一个。")
        models[provider] = model
    if not key:
        if not body.clear_api_key or provider not in (current.keys or {}):
            raise AppError(422, "missing_api_key", "先填上这个来源的 API key。")
    return LlmSettings(
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=key,
        keys=keys,
        models=models,
        bases=bases,
        model_catalog=catalog,
    )


def save_record(container, body):
    record = prepare_record(container, body)
    container.repository.save_llm_settings(record)
    container.apply_llm_settings(record)
    return public_view(record)


async def test_record(container, body):
    record = prepare_record(container, body)
    if not record.api_key:
        raise AppError(422, "missing_api_key", "先填上这个来源的 API key。")
    url = "%s/chat/completions" % record.base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                url,
                headers={"Authorization": "Bearer %s" % record.api_key},
                json={
                    "model": record.model,
                    "max_tokens": 8,
                    "temperature": 0,
                    "messages": [{"role": "user", "content": "Reply with ok"}],
                },
            )
    except httpx.HTTPError:
        raise AppError(502, "provider_unreachable", "连不上这个接口。检查地址能不能打开。")
    if response.status_code in (401, 403):
        raise AppError(401, "rejected_key", "密钥没有被接受。")
    if response.status_code >= 400:
        raise AppError(502, "provider_rejected", "接口没有接受这次试连。检查模型和密钥。")
    return {"ok": True, "message": "连上了，可以保存。"}


def parse_model_ids(payload):
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if not isinstance(data, list):
        return []
    found = []
    for item in data:
        if isinstance(item, str) and item.strip():
            found.append(item.strip())
        elif isinstance(item, dict):
            model_id = str(item.get("id") or "").strip()
            if model_id:
                found.append(model_id)
    return sorted(set(found))


async def fetch_model_ids(base_url, api_key):
    url = "%s/models" % base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                url,
                headers={"Authorization": "Bearer %s" % api_key},
            )
    except httpx.HTTPError:
        raise AppError(502, "provider_unreachable", "连不上这个地址，读不到模型。")
    if response.status_code in (401, 403):
        raise AppError(401, "rejected_key", "密钥没有被接受。")
    if response.status_code >= 400:
        raise AppError(502, "provider_rejected", "这个地址没有返回模型列表。")
    try:
        payload = response.json()
    except ValueError:
        raise AppError(502, "provider_rejected", "这个地址没有返回模型列表。")
    ids = parse_model_ids(payload)
    if not ids:
        raise AppError(502, "no_models", "这个地址没有返回可用的模型。")
    return ids


async def list_provider_models(container, body):
    current = normalize(current_record(container))
    provider = _known_provider((body.provider or "").strip() or current.provider)
    preset = preset_for(provider)
    keys = dict(current.keys or {})
    bases = dict(current.bases or {})
    models = dict(current.models or {})
    if (body.api_key or "").strip():
        key = _clean_key(body.api_key)
        keys[provider] = key
    else:
        key = keys.get(provider, "")
    if not key:
        raise AppError(422, "missing_api_key", "先填上这个来源的 API key。")
    if preset.custom_url:
        base_url = _clean_base_url(body.base_url or bases.get(provider) or "")
        bases[provider] = base_url
    else:
        base_url = preset.base_url
    ids = sorted(await fetch_model_ids(base_url, key))
    catalog = {name: list(values) for name, values in (current.model_catalog or {}).items()}
    catalog[provider] = ids
    if models.get(provider) not in ids:
        models.pop(provider, None)
    active = current.provider
    active_base, active_model = _resolved(
        LlmSettings(provider=active, models=models, bases=bases, keys=keys),
        active,
    )
    record = LlmSettings(
        provider=active,
        base_url=active_base,
        model=active_model,
        api_key=keys.get(active, ""),
        keys=keys,
        models=models,
        bases=bases,
        model_catalog=catalog,
    )
    container.repository.save_llm_settings(record)
    container.apply_llm_settings(record)
    return public_view(record)
