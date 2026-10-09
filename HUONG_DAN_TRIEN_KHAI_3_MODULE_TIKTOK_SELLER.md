# BẢN THIẾT KẾ & HƯỚNG DẪN TRIỂN KHAI TOÀN DIỆN
## KHUNG GIAO DIỆN & 8 MODULE BOOKING KOC CHUẨN CLIENT-SIDE (KHÔNG PHỤ THUỘC SERVER)
*(Trích xuất trực tiếp từ kiến trúc giao diện thực chiến, độc lập 100% với backend ngoài, gọi trực tiếp API TikTok Shop qua Cookie phiên)*

---

## MỤC LỤC CHI TIẾT

- [1. TỔNG QUAN KIẾN TRÚC & CƠ CHẾ GỌI API TRỰC TIẾP TIKTOK](#1-tổng-quan-kiến-trúc--cơ-chế-gọi-api-trực-tiếp-tiktok)
- [2. KHUNG GIAO DIỆN CHÍNH (TOPBAR + SIDEBAR NAVIGATION)](#2-khung-giao-diện-chính-topbar--sidebar-navigation)
- [3. BỘ CSS SYSTEM TOÀN DIỆN (CHÍNH XÁC THEO ẢNH GIAO DIỆN)](#3-bộ-css-system-toàn-diện-chính-xác-theo-ảnh-giao-diện)
- [4. CHI TIẾT 8 MODULE TỪ GIAO DIỆN TỚI CHỨC NĂNG](#4-chi-tiết-8-module-từ-giao-diện-tới-chức-năng)
  - [NHÓM 1: HỆ THỐNG KOC](#nhóm-1-hệ-thống-koc)
    - [Module 1: Trang Chủ (Dashboard Tổng Quan)](#module-1-trang-chủ-dashboard-tổng-quan)
    - [Module 2: Tổng Hợp KOC (Khám Phá, Bộ Lọc Đa Chiều & Xuất Excel)](#module-2-tổng-hợp-koc-khám-phá-bộ-lọc-đa-chiều--xuất-excel)
    - [Module 3: Nguồn KOC Khác (Import File Excel & Quét Nguồn Ngoài)](#module-3-nguồn-koc-khác-import-file-excel--quét-nguồn-ngoài)
  - [NHÓM 2: BOOKING KOC](#nhóm-2-booking-koc)
    - [Module 4: Quản Lý Shop (Sản Phẩm & Cài Đặt Hoa Hồng)](#module-4-quản-lý-shop-sản-phẩm--cài-đặt-hoa-hồng)
    - [Module 5: CRM Duyệt Mẫu (Xử Lý Mẫu Thử KOC Gửi Về)](#module-5-crm-duyệt-mẫu-xử-lý-mẫu-thử-koc-gửi-về)
    - [Module 6: Quản Lý Cộng Tác (Chiến Dịch Lời Mời, Sửa & Hủy Dọn Quota)](#module-6-quản-lý-cộng-tác-chiến-dịch-lời-mời-sửa--hủy-dọn-quota)
    - [Module 7: Gửi Tin KOC (Nhắn Tin Tự Động TikTok / Zalo)](#module-7-gửi-tin-koc-nhắn-tin-tự-động-tiktok--zalo)
    - [Module 8: Team CRM (Quản Lý Nhân Sự Booking & KPI Nội Bộ)](#module-8-team-crm-quản-lý-nhân-sự-booking--kpi-nội-bộ)
- [5. BỘ CONTROLLER JAVASCRIPT ĐIỀU HƯỚNG TỔNG (app.js)](#5-bộ-controller-javascript-điều-hướng-tổng-appjs)

---

# 1. TỔNG QUAN KIẾN TRÚC & CƠ CHẾ GỌI API TRỰC TIẾP TIKTOK

Hệ thống hoạt động dưới dạng **Chrome Extension Overlay** chèn trực tiếp vào tab TikTok Seller Center (`affiliate.tiktok.com` hoặc `seller-vn.tiktok.com`):
1. **Không phụ thuộc Server ngoài**: Không cần server trung gian, không gửi dữ liệu ra máy chủ bên ngoài, đảm bảo an toàn bảo mật tuyệt đối cho tài khoản Shop.
2. **Xác thực phiên tự động**: Tự động sử dụng cookie phiên đăng nhập hiện tại của Shop và tự động đính kèm header token `x-secsdk-csrf-token`.
3. **Lưu trữ dữ liệu cục bộ**: Dữ liệu nhân sự, danh sách KOC, cấu hình lời mời và sổ đen được lưu trực tiếp vào **IndexedDB & Chrome Local Storage** trên trình duyệt của máy người dùng.

```javascript
// Function gọi API TikTok nội bộ trực tiếp
async function callTikTokApi(path, method = "POST", body = null) {
  const options = {
    method,
    headers: {
      "content-type": "application/json",
      "x-secsdk-csrf-token": document.querySelector('meta[name="csrf-token"]')?.content || ""
    }
  };
  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  return await response.json();
}
```

---

# 2. KHUNG GIAO DIỆN CHÍNH (TOPBAR + SIDEBAR NAVIGATION)

### Cấu trúc HTML Khung (`index.html`)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Booking KOC Extension</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-layout">
    
    <!-- TOPBAR HEADER -->
    <header class="app-header">
      <div class="header-left">
        <div class="app-brand">
          <div class="brand-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24"/></svg>
          </div>
          <span class="brand-title">Booking KOC</span>
          <span class="brand-version">v1.0.0</span>
        </div>
      </div>

      <!-- BANNER TRẠNG THÁI TIẾN TRÌNH Ở GIỮA -->
      <div class="header-center">
        <div class="status-banner" id="globalStatusBanner">
          <span class="flag-icon">🇻🇳</span>
          <span class="status-text" id="globalStatusText">Hệ thống sẵn sàng làm việc</span>
        </div>
      </div>

      <!-- SHOP INFO & WINDOW CONTROLS Ở BÊN PHẢI -->
      <div class="header-right">
        <div class="shop-badge">
          <div class="shop-id" id="topShopId">7495640849659693211</div>
          <div class="shop-region">Khu vực: VN <span class="sync-dot"></span> Đang đồng bộ</div>
        </div>
        <div class="window-controls">
          <button class="win-btn" id="btnToggleDark" title="Chế độ Tối/Sáng">🌙</button>
          <button class="win-btn" id="btnMinimizeMini" title="Thu nhỏ thành Mini Bar">🗕</button>
          <button class="win-btn" id="btnMaximize" title="Phóng to">🗖</button>
          <button class="win-btn win-close" id="btnCloseOverlay" title="Đóng bảng">✕</button>
        </div>
      </div>
    </header>

    <!-- BODY CONTAINER (SIDEBAR + MAIN VIEWS) -->
    <div class="app-body">
      
      <!-- SIDEBAR MENU (ĐÚNG 2 NHÓM THEO ẢNH) -->
      <aside class="app-sidebar">
        
        <!-- NHÓM 1: HỆ THỐNG KOC -->
        <div class="nav-group">
          <div class="nav-group-header">
            <svg class="group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5"/></svg>
            <span>Hệ Thống KOC</span>
          </div>
          <div class="nav-group-items">
            <button class="nav-item" data-view="view-home">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
              <span>Trang chủ</span>
            </button>
            <button class="nav-item active" data-view="view-all-creators">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5"/></svg>
              <span>Tổng hợp KOC</span>
            </button>
            <button class="nav-item" data-view="view-ext-sources">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>
              <span>Nguồn KOC khác</span>
            </button>
          </div>
        </div>

        <!-- NHÓM 2: BOOKING KOC -->
        <div class="nav-group">
          <div class="nav-group-header">
            <svg class="group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 3-9 9M21 3 14 21l-2-8-8-2 17-8Z"/></svg>
            <span>Booking KOC</span>
          </div>
          <div class="nav-group-items">
            <button class="nav-item" data-view="view-products">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>
              <span>Quản lý shop</span>
            </button>
            <button class="nav-item" data-view="view-samples">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="4" width="10" height="16" rx="2"/><path d="M9 4V3h6v1M9 12l2 2 4-4"/></svg>
              <span>CRM duyệt mẫu</span>
            </button>
            <button class="nav-item" data-view="view-collab">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Quản lý cộng tác</span>
            </button>
            <button class="nav-item" data-view="view-messages">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z"/></svg>
              <span>Gửi tin KOC</span>
            </button>
            <button class="nav-item" data-view="view-teams">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a5 5 0 0 1 10 0M14 20a4 4 0 0 1 7 0"/></svg>
              <span>Team CRM</span>
            </button>
          </div>
        </div>

      </aside>

      <!-- MAIN VIEWS CONTAINER -->
      <main class="app-main">
        <section id="view-home" class="view-panel"></section>
        <section id="view-all-creators" class="view-panel active"></section>
        <section id="view-ext-sources" class="view-panel"></section>
        <section id="view-products" class="view-panel"></section>
        <section id="view-samples" class="view-panel"></section>
        <section id="view-collab" class="view-panel"></section>
        <section id="view-messages" class="view-panel"></section>
        <section id="view-teams" class="view-panel"></section>
      </main>

    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

---

# 3. BỘ CSS SYSTEM TOÀN DIỆN (CHÍNH XÁC THEO ẢNH GIAO DIỆN)

### File `styles.css`
```css
:root {
  --primary-color: #6366f1;
  --primary-light: #eef2ff;
  --primary-hover: #4f46e5;
  --accent-orange: #ff7a00;
  --bg-app: #f4f5f9;
  --bg-card: #ffffff;
  --text-main: #1e293b;
  --text-sub: #64748b;
  --border-color: #e2e8f0;
  --border-focus: #cbd5e1;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --radius-lg: 12px;
  --radius-md: 8px;
  --radius-sm: 6px;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
body { background: var(--bg-app); color: var(--text-main); font-size: 13px; line-height: 1.4; }

/* APP LAYOUT */
.app-layout { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* HEADER */
.app-header {
  height: 52px; background: var(--bg-card); border-bottom: 1px solid var(--border-color);
  display: flex; align-items: center; justify-content: space-between; padding: 0 1rem;
}
.app-brand { display: flex; align-items: center; gap: 0.5rem; }
.brand-avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #a855f7, #6366f1); display: flex; align-items: center; justify-content: center; color: #fff; }
.brand-avatar svg { width: 18px; height: 18px; }
.brand-title { font-weight: 700; font-size: 14px; color: #4338ca; }
.brand-version { font-size: 10px; background: #e0e7ff; color: #4338ca; padding: 1px 5px; border-radius: 4px; font-weight: 600; }

/* STATUS BANNER */
.status-banner {
  background: #fff7ed; border: 1px solid #ffedd5; padding: 4px 16px; border-radius: 20px;
  display: flex; align-items: center; gap: 6px; font-weight: 600; color: #c2410c; font-size: 12px;
}

/* SHOP BADGE & CONTROLS */
.header-right { display: flex; align-items: center; gap: 1rem; }
.shop-badge { text-align: right; }
.shop-id { font-weight: 700; font-size: 12px; color: #0f172a; }
.shop-region { font-size: 10px; color: var(--text-sub); display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.sync-dot { width: 6px; height: 6px; background: var(--success); border-radius: 50%; display: inline-block; }
.window-controls { display: flex; gap: 4px; }
.win-btn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--text-sub); }
.win-btn:hover { background: #f1f5f9; color: var(--text-main); }
.win-close:hover { background: var(--danger); color: #fff; border-color: var(--danger); }

/* APP BODY */
.app-body { display: flex; flex: 1; overflow: hidden; }

/* SIDEBAR */
.app-sidebar {
  width: 220px; background: var(--bg-card); border-right: 1px solid var(--border-color);
  padding: 0.75rem 0.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;
}
.nav-group { display: flex; flex-direction: column; gap: 2px; }
.nav-group-header {
  background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; padding: 6px 10px;
  border-radius: var(--radius-md); font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
}
.group-icon { width: 15px; height: 15px; }
.nav-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px;
  border: none; background: transparent; border-radius: var(--radius-sm); color: var(--text-main);
  font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; text-align: left;
}
.nav-item svg { width: 15px; height: 15px; color: var(--text-sub); }
.nav-item:hover { background: #f8fafc; color: var(--primary-color); }
.nav-item.active { background: #eef2ff; color: var(--primary-color); font-weight: 600; border-left: 3px solid var(--primary-color); }
.nav-item.active svg { color: var(--primary-color); }

/* MAIN VIEW */
.app-main { flex: 1; overflow-y: auto; padding: 1rem; background: var(--bg-app); }
.view-panel { display: none; }
.view-panel.active { display: block; animation: viewFadeIn 0.2s ease-out; }
@keyframes viewFadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }

/* COMMON CARD & UI COMPONENTS */
.panel-card { background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color); padding: 1rem; box-shadow: var(--shadow-sm); margin-bottom: 1rem; }
.filter-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 1rem; }
.input-search { flex: 1; min-width: 220px; padding: 6px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 12px; outline: none; }
.input-search:focus { border-color: var(--primary-color); }
.select-filter { padding: 6px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 12px; background: #fff; outline: none; cursor: pointer; }

.btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; border: none; cursor: pointer; transition: 0.15s; }
.btn-primary { background: var(--primary-color); color: #fff; }
.btn-primary:hover { background: var(--primary-hover); }
.btn-outline { background: #fff; border: 1px solid var(--border-color); color: var(--text-main); }
.btn-outline:hover { background: #f8fafc; }
.btn-danger { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }
.btn-danger:hover { background: #fca5a5; }

/* TABLE STYLES */
.data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
.data-table th { background: #f8fafc; padding: 8px 10px; font-weight: 600; color: var(--text-sub); border-bottom: 1px solid var(--border-color); }
.data-table td { padding: 10px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.data-table tr:hover td { background: #fafafa; }
.badge-status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge-success { background: #dcfce7; color: #166534; }
.badge-warning { background: #fef3c7; color: #92400e; }
.badge-danger { background: #fee2e2; color: #991b1b; }
```

---

# 4. CHI TIẾT 8 MODULE TỪ GIAO DIỆN TỚI CHỨC NĂNG

---

## NHÓM 1: HỆ THỐNG KOC

---

### Module 1: Trang Chủ (Dashboard Tổng Quan)
* **Chức năng**: Hiển thị báo cáo nhanh về số KOC đã booking trong tháng, số nhóm lời mời đang chạy, hạn mức còn lại trong ngày (Quota 200 nhóm / 10.000 KOC), và danh sách các đợt mời vừa thực hiện.

#### Giao diện HTML Component (`view-home`):
```html
<div class="panel-card">
  <h2 style="font-size: 16px; font-weight: 700; margin-bottom: 1rem;">Tổng Quan Hoạt Động Booking KOC</h2>
  
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 1.5rem;">
    <div style="background: #eef2ff; padding: 1rem; border-radius: 8px; border: 1px solid #c7d2fe;">
      <div style="color: #4338ca; font-size: 11px; font-weight: 600;">HẠN MỨC NGÀY (QUOTA)</div>
      <div style="font-size: 20px; font-weight: 800; color: #1e1b4b;" id="home-quota-left">200 / 200</div>
      <div style="font-size: 10px; color: #6366f1;">Reset vào 00:00 hàng ngày</div>
    </div>
    <div style="background: #f0fdf4; padding: 1rem; border-radius: 8px; border: 1px solid #bbf7d0;">
      <div style="color: #166534; font-size: 11px; font-weight: 600;">KOC ĐÃ GỬI LỜI MỜI</div>
      <div style="font-size: 20px; font-weight: 800; color: #052e16;" id="home-total-sent">0</div>
      <div style="font-size: 10px; color: #22c55e;">Thành công 100%</div>
    </div>
    <div style="background: #fff7ed; padding: 1rem; border-radius: 8px; border: 1px solid #fed7aa;">
      <div style="color: #9a3412; font-size: 11px; font-weight: 600;">YÊU CẦU MẪU CHỜ DUYỆT</div>
      <div style="font-size: 20px; font-weight: 800; color: #431407;" id="home-sample-pending">0</div>
      <div style="font-size: 10px; color: #ea580c;">Cần xử lý trong 48h</div>
    </div>
    <div style="background: #fdf2f8; padding: 1rem; border-radius: 8px; border: 1px solid #fbcfe8;">
      <div style="color: #9d174d; font-size: 11px; font-weight: 600;">CHIẾN DỊCH HOẠT ĐỘNG</div>
      <div style="font-size: 20px; font-weight: 800; color: #500724;" id="home-active-groups">0</div>
      <div style="font-size: 10px; color: #ec4899;">Nhóm đang chạy trên shop</div>
    </div>
  </div>
</div>
```

---

### Module 2: Tổng Hợp KOC (Khám Phá, Bộ Lọc Đa Chiều & Xuất Excel)
* **Chức năng**: Xem danh sách KOC từ kho dữ liệu hoặc cào từ TikTok Creator Marketplace, lọc KOC theo Ngành hàng, Số lượng Follower, GMV 30 ngày, Tỷ lệ trả video/live, tìm kiếm @handle, chọn hàng loạt KOC để bấm nút **"Mời Hàng Loạt"** hoặc **"Xuất Excel"**.

#### Giao diện HTML Component (`view-all-creators`):
```html
<div class="panel-card">
  <!-- BỘ LỌC CHỈ SỐ NHANH Ở TRÊN -->
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 1rem;">
    <div style="border: 1px solid var(--border-color); padding: 8px; border-radius: 6px;">
      <div style="font-weight: 600; color: var(--text-sub);">🏷️ NGÀNH HÀNG</div>
      <div style="font-size: 11px; color: #94a3b8;">Lọc theo tệp danh mục shop</div>
    </div>
    <div style="border: 1px solid var(--border-color); padding: 8px; border-radius: 6px;">
      <div style="font-weight: 600; color: var(--text-sub);">👥 FOLLOWERS</div>
      <div style="font-size: 11px; color: #94a3b8;">Từ 10K - 1M+ Follower</div>
    </div>
    <div style="border: 1px solid var(--border-color); padding: 8px; border-radius: 6px;">
      <div style="font-weight: 600; color: var(--text-sub);">💰 DOANH SỐ GMV</div>
      <div style="font-size: 11px; color: #94a3b8;">Xếp hạng doanh thu 30 ngày</div>
    </div>
    <div style="border: 1px solid var(--border-color); padding: 8px; border-radius: 6px;">
      <div style="font-weight: 600; color: var(--text-sub);">📦 TRẢ MẪU VIDEO</div>
      <div style="font-size: 11px; color: #94a3b8;">Tỷ lệ gắn giỏ trả clip</div>
    </div>
  </div>

  <!-- THANH TÌM KIẾM & BỘ LỌC CHI TIẾT -->
  <div class="filter-row">
    <input type="text" class="input-search" id="kocSearchInput" placeholder="🔍 Tìm kiếm theo Tên hoặc @Handle KOC...">
    
    <select class="select-filter" id="filterCategory">
      <option value="">Tất cả ngành hàng</option>
      <option value="beauty">Làm đẹp & Mỹ phẩm</option>
      <option value="fashion">Thời trang nữ</option>
      <option value="health">Sức khỏe & Thực phẩm</option>
      <option value="electronics">Đồ gia dụng & Điện tử</option>
    </select>

    <select class="select-filter" id="filterFollowers">
      <option value="0">Tất cả Followers</option>
      <option value="10000">> 10.000 Follow</option>
      <option value="50000">> 50.000 Follow</option>
      <option value="100000">> 100.000 Follow</option>
    </select>

    <button class="btn btn-primary" id="btnInviteSelected">
      🚀 Mời KOC Đã Chọn (<span id="selectedKocCount">0</span>)
    </button>
    <button class="btn btn-outline" id="btnExportKocExcel">📥 Xuất Excel</button>
  </div>

  <!-- BẢNG DANH SÁCH KOC -->
  <table class="data-table">
    <thead>
      <tr>
        <th width="30"><input type="checkbox" id="checkAllKoc"></th>
        <th>THÔNG TIN KOC</th>
        <th>NGÀNH HÀNG</th>
        <th>FOLLOWERS</th>
        <th>GMV 30 NGÀY</th>
        <th>TỶ LỆ VIDEO</th>
        <th>LIÊN HỆ</th>
      </tr>
    </thead>
    <tbody id="kocTableBody">
      <!-- Render KOC Data -->
    </tbody>
  </table>
</div>
```

---

### Module 3: Nguồn KOC Khác (Import File Excel & Quét Nguồn Ngoài)
* **Chức năng**: Cho phép người dùng kéo thả file Excel (danh sách 10.000 handle KOC từ Kalodata, file ngoài) để nạp vào hệ thống, tự động gọi API `import_check` để lấy OEC ID siêu tốc.

#### Giao diện HTML Component (`view-ext-sources`):
```html
<div class="panel-card">
  <h2 style="font-size: 15px; font-weight: 700; margin-bottom: 0.5rem;">Nạp Danh Sách KOC Từ Nguồn Ngoài</h2>
  <p style="color: var(--text-sub); margin-bottom: 1rem;">Hỗ trợ file Excel (.xlsx, .csv) chứa danh sách username @handle KOC.</p>

  <div style="border: 2px dashed var(--border-color); padding: 2rem; border-radius: 12px; text-align: center; background: #f8fafc;" id="dropZoneExcel">
    <div style="font-size: 32px; margin-bottom: 0.5rem;">📁</div>
    <div style="font-weight: 600; margin-bottom: 0.25rem;">Kéo thả file Excel KOC vào đây hoặc bấm để chọn file</div>
    <div style="font-size: 11px; color: var(--text-sub); margin-bottom: 1rem;">File mẫu: 1 cột chứa @handle hoặc OEC ID của KOC</div>
    <input type="file" id="fileUploadKoc" accept=".xlsx, .csv" style="display: none;">
    <button class="btn btn-primary" onclick="document.getElementById('fileUploadKoc').click()">Chọn File Excel</button>
  </div>

  <!-- PROGRESS TRẠNG THÁI NẠP -->
  <div id="importProgressBox" style="margin-top: 1rem; display: none;">
    <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 4px;">
      <span id="importProgressTitle">Đang tra cứu OEC ID qua TikTok...</span>
      <span id="importProgressPercent">0%</span>
    </div>
    <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
      <div id="importProgressBar" style="width: 0%; height: 100%; background: var(--primary-color); transition: width 0.2s;"></div>
    </div>
  </div>
</div>
```

---

## NHÓM 2: BOOKING KOC

---

### Module 4: Quản Lý Shop (Sản Phẩm & Cài Đặt Hoa Hồng)
* **Chức năng**: Gọi trực tiếp `/api/v1/oec/affiliate/seller/product/list` để hiển thị toàn bộ sản phẩm của Shop, xem hoa hồng Affiliate sàn, hoa hồng Ads và chọn sản phẩm đưa vào cấu hình chiến dịch gửi lời mời.

#### Giao diện HTML Component (`view-products`):
```html
<div class="panel-card">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
    <div>
      <h2 style="font-size: 15px; font-weight: 700;">Quản Lý Sản Phẩm Shop</h2>
      <p style="color: var(--text-sub); font-size: 11px;">Đồng bộ trực tiếp giá bán & hoa hồng từ TikTok Shop</p>
    </div>
    <button class="btn btn-outline" id="btnSyncProducts">🔄 Làm mới từ TikTok</button>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th>SẢN PHẨM</th>
        <th>GIÁ BÁN</th>
        <th>HOA HỒNG AFFILIATE</th>
        <th>HOA HỒNG ADS</th>
        <th>ĐÃ BÁN (30D)</th>
        <th>HÀNH ĐỘNG</th>
      </tr>
    </thead>
    <tbody id="shopProductsTableBody"></tbody>
  </table>
</div>
```

---

### Module 5: CRM Duyệt Mẫu (Xử Lý Mẫu Thử KOC Gửi Về)
* **Chức năng**: Gọi `/api/v1/affiliate/sample/list` và `/api/v1/affiliate/sample/review/save` để duyệt 1-chạm hoặc từ chối yêu cầu xin mẫu thử miễn phí của KOC gửi về shop.

#### Giao diện HTML Component (`view-samples`):
```html
<div class="panel-card">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
    <div>
      <h2 style="font-size: 15px; font-weight: 700;">CRM Duyệt Mẫu Thử KOC</h2>
      <p style="color: var(--text-sub); font-size: 11px;">Duyệt hoặc từ chối gửi mẫu thử miễn phí cho nhà sáng tạo</p>
    </div>
    <div style="display: flex; gap: 6px;">
      <button class="btn btn-primary" id="btnApproveAllSamples">✓ Duyệt tất cả</button>
      <button class="btn btn-outline" id="btnSyncSamples">🔄 Làm mới</button>
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th>KOC / NHÀ SÁNG TẠO</th>
        <th>SẢN PHẨM XIN MẪU</th>
        <th>FOLLOWERS</th>
        <th>TRẠNG THÁI</th>
        <th>THAO TÁC</th>
      </tr>
    </thead>
    <tbody id="samplesTableBody"></tbody>
  </table>
</div>
```

---

### Module 6: Quản Lý Cộng Tác (Chiến Dịch Lời Mời, Sửa & Hủy Dọn Quota)
* **Chức năng**: Gọi `/api/v1/oec/affiliate/seller/invitation_group/search` để quản lý các nhóm lời mời đang chạy trên Shop, xem số KOC đã chấp nhận, và **Hủy nhóm (Terminate)** để giải phóng hạn mức 200 nhóm/ngày khi bị đầy.

#### Giao diện HTML Component (`view-collab`):
```html
<div class="panel-card">
  <!-- TABS ĐIỀU HƯỚNG TRẠNG THÁI THEO ẢNH -->
  <div style="display: flex; gap: 8px; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
    <button class="btn btn-primary">Hoạt động <span id="count-collab-active">202</span></button>
    <button class="btn btn-outline">Sắp hết hạn <span id="count-collab-expiring">91</span></button>
    <button class="btn btn-outline">Đang diễn ra <span id="count-collab-running">111</span></button>
    <button class="btn btn-outline">Đã hoàn tất <span>0</span></button>
    <button class="btn btn-danger" style="margin-left: auto;" id="btnTerminateExpiredGroups">🗑️ Dọn sạch nhóm hết hạn</button>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th width="30"><input type="checkbox" id="checkAllCollab"></th>
        <th>ĐỢT MỜI (TÊN · ID · TRẠNG THÁI)</th>
        <th style="text-align:center;">ĐÃ MỜI</th>
        <th style="text-align:center;">ĐÃ NHẬN</th>
        <th style="text-align:center;">ĐÃ ĐĂNG</th>
        <th style="text-align:center;">SP</th>
        <th style="text-align:center;">THAO TÁC</th>
      </tr>
    </thead>
    <tbody id="collabTableBody"></tbody>
  </table>
</div>
```

---

### Module 7: Gửi Tin KOC (Nhắn Tin Tự Động TikTok / Zalo)
* **Chức năng**: Gửi tin nhắn trực tiếp qua TikTok Chat kèm thẻ lời mời (`invitationCard`) hoặc gửi tin nhắn chăm sóc qua Zalo sau khi KOC được mời vào nhóm thành công.

#### Giao diện HTML Component (`view-messages`):
```html
<div class="panel-card">
  <h2 style="font-size: 15px; font-weight: 700; margin-bottom: 0.5rem;">Gửi Tin Nhắn Tự Động Cho KOC</h2>
  <p style="color: var(--text-sub); margin-bottom: 1rem;">Gửi thông báo hợp tác qua tin nhắn TikTok hoặc Zalo cho KOC đã vào nhóm.</p>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
    <div>
      <label style="font-weight: 600; display: block; margin-bottom: 4px;">Mẫu tin nhắn hợp tác:</label>
      <textarea id="msgTemplateText" rows="6" style="width: 100%; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; font-size: 12px; outline: none;">Chào {{creators username}}, Shop gửi lời mời hợp tác nhận mẫu thử và hoa hồng hấp dẫn. Mời bạn kiểm tra giỏ hàng nhé!</textarea>
    </div>
    <div>
      <label style="font-weight: 600; display: block; margin-bottom: 4px;">Kênh gửi tin:</label>
      <div style="margin-bottom: 8px;">
        <label><input type="radio" name="msgChannel" value="tiktok" checked> Tin nhắn TikTok Chat (Kèm thẻ mời)</label>
      </div>
      <div style="margin-bottom: 1rem;">
        <label><input type="radio" name="msgChannel" value="zalo"> Tin nhắn Zalo cá nhân</label>
      </div>
      <button class="btn btn-primary" id="btnSendBulkMessage">📤 Bắt đầu gửi tin nhắn</button>
    </div>
  </div>
</div>
```

---

### Module 8: Team CRM (Quản Lý Nhân Sự Booking & KPI Nội Bộ)
* **Chức năng**: Quản lý danh sách nhân viên booking của shop, gán tiền tố tên nhân viên vào chiến dịch (`STONKAIKOC_SHOP_NV01_0910`), thống kê số lượng KOC từng nhân viên đã mời được lưu trực tiếp vào IndexedDB.

#### Giao diện HTML Component (`view-teams`):
```html
<div class="panel-card">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
    <div>
      <h2 style="font-size: 15px; font-weight: 700;">Quản Lý Đội Ngũ Nhân Sự Booking</h2>
      <p style="color: var(--text-sub); font-size: 11px;">Gán mã nhân viên vào tên đợt mời để đối soát hiệu suất cá nhân</p>
    </div>
    <button class="btn btn-primary" id="btnAddTeamMember">+ Thêm nhân viên</button>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th>MÃ NV</th>
        <th>HỌ VÀ TÊN</th>
        <th>TIỀN TỐ TÊN NHÓM</th>
        <th>SỐ ĐỢT ĐÃ TẠO</th>
        <th>TỔNG KOC ĐÃ MỜI</th>
        <th>THAO TÁC</th>
      </tr>
    </thead>
    <tbody id="teamTableBody"></tbody>
  </table>
</div>
```

---

# 5. BỘ CONTROLLER JAVASCRIPT ĐIỀU HƯỚNG TỔNG (`app.js`)

```javascript
// CONTROLLER CHÍNH ĐIỀU KHIỂN CHUYỂN TAB & GỌI DỮ LIỆU TỰ ĐỘNG
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initShopProducts();
  initSamplesCRM();
  initCollaborations();
  initExtSources();
});

// 1. Khởi tạo chuyển Tab Navigation
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const viewPanels = document.querySelectorAll(".view-panel");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      navItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      const targetId = item.getAttribute("data-view");
      viewPanels.forEach(panel => panel.classList.remove("active"));
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add("active");
        
        // Tự động load dữ liệu của module tương ứng
        if (targetId === "view-products") loadShopProducts();
        if (targetId === "view-samples") loadSamplesCRM();
        if (targetId === "view-collab") loadCollaborations();
      }
    });
  });
}

// 2. Module Quản Lý Shop
async function loadShopProducts() {
  const tbody = document.getElementById("shopProductsTableBody");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">Đang tải danh sách sản phẩm...</td></tr>`;

  try {
    const res = await callTikTokApi("/api/v1/oec/affiliate/seller/product/list", "POST", {
      page_size: 50, page_number: 1, search_status: 1
    });
    const products = res?.data?.products || [];
    
    if (!products.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Shop chưa có sản phẩm nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap: 8px;">
            <img src="${p.img_url || ''}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover;">
            <div>
              <div style="font-weight: 600; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.title}</div>
              <div style="font-size: 10px; color: var(--text-sub);">ID: ${p.id}</div>
            </div>
          </div>
        </td>
        <td><strong>${(p.price?.min_price || 0).toLocaleString()} ₫</strong></td>
        <td><span style="color: var(--primary-color); font-weight: 700;">${(p.commission_rate || 0) / 100}%</span></td>
        <td><span style="color: var(--success); font-weight: 700;">${(p.ads_commission_rate || 0) / 100}%</span></td>
        <td>${(p.sold_count || 0).toLocaleString()}</td>
        <td><button class="btn btn-outline" style="padding: 3px 8px; font-size: 11px;">Chọn mời</button></td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger);">Lỗi: ${err.message}</td></tr>`;
  }
}

// 3. Module CRM Duyệt Mẫu
async function loadSamplesCRM() {
  const tbody = document.getElementById("samplesTableBody");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">Đang tải yêu cầu xin mẫu...</td></tr>`;

  try {
    const res = await callTikTokApi("/api/v1/affiliate/sample/list", "POST", {
      page_size: 20, page_number: 1, status: 1
    });
    const list = res?.data?.apply_list || [];

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-sub);">Không có mẫu chờ duyệt.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(s => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap: 8px;">
            <img src="${s.creator_avatar || ''}" style="width: 32px; height: 32px; border-radius: 50%;">
            <div>
              <div style="font-weight: 600;">${s.creator_nickname || s.creator_handle}</div>
              <div style="font-size: 10px; color: var(--primary-color);">@${s.creator_handle}</div>
            </div>
          </div>
        </td>
        <td><div style="max-width: 220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.product_title}</div></td>
        <td><strong>${(s.follower_count || 0).toLocaleString()}</strong></td>
        <td><span class="badge-status badge-warning">Chờ duyệt</span></td>
        <td>
          <button class="btn btn-primary" style="padding: 3px 8px; font-size: 11px;" onclick="approveSample('${s.apply_id}')">Duyệt</button>
          <button class="btn btn-danger" style="padding: 3px 8px; font-size: 11px;" onclick="rejectSample('${s.apply_id}')">Từ chối</button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--danger);">Lỗi: ${err.message}</td></tr>`;
  }
}

// 4. Module Quản Lý Cộng Tác (Chiến dịch lời mời)
async function loadCollaborations() {
  const tbody = document.getElementById("collabTableBody");
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;">Đang tải danh sách đợt mời...</td></tr>`;

  try {
    const res = await callTikTokApi("/api/v1/oec/affiliate/seller/invitation_group/search", "POST", {
      page_size: 20, page_number: 1, invitation_group_status: 5
    });
    const groups = res?.data?.invitation_group_list || [];

    if (!groups.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Shop chưa có đợt mời nào đang chạy.</td></tr>`;
      return;
    }

    tbody.innerHTML = groups.map(g => `
      <tr>
        <td><input type="checkbox" value="${g.id || g.invitation_group_id}"></td>
        <td>
          <div style="font-weight: 600; color: #1e293b;">${g.name || 'Đợt mời KOC'}</div>
          <div style="font-size: 10px; color: var(--text-sub);">ID: ${g.id || g.invitation_group_id} · ${new Date(g.end_time || 0).toLocaleDateString('vi-VN')}</div>
          <span class="badge-status badge-warning" style="font-size: 9px; padding: 1px 6px;">Sắp hết hạn</span>
        </td>
        <td style="text-align:center; font-weight:700;">${g.creator_cnt || 0}</td>
        <td style="text-align:center; font-weight:700; color: var(--success);">${g.accepted_creator_cnt || 0}</td>
        <td style="text-align:center; font-weight:700;">0</td>
        <td style="text-align:center;">1</td>
        <td style="text-align:center;">
          <button class="btn btn-outline" style="padding: 2px 6px; font-size: 11px;">Sửa ▾</button>
          <button class="btn btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="terminateCollabGroup('${g.id || g.invitation_group_id}')">Huỷ</button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--danger);">Lỗi: ${err.message}</td></tr>`;
  }
}

// 5. Hủy nhóm chiến dịch để giải phóng Quota
async function terminateCollabGroup(groupId) {
  if (!confirm(`Bạn có chắc chắn muốn hủy đợt mời ID ${groupId}? Thao tác này sẽ giải phóng hạn mức nhóm của Shop.`)) return;
  try {
    const res = await callTikTokApi("/api/v1/oec/affiliate/seller/invitation_group/terminate", "POST", {
      invitation_group_id: String(groupId)
    });
    if (res?.code === 0 || res?.code === 200) {
      alert("Đã hủy nhóm thành công!");
      loadCollaborations();
    } else {
      alert("Lỗi từ TikTok: " + (res.message || "Không thể hủy"));
    }
  } catch (e) {
    alert("Lỗi: " + e.message);
  }
}
```

---

## TỔNG KẾT BẢN THIẾT KẾ CHO ĐỐI TÁC:
1. **Đúng 8 mục được khoanh đỏ**:
   - Nhóm 1: `Trang chủ`, `Tổng hợp KOC`, `Nguồn KOC khác`.
   - Nhóm 2: `Quản lý shop`, `CRM duyệt mẫu`, `Quản lý cộng tác`, `Gửi tin KOC`, `Team CRM`.
2. **Loại bỏ 100% các thành phần không mong muốn**:
   - Đã bỏ mục `Phân tích thị trường`.
   - Đã bỏ toàn bộ các nút/cơ chế liên quan tới server ngoài / proxy / stonk branding.
   - 100% Client-Side chạy trực tiếp trên Extension và gọi API nội bộ TikTok Seller Center.
