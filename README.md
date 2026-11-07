# Speaking With Me

口语练习的第一版。一场对话里有三个分工：

- **聊天**只把英语对话接下去，不纠错，不切中文。
- **指正**在回复发出之后单独看你刚才那句，最多改一处。
- **怎么说**接收你的中文，给你一句能直接说的英语。这句话点一下才会进入对话，聊天角色看不到中文。

这是接在语言模型上面的练习层。主页「设置」里填上 API key 之后，对话、指正和怎么说才会开始。没有密钥时不能开场。

## 运行

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

另开一个终端：

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 。

后端测试：

```bash
cd backend
source .venv/bin/activate
pytest
```

## 接上模型

打开主页的「设置」，选择 OpenAI、Grok、智谱 GLM、DeepSeek，或填一个兼容地址。贴上那一家的 API key 后，从该地址的 `/models` 读出模型列表，再选一个。各家的密钥分开保存，页面之后只显示末尾几位。

开发时也可以在仓库根目录用 `.env` 提供同一把密钥：

```bash
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=你的密钥
LLM_MODEL=gpt-4o-mini
LLM_CORRECTION_MODEL=
LLM_COACH_MODEL=
```

`LLM_BASE_URL` 可以换成任何兼容 Chat Completions 的地址。指正和怎么说可以单独指定更便宜的模型，留空则都用 `LLM_MODEL`。

## 扩展点

| 想加什么 | 改哪里 |
| --- | --- |
| 新场景 | `backend/app/domain/scenes.py` 的 `SCENES`。目录接口会把它带给前端 |
| 新水平 | `backend/app/domain/levels.py` |
| 新的语言模型 | 实现 `complete(system, messages, task, response_format)`，注册到 `backend/app/providers/__init__.py` 的 `LLM_BUILDERS` |
| 语音识别 | 实现 `backend/app/ports/speech.py` 里的 `SpeechToText`，注册到 `STT_BUILDERS`，设置 `STT_PROVIDER`。路由 `POST /api/v1/speech/transcribe` 不用改 |
| 语音合成 | 同样实现 `TextToSpeech`，注册到 `TTS_BUILDERS`。路由是 `POST /api/v1/speech/synthesize` |
| 会话存储 | `REPOSITORY=sqlite` 写到 `backend/data/speaking.sqlite`。测试用内存仓库。要换成别的数据库，实现 `SessionRepository` 并在 `build_repository` 里注册 |
| 个人主页 | `GET /api/v1/profile` 汇总场次、指正和小结。记录点开后，已结束的只回顾，没结束的可以接着说 |
| 新角色 | 在 `backend/app/agents/` 增加类，只用 `LLMProvider`，并裁剪它能看到的上下文。再在 `SessionService` 加方法、加一条 `/api/v1` 路由，把名字写进 `AGENT_SLOTS` |

聊天上下文只有英语对白。中文求助留在「怎么说」接口里，不会写进对白。借助说出去的句子会标成 `assisted`，指正不会再改它。

## 第一版的接口

- `GET /api/v1/health`
- `GET /api/v1/catalog`
- `GET /api/v1/profile`
- `GET /api/v1/settings`
- `PUT /api/v1/settings`
- `POST /api/v1/settings/test`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/{id}`
- `POST /api/v1/sessions/{id}/messages`
- `POST /api/v1/sessions/{id}/messages/{message_id}/correction`
- `POST /api/v1/sessions/{id}/coach`
- `POST /api/v1/sessions/{id}/recap`
- `POST /api/v1/glossary`
- `GET /api/v1/phrases`
- `POST /api/v1/phrases`
- `DELETE /api/v1/phrases/{id}`
- `POST /api/v1/speech/transcribe`
- `POST /api/v1/speech/synthesize`

交互文档在 http://localhost:8000/docs 。

## 还没做

账号、发音评分，以及真正的语音供应商。对话里可以按住说话，用的是浏览器自己的英语识别；对方的话用浏览器朗读。服务器上的识别和合成接口还空着。模型密钥在主页的「设置」里填写，存在本机 SQLite，页面上只显示末尾几位。练习记录也在这台电脑上。
