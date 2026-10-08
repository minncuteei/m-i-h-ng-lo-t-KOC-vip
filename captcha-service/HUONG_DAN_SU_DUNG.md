# HƯỚNG DẪN TÍCH HỢP & SỬ DỤNG BỘ AUTO CAPTCHA ROUTER (KOC VIP)

Hệ thống được thiết kế theo kiến trúc **Router Luân Chuyển Thông Minh (Multi-Provider Fallback)** để giải quyết triệt để vấn đề bị dính Captcha khi mời hàng loạt KOC TikTok Shop.

---

## 1. Cấu Trúc Thư Mục `captcha-service`

Thư mục đã được tạo sẵn tại:
`/Users/nhatminh/Downloads/mời hàng loạt KOC vip/captcha-service`

* `captcha_router_server.py`: Server Backend tiếp nhận và điều phối giải captcha.
* `config.json`: Nơi cấu hình thứ tự ưu tiên các nhà cung cấp và dán API Key.
* `start_server.command`: File 1-click để khởi động server trên macOS.
* `auto-captcha-solver.js`: Client Script tự động bắt popup TikTok và mô phỏng chuột kéo khớp.
* `requirements.txt`: Danh sách thư viện Python cần thiết.

---

## 2. Cơ Chế Hoạt Động Của Router Luân Chuyển

Khi gặp Captcha trên tab TikTok, hệ thống sẽ thực hiện theo quy trình dự phòng 3 tầng:

```
[TikTok Xuất Hiện Puzzle Captcha]
              │
              ▼
   [Tầng 1: Local OpenCV] ────(Thành công)───► [Mô phỏng chuột kéo khớp]
              │ (Nếu thất bại hoặc góc quay phức tạp)
              ▼
    [Tầng 2: NopeCHA API]  ────(Thành công)───► [Mô phỏng chuột kéo khớp]
              │ (Nếu hết quota 100 lượt/ngày hoặc lỗi mạng)
              ▼
    [Tầng 3: Tự Động Fallback Sang Giải Tay]
    (Hiện thông báo cho người dùng kéo nhẹ 1 cái để không bao giờ bị đứng tool)
```

---

## 3. Cách Khởi Động Server (1 Phút)

### Cách 1: Bấm Đúp Chuột (1-Click)
Bấm đúp chuột vào file:
👉 **`start_server.command`**  
*(Hệ thống sẽ tự mở Terminal, kiểm tra thư viện và bật server tại `http://127.0.0.1:8000`)*

### Cách 2: Chạy Bằng Lệnh Terminal
```bash
cd "/Users/nhatminh/Downloads/mời hàng loạt KOC vip/captcha-service"
pip3 install -r requirements.txt
python3 captcha_router_server.py
```

---

## 4. Cách Lấy API Key NopeCHA Miễn Phí (100 Lượt/Ngày)

1. Truy cập trang web: [https://nopecha.com/](https://nopecha.com/)
2. Đăng ký tài khoản miễn phí bằng Google hoặc Email.
3. Vào trang cá nhân lấy chuỗi **API Key**.
4. Mở file `config.json` và dán key vào:
```json
{
  "api_keys": {
    "nopecha": "DÁN_API_KEY_CỦA_BẠN_VÀO_ĐÂY"
  }
}
```
*Lưu ý: Nếu không có key NopeCHA, hệ thống vẫn tự động chạy bằng Tầng 1 (Local OpenCV hoàn toàn miễn phí).*

---

## 5. Cách Tích Hợp Vào Extension "Mời Hàng Loạt KOC VIP"

Để extension tự động giải ngầm mỗi khi mời KOC dính captcha:

Mở file manifest của extension:
`/Users/nhatminh/Downloads/mời hàng loạt KOC vip/manifest.json`

Tại mục `content_scripts`, thay thế `src/content/captcha-detector.js` bằng `captcha-service/auto-captcha-solver.js`:
```json
    {
      "js": [
        "captcha-service/auto-captcha-solver.js"
      ],
      "matches": [
        "https://affiliate.tiktok.com/*",
        "https://affiliate-us.tiktok.com/*",
        "https://affiliate.tiktokglobalshop.com/*",
        "https://affiliate.tiktokshopglobalselling.com/*",
        "https://seller-vn.tiktok.com/*",
        "https://seller.tiktok.com/*"
      ],
      "all_frames": false,
      "run_at": "document_start"
    }
```
Vào `chrome://extensions`, bấm nút **Reload (Tải lại)** extension "Mời hàng loạt KOC VIP".
Từ giờ mỗi khi popup Captcha hiện lên, tiện ích sẽ tự gọi Server, tính toạ độ và tự kéo mượt mà mà bạn không cần phải can thiệp.
