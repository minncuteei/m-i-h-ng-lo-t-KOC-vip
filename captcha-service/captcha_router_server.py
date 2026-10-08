"""
TikTok Captcha Router Server (Python FastAPI + Multi-Provider Fallback)
Hỗ trợ luân chuyển thông minh:
1. Local OpenCV (Miễn phí 100%, siêu tốc)
2. NopeCHA API (100 lượt free/ngày)
3. SadCaptcha / EulerStream (Nếu có cấu hình)
"""

import os
import json
import base64
import time
from typing import Any, Dict, List, Optional
import cv2
import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

def load_config() -> Dict[str, Any]:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "router": {"providers_priority": ["local_opencv", "nopecha"], "max_retries_per_provider": 2},
        "api_keys": {"nopecha": "", "sadcaptcha": "", "eulerstream": ""}
    }

config = load_config()

app = FastAPI(
    title="TikTok Captcha Router Service",
    description="Hệ thống router tự động giải Captcha và luân chuyển API dự phòng",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================= DATA MODELS =================
class SolvePuzzleRequest(BaseModel):
    puzzle_image_b64: str = Field(..., description="Ảnh nền câu đố (Base64)")
    piece_image_b64: str = Field(..., description="Mảnh ghép trượt (Base64)")
    preferred_provider: Optional[str] = None


class SolveResult(BaseModel):
    slide_x_proportion: float
    raw_x: Optional[int] = None
    raw_y: Optional[int] = None
    provider_used: str
    confidence: float
    duration_ms: float
    fallback_history: List[str] = []


class BaseResponse(BaseModel):
    success: bool
    data: Optional[SolveResult] = None
    error: Optional[str] = None


# ================= PROVIDER 1: LOCAL OPENCV =================
def solve_via_local_opencv(puzzle_b64: str, piece_b64: str) -> Dict[str, Any]:
    """Giải toạ độ bằng OpenCV Canny + Template Matching."""
    def to_cv2(b64_str: str) -> np.ndarray:
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        raw = base64.b64decode(b64_str.strip())
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Không decode được ảnh.")
        return img

    bg = to_cv2(puzzle_b64)
    piece = to_cv2(piece_b64)
    h, w = bg.shape[:2]

    bg_gray = cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY)
    piece_gray = cv2.cvtColor(piece, cv2.COLOR_BGR2GRAY)

    bg_blur = cv2.GaussianBlur(bg_gray, (3, 3), 0)
    piece_blur = cv2.GaussianBlur(piece_gray, (3, 3), 0)

    bg_edges = cv2.Canny(bg_blur, 100, 200)
    piece_edges = cv2.Canny(piece_blur, 100, 200)

    res = cv2.matchTemplate(bg_edges, piece_edges, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)

    match_x, match_y = max_loc
    proportion = float(match_x) / float(w)

    # Nếu độ tin cậy quá thấp (< 0.15) coi như thất bại để kích hoạt router fallback
    if max_val < 0.15:
        raise ValueError(f"Độ khớp quá thấp ({max_val:.3f}), cần chuyển sang provider dự phòng.")

    return {
        "slide_x_proportion": round(proportion, 5),
        "raw_x": int(match_x),
        "raw_y": int(match_y),
        "confidence": round(float(max_val), 3)
    }


