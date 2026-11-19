# Quy tắc làm việc nhóm — SacDau

Luật chơi chung của nhóm 3 người. Mục tiêu: không ai lệch version, không ai sửa nhầm file của người khác, `git merge` không nổ conflict vì lý do ngớ ngẩn. Version công nghệ: `TECH_STACK.md` mục 1.

---

## 1. Phân chia theo người

Chia theo **thư mục sở hữu** để mỗi người chủ yếu commit trong vùng của mình.

| Người | Mảng | Sở hữu chính | Môn |
|---|---|---|---|
| **Người 1** | IoT & thiết bị | `iot/` (sketch, mạch Wokwi, PlatformIO) | IoT |
| **Người 2** | Backend core & bảo mật | `backend/` (route, service, middleware, migration, test), `mosquitto/`, `security/`, khung `frontend/` (router, `App.jsx`, `Layout`, `api/`, `context/`) | Ngôn ngữ kịch bản, Web an toàn |
| **Người 3** | Không gian | `gis/`, trang bản đồ/biểu đồ trong `frontend/src/pages/` | GIS |

> Toàn bộ backend hiện tại (kể cả `routes/stations.js` và xử lý MQTT `services/mqtt.js` + `sessionEngine.js`, ban đầu chia cho Người 3 và Người 1) đã được Người 2 viết trong Phase 5/5b. Người 1/3 muốn sửa các file này thì báo Người 2 trước. Phần màn hình frontend còn lại (tài xế, quản lý trạm, admin) **chưa chốt người làm** — xem `ROADMAP.md` mục "Cần cả nhóm chốt".

- Ai cần sửa file **ngoài phạm vi của mình** → báo nhóm trước, không tự sửa rồi push.
- Mỗi route là 1 file riêng trong `backend/src/routes/`, logic dùng chung để ở `services/` — không dồn vào 1 file.
- Frontend: thêm trang/component mới thay vì sửa file khung của người khác.

## 2. "Vùng cấm" — chỉ Người 2 sửa

`docker-compose.yml`, `backend/src/db/`, `backend/src/app.js`, `backend/src/server.js`, `backend/migrations/`, `.env.example`, `backend/.env.example`, `mosquitto/mosquitto.conf`, `mosquitto/acl`.

Người khác chỉ `require` để dùng (`const { query } = require('../db')`). Cần thêm bảng/cột, đổi cổng, thêm biến môi trường → nhắn Người 2, không tự viết `CREATE TABLE` rải rác. Lý do: các file này bị nhiều người sửa cùng lúc là nguồn conflict khó gỡ nhất và gây lỗi runtime cho người khác.

## 3. Nhánh, commit, Pull Request

- Mỗi người làm trên **nhánh riêng** (`Viet`, `Phi`, `Huan`, hoặc nhánh `feature/...` tách từ đó). **Không code trực tiếp trên `main`.**
- Vào `main` qua Pull Request, có ít nhất 1 người khác xem trước khi merge.
- `git pull` (hoặc rebase lên `main`) đầu mỗi buổi — pull trễ là nguyên nhân conflict lớn nhất.
- Commit nhỏ, thường xuyên; message theo mẫu `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.
- Trước khi mở PR: chạy lại `npm test` (backend) / `npm run build` (frontend).
- Bị conflict: **không** `git push --force`, không bấm "accept all" khi chưa hiểu đoạn conflict — gọi người liên quan cùng xem.

## 4. Contract là luật

Field/endpoint/payload trong `docs/contracts.md` là thoả thuận giữa IoT, backend, frontend.

- Đổi tên, đổi kiểu, xoá field → báo nhóm, **sửa `contracts.md` trước**, rồi mọi người sửa code theo.
- Thêm field mới (không đổi cái cũ) → thêm vào `contracts.md` và báo 1 câu trong chat.
- Đổi luồng nghiệp vụ (đặt chỗ, check-in, tiền) → sửa `LUONG_NGHIEP_VU.md` trước.
- Thêm/bỏ tính năng → sửa `FEATURES.md` trước, cả nhóm đồng ý.

## 5. Biến môi trường (`.env`)

- **Không commit `.env` thật**, không gửi `.env` hay ảnh chụp có secret qua chat. Các file bí mật khác cũng không commit: `mosquitto/passwd`, `mosquitto/*.local`, `iot/secrets.h`.
- Mỗi người copy `.env.example` → `.env` (root và `backend/`) rồi tự điền.
- Thêm biến mới → cập nhật ngay `.env.example` tương ứng và báo nhóm.
- Frontend không hard-code `http://localhost:3000` — đọc `import.meta.env.VITE_API_URL`.

## 6. Đường dẫn

- Node: `path.join(__dirname, ...)`; không viết đường dẫn tuyệt đối kiểu `D:\...` hay `C:\Users\<tên>\...`.
- Python: `Path(__file__).parent / "data" / "ten_file.geojson"`.
- Dữ liệu GIS để trong `gis/data/`, tham chiếu tương đối. File thô nặng (`.pbf`) để ở `gis/data/raw/` (không commit).

## 7. Không chờ nhau — giả lập

- **Thiếu mạch ESP32:** publish bằng `mosquitto_pub` với tài khoản trạm (lệnh mẫu ở `mosquitto/README.md`), hoặc chạy `npm run e2e:demo` trong `backend/`.
- **Thiếu backend cho frontend:** chạy backend thật trên máy (xem `README.md`), `npm run e2e:demo -- --keep` để có sẵn trạm/booking/phiên mẫu. Cần mock thuần frontend thì dùng `msw`, dữ liệu theo đúng object ở `contracts.md` mục 3.

## 8. Style code

Chưa cài ESLint/Prettier. Cho tới khi cài: giữ style của file đang sửa (2 dấu cách, dấu `;`, nháy đơn), **không format lại cả file** — đổi hàng trăm dòng không liên quan làm diff rối và gây conflict. Khi cài, dùng 1 config chung ở `backend/` và `frontend/`, không ai tự chỉnh riêng.
