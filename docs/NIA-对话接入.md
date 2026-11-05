# NIA 对话接入 · 2026-11-05

官方文档：https://nia.sensetime.com/api-doc

## 当前真实接通范围

NIA 负责对白生成，现有内网音色服务负责朗读。官方纯 WebSocket 协议支持 `tts.enabled=false`，因此不会和现有音色重复播放。真实测试使用 `SenseNova-V7.0-omni`，成功返回文本；官网体验页的一个模型别名在本次调用中只返回空回复，未继续使用。

服务端使用 `wss://nia.sensetime.com/biz/duplex/ws1`，以 AK/SK 签发三分钟 JWT。顺序为 CreateSession → ConfigPipeline → StartServing → PostMultimodalGenerate → 收集 ResponseTextSegment → ResponseEndTextStream 后关闭。ConfigPipeline 关闭 NIA 自带 TTS、搜索和 RAG，没有注册任何工具。没有申请 RTC 频道、开启摄像头或发送麦克风音频。

## 配置与启动

- `.env.server.local`：NIA_ACCESS_KEY、NIA_SECRET_KEY、NIA_MODEL_NAME，仅服务端读取，文件不提交。
- `.env.local`：VITE_DIALOGUE_SERVICE_URL，指向本机 Node 服务。
- `npm run dialogue`：启动 `server/index.mjs`，仅监听 127.0.0.1:4894。
- `GET /api/dialogue/config`：仅返回 configured 与 model，不返回密钥、JWT 或用户资料。
- `POST /api/dialogue`：接收当前人设、话语及近期记录，返回当前角色的一条文本。
- 原 Python 启动器在存在本机配置且找到 Node 时启动对话服务；关闭时只终止自己创建的进程。

## 人设与记录

客户端只提取名字、身份类型、性格、简介、创作方向等精简字段；原始 sourceNotes、referenceImage、声音配置不发送。近期记录限制 12 条。单独对话只使用该艺术家的记录；群聊只使用该群记录和本轮已实际发出的其他成员回复。

共同提示要求：日常短对白、不强迫创作、不每句追问、允许不同意见、承认不确定、尊重拒绝、不冒充历史本人。角色卡和记录是资料而非权限指令。没有任何收藏、换景、图像生成等模型工具，台词不会变成执行命令。

## 状态与取消

人物头顶在生成期间显示思考气泡。模型返回后保存对白，再调用现有声音播放；群聊上一位生成和朗读结束后再轮到下一位。打断、离开群聊、打开管理弹窗、切到后台会取消相应请求并关闭上游会话。NIA 失败时说明“本地剧本回退”，保留可用的本地体验。

密钥缺失时服务仅报告未配置。模型鉴权、额度、配置或网络失败会返回经过处理的错误，不输出上游 URL、签名或异常原始内容。没有把生成请求、聊天、音频写入服务端日志。

## 本次边界

已经接入模型的文本对话；NIA 的实时 ASR、输入音频流、RTC 与全双工打断尚未接入。现有麦克风仍走浏览器识别。完整人设文稿尚未直接变成 RAG 知识库或训练数据。公开部署需要独立服务端、身份与额度控制，目前仅为本机游戏服务。