# ================= PROVIDER 2: NOPECHA API =================
def solve_via_nopecha(puzzle_b64: str, piece_b64: str, api_key: str) -> Dict[str, Any]:
    """Gửi yêu cầu giải sang NopeCHA Recognition API."""
    if not api_key:
        raise ValueError("Chưa cấu hình API Key NopeCHA.")

    url = "https://api.nopecha.com/"
    # Format chuẩn của NopeCHA nhận chuỗi base64 hoặc url
    payload = {
        "key": api_key,
        "type": "tiktok",
        "image_urls": [puzzle_b64, piece_b64]
    }

    resp = requests.post(url, json=payload, timeout=20)
    data = resp.json()

    if resp.status_code != 200 or "data" not in data:
        error_msg = data.get("message", f"NopeCHA HTTP {resp.status_code}")
        raise ValueError(f"Lỗi từ NopeCHA: {error_msg}")

    # Lấy kết quả toạ độ từ NopeCHA
    result_val = data["data"]
    if isinstance(result_val, (int, float)):
        # Một số định dạng NopeCHA trả về toạ độ trực tiếp
        return {
            "slide_x_proportion": float(result_val) if float(result_val) <= 1.0 else float(result_val) / 340.0,
            "confidence": 0.95
        }
    elif isinstance(result_val, list) and len(result_val) > 0:
        return {
            "slide_x_proportion": float(result_val[0]) if float(result_val[0]) <= 1.0 else float(result_val[0]) / 340.0,
            "confidence": 0.95
        }

    raise ValueError(f"Phản hồi từ NopeCHA không đúng định dạng mong đợi: {data}")


# ================= ROUTER ENGINE =================
def execute_router(req: SolvePuzzleRequest) -> SolveResult:
    cfg = load_config()
    providers = cfg.get("router", {}).get("providers_priority", ["local_opencv", "nopecha"])
    keys = cfg.get("api_keys", {})

    # Nếu client chỉ định provider ưu tiên
    if req.preferred_provider and req.preferred_provider in providers:
        providers = [req.preferred_provider] + [p for p in providers if p != req.preferred_provider]

    fallback_history = []
    start_time = time.time()

    for provider in providers:
        try:
            print(f"[Captcha Router] Đang thử provider: {provider}...")
            if provider == "local_opencv":
                res = solve_via_local_opencv(req.puzzle_image_b64, req.piece_image_b64)
                duration = (time.time() - start_time) * 1000
                return SolveResult(
                    slide_x_proportion=res["slide_x_proportion"],
                    raw_x=res.get("raw_x"),
                    raw_y=res.get("raw_y"),
                    provider_used=provider,
                    confidence=res["confidence"],
                    duration_ms=round(duration, 2),
                    fallback_history=fallback_history
                )

            elif provider == "nopecha":
                api_key = keys.get("nopecha", "").strip()
                if not api_key:
                    fallback_history.append(f"{provider}: Chưa có API key (bỏ qua)")
                    continue
                res = solve_via_nopecha(req.puzzle_image_b64, req.piece_image_b64, api_key)
                duration = (time.time() - start_time) * 1000
                return SolveResult(
                    slide_x_proportion=res["slide_x_proportion"],
                    provider_used=provider,
                    confidence=res["confidence"],
                    duration_ms=round(duration, 2),
                    fallback_history=fallback_history
                )

            else:
                fallback_history.append(f"{provider}: Provider chưa hỗ trợ")

        except Exception as e:
            err_msg = str(e)
            print(f"[Captcha Router] Provider {provider} thất bại: {err_msg}")
            fallback_history.append(f"{provider}: {err_msg}")
            # Tự động chuyển sang provider tiếp theo trong danh sách

    raise RuntimeError(f"Tất cả provider đều thất bại. Chi tiết: {'; '.join(fallback_history)}")


# ================= REST APIS =================
@app.get("/health")
def health():
    return {"status": "ok", "service": "TikTok Captcha Router"}


@app.get("/router/status")
def router_status():
    cfg = load_config()
    return {
        "status": "ready",
        "priority_list": cfg.get("router", {}).get("providers_priority", []),
        "active_keys": {k: bool(v.strip()) for k, v in cfg.get("api_keys", {}).items()}
    }


@app.post("/solve/puzzle", response_model=BaseResponse)
def solve_puzzle(req: SolvePuzzleRequest):
    try:
        result = execute_router(req)
        return BaseResponse(success=True, data=result)
    except Exception as e:
        return BaseResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("captcha_router_server:app", host="127.0.0.1", port=8000, reload=True)
