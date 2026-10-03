# TÀI LIỆU THAM KHẢO UI/UX & TRẠNG THÁI TIẾN TRÌNH (TỪ PROJECT STONK AI BOOKING)

> **MỤC ĐÍCH TÀI LIỆU:**
> * Đây là tài liệu **tham khảo ý tưởng thiết kế, luồng hiển thị trạng thái và UX pattern** từ project `STONK AI BOOKING`.
> * **Nguyên tắc:** KHÔNG copy code, KHÔNG sao chép nguyên mẫu giao diện, KHÔNG làm ảnh hưởng đến kiến trúc hiện tại của module `Mời hàng loạt KOC VIP`.
> * Sau này khi có yêu cầu "tham khảo Booking", đọc tài liệu này để chắt lọc pattern phù hợp và hiện thực hóa theo logic độc lập, gọn nhẹ của module mới.

---

## 1. Tổng quan cơ chế hiển thị & Điều hướng (UI / Layout)

### 1.1. Cấu trúc Modal 3 cột cân đối
* **Cột 1 (Thông tin chiến dịch):** Tên đợt, nhân viên phụ trách, thời hạn hiệu lực, loại nội dung (Video/Live), tỷ lệ hoa hồng (Thường / Ads) và liên hệ Zalo/Facebook.
* **Cột 2 (Chọn sản phẩm):** Danh mục sản phẩm từ shop, công cụ tìm kiếm, checkbox chọn hàng loạt và bộ đếm sản phẩm đã chọn (tối đa 100 SP).
* **Cột 3 (Hàng mẫu & Xem trước):** Lựa chọn chế độ cấp mẫu (thủ công / tự động) và khung xem trước nội dung tin nhắn gửi tới KOC.

### 1.2. Cơ chế Thanh thu nhỏ Mini (`inviteMinibar`)
* **Cách hoạt động:** Khi người dùng đóng modal hoặc bấm nút thu nhỏ trong lúc đang xử lý/soạn thảo, hệ thống không làm mất dữ liệu nháp mà tạo một widget nổi cố định:
  * Vị trí: `position: fixed; right: 18px; bottom: 18px; z-index: 9999;`
  * Giao diện: Khung bo góc mềm mại, viền tím thương hiệu, đổ bóng nổi bật trên nền TikTok.
  * Nội dung: Gồm tiêu đề `Tạo lời mời KOC` và dòng trạng thái động:
    * Khi đang chạy: `Đang chạy, bấm để mở lại...`
    * Khi ở trạng thái chờ: `Đang giữ bản nháp`
  * Tương tác: Bấm vào thanh Mini là mở lại popup chính ngay lập tức (`showModal()`), giữ nguyên toàn bộ trạng thái đang thực thi.

### 1.3. Thanh tiến trình thu nhỏ trên Header (`headerInviteProgress`)
* Nằm cố định trên thanh điều hướng góc trên:
  * Hiển thị phần trăm hoàn thành: `0% ➔ 100%`
  * Đồng hồ bấm giờ thực tế (`00:00:00`)
  * Vạch tiến trình mini (`hip-track` & `hipFill`)
  * Bấm vào nút này lập tức mở modal chi tiết báo cáo lượt mời đang chạy.

---

## 2. Quản lý Trạng thái & Tiến trình (Loading / Progress)

### 2.1. Đồng hồ đếm thời gian thực (Live Stopwatch Timer)
* Gắn mốc `startedAtMs` ngay khi bắt đầu bấm gửi.
* Đồng hồ nhảy giây liên tục (`inviteElapsedMs`) giúp người dùng nhìn thấy rõ ràng hệ thống đang hoạt động và không có cảm giác bị "đơ" hay "treo" trình duyệt.
* Khi kết thúc, tính toán chính xác tổng thời lượng: `Hoàn thành lúc 10:45 · tổng 14 phút` (đã trừ đi thời gian tạm dừng).

### 2.2. Vạch tiến trình hai lớp (Two-tier Progress Bar)
* **Lớp 1 (Phần trăm tổng thể):** Tính theo tỷ lệ `(Đã xử lý: Thành công + Bỏ qua + Thất bại) / Tổng số KOC`.
* **Lớp 2 (Phần nhóm / Shard):** Hiển thị rõ tiến độ theo từng nhóm 50 KOC (`Nhóm 1/7`, `Nhóm 2/7`...), giúp người dùng ước lượng được số bước TikTok đang thực hiện.

