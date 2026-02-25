from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import os
import shutil

app = FastAPI(title="Local STT Service")

# 允许本地 Next.js 页面跨域访问（如果你未来想直接从前端调用这个服务）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 关键函数：加载本地语音识别模型（默认 small，CPU + int8）
model_size = os.environ.get("LOCAL_STT_MODEL", "small")
device = os.environ.get("LOCAL_STT_DEVICE", "cpu")
compute_type = os.environ.get("LOCAL_STT_COMPUTE", "int8")

model = WhisperModel(model_size, device=device, compute_type=compute_type)


@app.get("/health")
async def health():
    """健康检查：前端可用于检测本地语音服务是否已启动。"""
    return {"status": "ok", "model": model_size}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    关键接口：接收前端音频文件（webm / wav 等），返回识别出的文本。
    """
    if not file:
        raise HTTPException(status_code=400, detail="未收到音频文件")

    filename = file.filename or "audio.webm"
    suffix = os.path.splitext(filename)[1] or ".webm"

    tmp_path = None
    try:
        # 将上传文件写入临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)

        # 使用 faster-whisper 进行识别
        segments, info = model.transcribe(tmp_path, language="zh")
        text_parts = [seg.text for seg in segments]
        text = "".join(text_parts).strip()

        if not text:
            raise HTTPException(status_code=500, detail="语音识别结果为空，请再试一次。")

        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"本地语音服务出错：{e}") from e
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                # 如果删除失败，不影响主流程
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

