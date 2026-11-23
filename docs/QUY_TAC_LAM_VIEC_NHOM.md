# Quy tắc làm việc nhóm — SacDau

Luật chơi chung của nhóm 3 người làm SacDau, cộng 3 bạn chỉ làm phần GIS (mục 1). Mục tiêu: không ai lệch version, không ai sửa nhầm file của người khác, `git merge` không nổ conflict vì lý do ngớ ngẩn. Version công nghệ: `TECH_STACK.md` mục 1.

---

## 1. Phân chia theo người

Chia theo **thư mục sở hữu** để mỗi người chủ yếu commit trong vùng của mình.

| Người | Mảng | Sở hữu chính | Môn |
|---|---|---|---|
| **Người 1 — Việt** (trưởng nhóm) | Backend core & bảo mật | `backend/` (route, service, middleware, migration, test), `mosquitto/`, `security/`, khung `frontend/` (router, `App.jsx`, `Layout`, `api/`, `context/`) | Ngôn ngữ kịch bản, Web an toàn |
| **Người 2 — Phi** | IoT & thiết bị | `iot/` (sketch, mạch Wokwi, PlatformIO) | IoT |
| **Người 3 — Huấn** | Không gian | `gis/`, trang bản đồ/biểu đồ trong `frontend/src/pages/` | GIS |

**Nhóm GIS (môn HTTTKG, nhóm 6)** có 6 người: 3 người trên và 3 bạn Dương, Phong, Tiệp. Ba bạn này chỉ làm trong `gis/`, không đụng thư mục khác. Huấn điều phối phần GIS. Ai làm gì: [`gis/PHAN_CONG.md`](../gis/PHAN_CONG.md).

> Toàn bộ backend hiện tại (kể cả `routes/stations.js` và xử lý MQTT `services/mqtt.js` + `sessionEngine.js`, ban đầu chia cho Người 3 và Người 2) đã được Người 1 viết trong Phase 5/5b. Người 2/3 muốn sửa các file này thì báo Người 1 trước. Phần màn hình frontend còn lại (tài xế, quản lý trạm, admin) **chưa chốt người làm** — xem `ROADMAP.md` mục "Cần cả nhóm chốt".

- Ai cần sửa file **ngoài phạm vi của mình** → báo nhóm trước, không tự sửa rồi push.
- Mỗi route là 1 file riêng trong `backend/src/routes/`, logic dùng chung để ở `services/` — không dồn vào 1 file.
- Frontend: thêm trang/component mới thay vì sửa file khung của người khác.

## 2. "Vùng cấm" — chỉ Người 1 sửa

`docker-compose.yml`, `backend/src/db/`, `backend/src/app.js`, `backend/src/server.js`, `backend/migrations/`, `.env.example`, `backend/.env.example`, `mosquitto/mosquitto.conf`, `mosquitto/acl`.

Người khác chỉ `require` để dùng (`const { query } = require('../db')`). Cần thêm bảng/cột, đổi cổng, thêm biến môi trường → nhắn Người 1, không tự viết `CREATE TABLE` rải rác. Lý do: các file này bị nhiều người sửa cùng lúc là nguồn conflict khó gỡ nhất và gây lỗi runtime cho người khác.

## 3. Nhánh, commit, Pull Request

- Mỗi người làm trên **nhánh riêng** (`Viet`, `Phi`, `Huan`, hoặc nhánh `feature/...` tách từ đó). Ba bạn chỉ làm GIS dùng nhánh `gis/<ten>` (`gis/duong`, `gis/phong`, `gis/tiep`) tách từ `main`. **Không code trực tiếp trên `main`.**
- Vào `main` qua Pull Request, có ít nhất 1 người khác xem trước khi merge.
- Lấy code mới từ `main` đầu mỗi buổi và trước khi mở PR — pull trễ là nguyên nhân conflict lớn nhất. Dùng `git merge origin/main`, không rebase nhánh đã push. Cách làm chi tiết: `AGENTS.md` mục 2.
- Dùng AI agent (Codex, Claude Code, Gemini…): theo `AGENTS.md`. Commit/PR không có dòng ghi công AI (`Co-Authored-By: Claude…`, `Generated with…`); hook `commit-msg` và CI sẽ chặn. Bật hook 1 lần sau khi clone: `git config core.hooksPath .githooks`.
- Commit nhỏ, thường xuyên; message theo mẫu `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.
- **Lên nhánh mình trước, hết lỗi mới mở PR.** Mọi thay đổi commit và push lên nhánh của mình (`Viet`, `Phi`, `Huan`, `gis/<ten>`), không push thẳng `main`. Chỉ mở PR vào `main` khi nhánh qua hết kiểm tra của phần đã sửa:

  | Sửa trong | Phải qua |
  |---|---|
  | `backend/` | `npm test` trong `backend/` (DB test `sacdau_test`, xem `README.md`) |
  | `frontend/` | `npm run build` trong `frontend/` |
  | `iot/` | `pio run` build được; chạy mạch Wokwi nối broker không lỗi |
  | `gis/` | plugin nạp được trong QGIS, chạy ra đúng kết quả mẫu ở `gis/README.md` |
  | chỉ tài liệu | không cần |

  Ghi lệnh đã chạy và kết quả vào mục "Test" của mô tả PR. Mỗi lần push lên nhánh nào, CI (`.github/workflows/ci.yml`) cũng tự chạy `npm test` của backend (trên Postgres/PostGIS sạch) và `npm run build` của frontend, kết quả ✅/❌ hiện ở tab Actions và ngay trong PR. PR còn ❌ thì chưa merge. Còn lỗi chưa sửa được mà cần người khác xem thì mở PR dạng **Draft**, ghi rõ lỗi, không bấm "Ready for review" cho tới khi hết lỗi.
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
