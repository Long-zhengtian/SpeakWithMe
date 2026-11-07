class ProviderPreset(object):
    def __init__(self, id, label, base_url, model, custom_url=False):
        self.id = id
        self.label = label
        self.base_url = base_url
        self.model = model
        self.custom_url = custom_url


# OpenAI-compatible chat endpoints. The key for each one is stored separately.
PRESETS = (
    ProviderPreset("openai", "OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"),
    ProviderPreset("grok", "Grok", "https://api.x.ai/v1", "grok-3"),
    ProviderPreset("glm", "智谱 GLM", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"),
    ProviderPreset("deepseek", "DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat"),
    ProviderPreset("compatible", "其他兼容接口", "", "", True),
)


def preset_for(provider_id):
    for preset in PRESETS:
        if preset.id == provider_id:
            return preset
    return None
