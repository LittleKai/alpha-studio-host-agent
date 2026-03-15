# Hướng dẫn Remote nhiều máy Agent từ Windows (Mạng VNPT)

## Tổng quan

Khi có nhiều máy agent trong cùng 1 mạng VNPT, có 2 hướng tiếp cận:

| Cách | Mô tả | Phù hợp |
|------|-------|---------|
| **A. Port Forwarding** | Mỗi máy 1 port SSH riêng trên router | 2-3 máy, quản lý được router |
| **B. Tailscale (khuyến nghị)** | VPN mesh, không cần đụng router | Nhiều máy, dễ quản lý |

---

## BƯỚC 0: Chuẩn bị (cần làm trực tiếp trên từng máy Ubuntu)

Trước khi remote được, cần ra trực tiếp máy 1 lần để lấy thông tin:

```bash
# Lấy IP LAN của máy
hostname -I

# Lấy MAC address (dùng để đặt IP tĩnh trên router)
ip link show | grep "link/ether"
```

Ghi lại cho từng máy:

| Máy | Machine ID | IP LAN | MAC Address |
|-----|-----------|--------|------------|
| Máy 1 | machine-01 | 192.168.1.??? | xx:xx:xx:xx |
| Máy 2 | machine-02 | 192.168.1.??? | xx:xx:xx:xx |
| Máy 3 | machine-03 | 192.168.1.??? | xx:xx:xx:xx |

---

## CÁCH A: Port Forwarding trên Router VNPT

### Phù hợp khi: có ít máy (2-3), truy cập được router

### A1. Đặt IP tĩnh cho từng máy Ubuntu trên router

Vào `http://192.168.1.1` → DHCP → Address Reservation:

| Máy | MAC Address | IP tĩnh |
|-----|------------|---------|
| machine-01 | mac-01 | 192.168.1.101 |
| machine-02 | mac-02 | 192.168.1.102 |
| machine-03 | mac-03 | 192.168.1.103 |

### A2. Port Forwarding — mỗi máy 1 port SSH riêng

Vào router → Port Forwarding / Virtual Server / NAT:

| Rule | External Port | Internal IP | Internal Port | Protocol |
|------|--------------|------------|--------------|---------|
| SSH máy 1 | **2201** | 192.168.1.101 | 22 | TCP |
| SSH máy 2 | **2202** | 192.168.1.102 | 22 | TCP |
| SSH máy 3 | **2203** | 192.168.1.103 | 22 | TCP |
| Agent máy 1 | **4001** | 192.168.1.101 | 4000 | TCP |
| Agent máy 2 | **4002** | 192.168.1.102 | 4000 | TCP |
| Agent máy 3 | **4003** | 192.168.1.103 | 4000 | TCP |

> Không dùng port 22 cho tất cả vì router chỉ forward 1 máy cho 1 port.

### A3. SSH từ Windows

```bash
# Máy 1
ssh -p 2201 alpha@113.189.107.63

# Máy 2
ssh -p 2202 alpha@113.189.107.63

# Máy 3
ssh -p 2203 alpha@113.189.107.63
```

### A4. Cập nhật Agent URL trong Admin Panel

| Machine ID | Agent URL |
|-----------|-----------|
| machine-01 | `http://113.189.107.63:4001` |
| machine-02 | `http://113.189.107.63:4002` |
| machine-03 | `http://113.189.107.63:4003` |

Và cập nhật `.env` tương ứng trên mỗi máy:
```env
# Máy 1
PORT=4000        # port bên trong vẫn là 4000
HOST_IP=113.189.107.63

# Máy 2 — tương tự, chỉ khác MACHINE_ID
PORT=4000
HOST_IP=113.189.107.63
```

---

## CÁCH B: Tailscale — Khuyến nghị cho nhiều máy

### Phù hợp khi: nhiều máy, không muốn đụng router, dễ mở rộng

