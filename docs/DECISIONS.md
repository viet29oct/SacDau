# Nhật ký quyết định — SacDau

Chỉ Việt hoặc Phi thêm dòng (QUY_TAC mục 9). Mỗi quyết định đổi contract, luồng nghiệp vụ, thư viện, phân công hay luật nhóm thêm **một dòng trước khi merge**. Không xoá dòng cũ: quyết định thay thế thì ghi "thay dòng ngày …". Lý do ghi bằng chứng (đề bài, số liệu, ràng buộc), không ghi cảm tính. Dùng lại được cho phần "lý do lựa chọn" trong báo cáo các môn.

| Ngày | Quyết định | Lý do | Ảnh hưởng |
|---|---|---|---|
| 12/10/2026 | Giữ VNPay sandbox trong phạm vi; Postgres chạy cổng host `5433` | Thanh toán thật là phần chính của luồng nghiệp vụ; `5432` trùng PostgreSQL cài sẵn trên máy | `docker-compose.yml`, `README.md` |
| 27/10/2026 | Backend đổi TypeScript → JavaScript CommonJS | Yêu cầu môn Ngôn ngữ kịch bản | Toàn bộ `backend/` |
| 29/10/2026 | Một công ty nhiều trạm, admin phân công người quản lý; bỏ mô hình marketplace | Luồng check-in cần người quản lý trạm cụ thể | `FEATURES.md`, `contracts.md`, route stations |
| 18/11/2026 | Cọc khi đặt chỗ, check-in bằng mã, phiên trái phép, phí chiếm chỗ; chỉ thanh toán VNPay; broker MQTT bắt buộc đăng nhập + ACL theo trạm | Chốt luồng nghiệp vụ thực tế (`LUONG_NGHIEP_VU.md`) | Phase 5b, `mosquitto/`, firmware |
| 18/11/2026 | Bỏ môn Phân tích dữ liệu khỏi phạm vi đồ án | — (bổ sung lý do) | `FEATURES.md`, `ROADMAP.md` |
| 23/11/2026 | GIS chọn chủ đề 35 (dự phòng 21), chạy trên bộ dữ liệu Bắc Ninh của môn; trạm sạc SacDau là phần mở rộng | Môn HTTTKG chấm một plugin QGIS theo đề của giáo viên | `gis/`, `ROADMAP.md` mục GIS |
| 24/11/2026 | Chỉ Việt hoặc Phi quyết định lớn, duyệt và merge PR; Việt/Phi tự merge PR của mình; người khác cần Việt/Phi approve | Tránh dồn việc merge về một người; nhóm có thêm 3 thành viên chỉ làm GIS | `QUY_TAC` mục 9, `.github/members.txt`, `approval.yml`, `CODEOWNERS` |
| 24/11/2026 | 3 bạn chỉ làm GIS giữ quyền write, chặn bằng ruleset + CI (`scope-guard`, `files-guard`); nhánh `Duong`, `Phong`, `Tiep` | Dễ cho người mới hơn fork; CI chặn được thay đổi ngoài `gis/` trước khi vào `main` | `QUY_TAC` mục 10, `guard.yml`, `PHAN_CONG.md` |
| 24/11/2026 | Giao việc bằng GitHub Issues gắn nhãn môn; `ROADMAP.md` chỉ Việt/Phi cập nhật | Nhiều người cùng tick một file gây conflict | `ROADMAP.md`, mẫu issue/PR |
| 24/11/2026 | Không khai báo dùng AI, không để AI là đồng tác giả trên GitHub | Quyết định của nhóm | `AGENTS.md` mục 3, hook `commit-msg`, `no-ai-attribution.yml` |