### 2.3. Trạng thái nút bấm biến đổi ngữ cảnh
* Khi chưa gửi: Nút màu tím thương hiệu `Gửi thật`.
* Trong lúc gửi: Nút chuyển sang trạng thái `busy` (`aria-busy="true"`), khóa click chống gửi lặp.
* Sau khi tạo tiến trình xong: Nút chuyển sang màu xanh lá `Xem tiến trình` để người dùng bấm vào xem bảng nhật ký chi tiết bất kỳ lúc nào.

---

## 3. Phân loại Trạng thái & Lý do lỗi (Status & Reasons)

### 3.1. Nguyên tắc vàng: "Trạng thái và Lý do không nói cùng một câu"
* **TRẠNG THÁI (Ngắn gọn - Dạng Badge màu):**
  * `Đã gửi` (Xanh lá - `success`): KOC đã nhận lời mời thành công.
  * `Bỏ qua` (Cam - `skipped`): KOC bị bỏ qua do trùng lặp hoặc đã gửi trước đó.
  * `Thất bại` (Đỏ - `failed`): Lỗi từ API TikTok hoặc vi phạm chính sách.
  * `Đang chờ` (Xám - `pending`): Đang nằm trong hàng đợi lượt tiếp theo.
  * `Chờ ngày mai` (Vàng - `waiting_daily_reset`): Đã chạm trần hạn mức ngày của TikTok Shop, chờ 00:00 đêm reset.
* **LÝ DO (Diễn giải chi tiết tiếng Việt thân thiện):**
  * Thay vì hiển thị mã lỗi kỹ thuật vô nghĩa (`Invalid parameter`, `code 98001004`, `code 16024016`):
    * `KOC đang có lời mời hiệu lực tại nhóm khác`
    * `Tài khoản liên kết với Shop (không thể mời qua Affiliate)`
    * `Trùng tên nhóm gửi lời mời`
    * `Shop đã dùng hết hạn mức 10.000 KOC / ngày`

### 3.2. Bảng thống kê KPI kết quả tổng hợp
* Xếp thành 6 thẻ chỉ số trực quan:
  1. **Tổng:** Tổng số KOC trong đợt gửi.
  2. **Thành công:** Số KOC đã tạo lời mời thành công (màu xanh).
  3. **Thất bại:** Số KOC bị từ chối (màu đỏ).
  4. **Bỏ qua:** Số KOC trùng lặp được hệ thống lọc trước (màu cam).
  5. **Đang chờ:** Số KOC còn lại chưa xử lý (màu xám).
  6. **Lời mời đã tạo:** Số nhóm TikTok đã tạo thành công trong ngày.
* **Khối Top 3 lý do không thành công:** Tự động gom nhóm các lý do lỗi phổ biến nhất để người vận hành nhìn thấy ngay nguyên nhân chính (ví dụ: `• 45 KOC — Đang có lời mời hiệu lực`).

---

## 4. Các UX Pattern đáng giá để tham khảo cho Module Mới

### Pattern 1: Picture-in-Picture / Floating Mini Bar khi chạy ngầm
* **Ý tưởng:** Khi bấm gửi, người dùng thường muốn tắt bảng to để tiếp tục lướt web/kiểm tra đơn hàng trên TikTok.
* **Ứng dụng:** 
  * Cho phép đóng popup lớn mà tiến trình nền **vẫn chạy 100%**.
  * Thu nhỏ thành một thanh trạng thái mini góc màn hình có logo nhấp nháy, hiển thị `Đang gửi: 45/344 KOC (Nhóm 1/7)` kèm thanh progress bar mini.
  * Click vào thanh mini là bung lại bảng điều khiển to ngay lập tức mà không mất dữ liệu.

### Pattern 2: Ngăn chặn gửi trùng lặp & Khôi phục phiên (Run Session Persistence)
* Lưu trữ `currentRunId` vào bộ nhớ cục bộ (`IndexedDB` / `chrome.storage.local`).
* Khi người dùng vô tình bấm F5 hoặc mở lại extension, hệ thống tự động nhận diện đợt mời đang chạy và hiển thị tiếp tiến trình thay vì quay lại form trống ban đầu.

### Pattern 3: Định dạng số liệu thân thiện tiếng Việt
* Sử dụng dấu chấm phân cách hàng nghìn (`1.000`, `10.000`) cho tất cả các chỉ số KOC và nhóm.
* Đếm giờ hiển thị trực quan dạng `hh:mm:ss` giúp giao diện luôn sống động và minh bạch.

---

> **LƯU Ý KHI TRIỂN KHAI:**
> Khi áp dụng các pattern trên vào module **Mời hàng loạt KOC VIP**, cần giữ mã nguồn tinh gọn, trực tiếp, chạy độc lập trong Content Script và UI Extension hiện tại, không phụ thuộc vào backend phức tạp của Booking.
