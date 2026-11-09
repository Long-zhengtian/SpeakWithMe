# Speak With Me

口语练习的第一版。一场对话里有三个分工：

- **聊天**只把英语对话接下去，不纠错，不切中文。一场不限句数；稿子变长以后，更早的内容收成一段「已经谈过什么」，最近的原文仍发给模型。
- **指正**在回复发出之后单独看你刚才那句，把整句里的问题改完。
- **怎么说**接收你的中文，给你一句能直接说的英语。这句话点一下才会进入对话，聊天角色看不到中文。

这是接在语言模型上面的练习层。主页「设置」里填上 API key 之后，对话、指正和怎么说才会开始。没有密钥时不能开场。

## 运行

网页和手机安装包用同一份 `frontend`。练习、评分、词典和备份都在页面里完成，不再依赖 `8000` 端口。

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 。第一次打开时，如果这台电脑上的旧 Python 服务还在 `8000` 端口，会把已有练习导入到浏览器自己的记录里。之后换设备用「设置」里的备份文件。

听写和朗读在页面里完成，网页和安装包用同一套小模型，权重直接放在 `frontend/public/models` 里。打开就能听、就能读，不需要再下载。

`backend/` 是上一版网页服务。新功能写在 `frontend`。

## 打安卓安装包

网页和手机是同一份界面。Capacitor 只负责安卓外壳：安装包里带上编好的页面、ECDICT 词典和本地记录，打开后直接调用设置里保存的模型地址。它不会去连电脑上的 `127.0.0.1:8000`。

先装好这两样：

- **JDK 21**。Gradle 8.14 只能用到 JDK 24，Android Studio 自带的 Java 25 会报 `Unsupported class file major version 69`。这台电脑上的 JDK 21 在 `~/development/jdk-21.0.13+9/Contents/Home`（Temurin 21.0.13）。
- **Android SDK**。这台电脑在 `~/Library/Android/sdk`，里面已有 `platforms/android-37.0` 和 `build-tools/36.0.0`。`frontend/android/local.properties` 里的 `sdk.dir` 指向它，这个文件不要提交。

在仓库根目录执行：

```bash
export JAVA_HOME="$HOME/development/jdk-21.0.13+9/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

cd frontend
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon
```

`npm run build` 会先做类型检查再编出 `frontend/dist`。`npx cap sync android` 把 `dist` 和 `frontend/public/ecdict/*.bin` 复制进 `frontend/android/app/src/main/assets/public`。改过页面或词典之后要重新执行这两步，再编安装包。

编好的调试包：

`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

当前调试包是 1.1.0，大约 170MB。里面有编好的页面、`assets/public/ecdict` 词典分片、`assets/public/onnx` 运行时，以及 `assets/public/models` 里的听写和朗读模型。打开后不用再下载。

装到手机上有两种办法：

- 把 `app-debug.apk` 拷到手机，在文件管理器里点开安装。系统如果提示未知来源，允许这一次安装即可。
- 手机打开开发者选项里的 USB 调试，用数据线连上电脑后执行：

```bash
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` 会覆盖已安装的同名调试包，练习记录留在手机上。

手机上的记录和电脑浏览器是分开的。换过去之前，在电脑「设置 → 换设备」导出 `speak-with-me-YYYY-MM-DD.json`，到手机的同一处导入。文件里有场次、笔记和模型密钥。

## 在 GitHub 里打开

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Long-zhengtian/SpeakWithMe)

也可以在仓库页面点 **Code**，再点 **Codespaces**。云端会装好依赖，并自动打开练习页和接口。页面出来之后，到「设置」里填上 API key。密钥只留在这台云端环境里，不会写回仓库。个人账号的 Codespaces 有每月免费额度。

后端测试：

```bash
cd backend
source .venv/bin/activate
pytest
```

## 接上模型

打开主页的「设置」，选择 OpenAI、Grok、智谱 GLM、DeepSeek，或填一个兼容地址。贴上那一家的 API key 后，从该地址的 `/models` 读出模型列表，再选一个。每一家的地址、密钥和选过的模型分开保存。改用另一家时，之前那一家还留着，下次点回去再保存就会重新用它。页面之后只显示密钥末尾几位。

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

聊天上下文只有英语对白。中文求助留在「怎么说」接口里，不会写进对白。借助说出去的句子会标成 `assisted`，指正不会再改它。各功能实际发给模型的提示词和附带内容见 [docs/prompts.md](docs/prompts.md)。

## 第一版的接口

- `GET /api/v1/health`
- `GET /api/v1/catalog`
- `GET /api/v1/profile`
- `GET /api/v1/settings`
- `PUT /api/v1/settings`
- `POST /api/v1/settings/test`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/{id}`
- `PATCH /api/v1/sessions/{id}`
- `DELETE /api/v1/sessions/{id}`
- `POST /api/v1/sessions/{id}/messages`
- `POST /api/v1/sessions/{id}/messages/{message_id}/correction`
- `POST /api/v1/sessions/{id}/coach`
- `POST /api/v1/sessions/{id}/recap`
- `POST /api/v1/sessions/{id}/fork`
- `POST /api/v1/glossary`
- `GET /api/v1/phrases`
- `POST /api/v1/phrases`
- `PATCH /api/v1/phrases/{id}`
- `DELETE /api/v1/phrases/{id}`
- `POST /api/v1/speech/transcribe`
- `POST /api/v1/speech/synthesize`
- `GET /api/v1/backup`
- `POST /api/v1/backup`

交互文档在 http://localhost:8000/docs 。

## 还没做

账号、发音评分，以及真正的语音供应商。点词查的是打包在应用里的 ECDICT 词典，不调用模型。对话里可以按住说话，用的是设备自己的英语识别；对方的话用设备朗读。模型密钥在主页的「设置」里填写，存在这台设备自己的记录里，页面上只显示末尾几位。

换电脑或换手机时，在「设置」里导出一份 `speak-with-me-backup` 文件再导入。同编号的场次和笔记用文件里的版本，文件没提到的留在本机。文件里包含模型密钥。

安卓调试包已经能在本机编出来，练习、词典和备份都在安装包里，不打开电脑上的网页。iOS 还没做。窄屏上「怎么说」是英语输入框旁的按钮，点开后从底部升起一层。