Tailscale tạo mạng VPN riêng giữa các thiết bị. Mỗi máy sẽ có 1 IP Tailscale cố định (dạng `100.x.x.x`) có thể truy cập từ bất kỳ đâu mà không cần port forwarding.

### B1. Tạo tài khoản Tailscale

Vào https://tailscale.com → Sign up (miễn phí, cho phép 100 thiết bị)

### B2. Cài Tailscale trên từng máy Ubuntu

Ra trực tiếp máy Ubuntu, chạy:

```bash
# Cài Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Khởi động và đăng nhập
sudo tailscale up
```

Sẽ hiện link dạng:
```
To authenticate, visit: https://login.tailscale.com/a/xxxxxx
```

Mở link đó trên điện thoại hoặc máy khác → đăng nhập tài khoản Tailscale → máy Ubuntu sẽ join mạng.

### B3. Lấy IP Tailscale của từng máy

```bash
tailscale ip -4
# Ví dụ: 100.64.1.10
```

Ghi lại:

| Máy | Machine ID | IP Tailscale |
|-----|-----------|-------------|
| machine-01 | machine-01 | 100.64.1.10 |
| machine-02 | machine-02 | 100.64.1.11 |
| machine-03 | machine-03 | 100.64.1.12 |

### B4. Cài Tailscale trên Windows

Tải tại: https://tailscale.com/download/windows

Cài xong → đăng nhập cùng tài khoản Tailscale → Windows join cùng mạng.

### B5. SSH từ Windows qua Tailscale

```bash
# Máy 1
ssh alpha@100.64.1.10

# Máy 2
ssh alpha@100.64.1.11

# Máy 3
ssh alpha@100.64.1.12
```

Không cần port đặc biệt, dùng port 22 bình thường.

### B6. Cập nhật Agent URL trong Admin Panel

| Machine ID | Agent URL |
|-----------|-----------|
| machine-01 | `http://100.64.1.10:4000` |
| machine-02 | `http://100.64.1.11:4000` |
| machine-03 | `http://100.64.1.12:4000` |

### B7. Cập nhật .env trên từng máy Ubuntu

```env
# Máy 1
PORT=4000
HOST_IP=100.64.1.10   # IP Tailscale của máy này

# Máy 2
PORT=4000
HOST_IP=100.64.1.11

# Máy 3
PORT=4000
HOST_IP=100.64.1.12
```

---

## Lưu ý quan trọng khi Backend trên Fly.io

Backend (Fly.io) cũng cần join mạng Tailscale để gọi được vào agent qua IP Tailscale.

```bash
# Trên máy đang chạy fly CLI
fly ssh console -a alpha-studio-backend

# Trong console Fly.io
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=<tailscale-auth-key> --hostname=fly-backend
```

Lấy Auth Key tại: Tailscale Admin → Settings → Keys → Generate auth key

Nếu không muốn cài Tailscale trên Fly.io → dùng **Cách A (Port Forwarding)** vì Fly.io gọi vào IP public.

---

## So sánh cuối

| | Cách A (Port Forwarding) | Cách B (Tailscale) |
|---|---|---|
| Cài đặt | Trung bình (cần vào router) | Dễ (chỉ cài app) |
| Mở rộng thêm máy | Phức tạp (thêm rule router) | Đơn giản (chạy 1 lệnh) |
| Bảo mật | Expose port ra internet | Encrypted VPN |
| Backend Fly.io | Gọi vào IP public, OK | Cần cài Tailscale trên Fly |
| Miễn phí | Có | Có (≤100 thiết bị) |
| **Khuyến nghị** | 2-3 máy | Từ 3 máy trở lên |

---

## Checklist sau khi remote được

- [ ] SSH vào máy thành công
- [ ] `sudo systemctl status alpha-agent` → running
- [ ] `docker images | grep alpha-desktop` → image đã build
- [ ] `curl http://localhost:4000/api/health` → OK
- [ ] Cập nhật Agent URL đúng trong Admin Panel
- [ ] Test kết nối Cloud Desktop từ Frontend
