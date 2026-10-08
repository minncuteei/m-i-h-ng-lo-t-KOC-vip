#!/bin/bash
cd "$(dirname "$0")"
echo "======================================================"
echo "    KHOI DONG TIKTOK CAPTCHA ROUTER SERVICE"
echo "======================================================"

# Kiểm tra python
if ! command -v python3 &> /dev/null; then
    echo "[!] Khong tim thay Python3. Vui long cai dat Python."
    read -p "Nhan Enter de thoat..."
    exit 1
fi

echo "[*] Kiem tra va cai dat thu vien..."
pip3 install -r requirements.txt -q

echo "[*] Dang khoi dong Server tai http://127.0.0.1:8000..."
python3 captcha_router_server.py
