# Quy tắc làm việc nhóm — Dự án "Hệ thống quản lý mạng lưới trạm sạc xe điện"

Nhóm 3 người. File này là **luật chơi chung**, đọc trước khi code dòng đầu tiên. Mục tiêu: không ai làm sai version, không ai sửa nhầm file của người khác, và `git merge` không nổ conflict vì lý do ngớ ngẩn.

Tham chiếu công nghệ chi tiết: xem `TECH_STACK.md`. File này chỉ nói về **cách làm việc chung**, không lặp lại danh sách công nghệ.

---

## 1. Chốt phiên bản công nghệ (bắt buộc làm đầu tiên)

Nguyên nhân lỗi kinh điển: người A code bằng Node 22, người B dùng Node 18, code chạy máy A nhưng lỗi máy B. Để tránh:

| Thành phần | Version chốt | Nơi khai báo | Ghi chú |
|---|---|---|---|
| Node.js | `24.x LTS` (chốt theo máy khởi tạo dự án: `v24.19.0`) | `.nvmrc` ở root | Ai dùng `nvm` chạy `nvm use` trước khi code; nếu chưa có `nvm`, cài `nvm-windows` rồi cài đúng `24.19.0` |
| npm/package | khóa bằng `package-lock.json` | commit file này lên git | **Không** `npm install` bằng `--force`, không xoá lock file |
| Khai báo version package | dùng số cứng, không dùng `^`/`~` cho các gói lõi (express, pg, jsonwebtoken) | `package.json` | Tránh tình trạng người này cài bản mới hơn người khác dù cùng lock file cũ |
| Python | `3.14.x` (chốt theo máy khởi tạo dự án: `3.14.7`) | `requirements.txt` có version cố định (`pandas==2.2.2`, không để trống version) | Mỗi người tạo `venv` riêng, không dùng Python hệ thống |
| PostgreSQL / PostGIS | image Docker ghi version cụ thể, ví dụ `postgis/postgis:16-3.4`, **không dùng `latest`** | `docker-compose.yml` | `latest` âm thầm đổi version giữa các lần `docker pull` của từng người → lỗi khó hiểu |
| Mosquitto | image Docker ghi version cụ thể, ví dụ `eclipse-mosquitto:2.0.18` | `docker-compose.yml` | |
| React / Vite | version cứng trong `package.json` của `frontend/` | | |
| Backend: JavaScript hay TypeScript | **TypeScript** (chốt ở Phase 1) | `backend/tsconfig.json`, `module: CommonJS` | Chọn TypeScript thay vì JS thuần ban đầu ở `TECH_STACK.md`; code viết trong `backend/src/*.ts`, build ra `dist/` bằng `tsc`, dev chạy bằng `tsx watch` |
| Migration CSDL | **node-pg-migrate** (không dùng file SQL thuần tay) | `backend/migrations/*.js`, lệnh `npm run migrate:up` | File migration viết bằng JS (CommonJS) dù app là TS — tool quy ước vậy, không cần đổi |

**Quy tắc:** mọi thay đổi version của một gói lõi dùng chung (Express, React, PostgreSQL image...) phải báo nhóm trước, không tự ý nâng cấp khi đang code dở.

> Đã kiểm tra trên máy khởi tạo dự án (12/10/2026): Git `2.49.0`, Docker `29.2.1`, Docker Compose plugin `v5.0.2` (dùng `docker compose`, không phải lệnh rời `docker-compose`). Máy có cả Cursor và VS Code, lệnh `code` trong terminal hiện trỏ vào Cursor trước — ai dùng VS Code thuần thì mở app trực tiếp, không ảnh hưởng tới code của dự án nên không cần ép chuẩn editor.
>
> **Lưu ý quan trọng khi mở Postgres port:** máy khởi tạo dự án có PostgreSQL **cài native** (không phải Docker) chạy sẵn như Windows service, chiếm cổng `5432`. Vì vậy container Postgres trong `docker-compose.yml` **expose ra cổng host `5433`** (bên trong container vẫn là `5432`, chỉ đổi cổng phía ngoài). Nếu máy bạn cũng có Postgres cài sẵn, không cần làm gì thêm — cứ dùng `DATABASE_URL` trong `.env.example` (đã trỏ sẵn `localhost:5433`). Nếu máy bạn **không** có Postgres cài sẵn và muốn test bằng `psql`/DBeaver, nhớ connect vào `localhost:5433`, không phải `5432`.

---

## 2. Phân chia module theo người (ranh giới rõ, ít đụng file nhau)

Chia theo **thư mục sở hữu**, không chia theo "ai giỏi gì" — vì chia theo thư mục thì git mới ít conflict (mỗi người chủ yếu commit trong thư mục của mình).

| Người | Mảng phụ trách | Thư mục/file sở hữu chính | Môn liên quan |
|---|---|---|---|
| **Người 1** | IoT & dữ liệu thiết bị | `iot/` (ESP32, Wokwi), `backend/src/services/mqttSubscriber.ts`, `backend/src/routes/telemetry.ts` | IoT |
| **Người 2** | Backend core & Bảo mật | `backend/src/routes/auth.ts`, `routes/users.ts`, `routes/bookings.ts`, `routes/reports.ts`, `middleware/` (auth, rbac, validate, security), `security/` | Ngôn ngữ kịch bản, Web an toàn |
| **Người 3** | Không gian & Phân tích | `backend/src/routes/stations.ts`, `gis/`, `analytics/`, `frontend/src/` (bản đồ Leaflet + biểu đồ) | GIS, Phân tích dữ liệu |

Quy tắc đi kèm:

- **Mỗi route là 1 file riêng** (`routes/auth.ts`, `routes/stations.ts`...) — không nhồi hết vào 1 file `routes.ts` chung. Đây là lý do chính giúp 3 người sửa code cùng lúc mà không đụng cùng dòng.
- `frontend/` phần layout/khung chung (routing, App.jsx, API client gốc) do **Người 2** dựng trước (vì gắn với auth/login), sau đó Người 3 chỉ thêm *component mới* (trang bản đồ, trang biểu đồ), không sửa file khung đã có người khác đụng tới mà không báo trước.
- Ai cần sửa file **ngoài phạm vi của mình** → báo nhóm trong group chat trước, không tự sửa rồi push.
- Mỗi người làm trên **branch riêng** theo tên chuẩn: `feature/iot-...`, `feature/backend-...`, `feature/gis-...`. Không code trực tiếp trên `main`.
- Merge vào `main` qua Pull Request, có ít nhất 1 người khác review trước khi merge (dù là đồ án, vẫn tập quy trình thật).
- Commit nhỏ, thường xuyên (vài giờ 1 lần), **không** để code 3 ngày rồi commit 1 lần — commit to dễ conflict và khó review.

---

## 3. File cấu hình & kết nối Database — CHỈ MỘT NGƯỜI được tạo

Những file sau là **"vùng cấm"**: chỉ **Người 2 (Backend core)** được tạo và sửa, vì đây là người dựng khung server đầu tiên.

- `docker-compose.yml`
- `backend/src/db/index.ts` (pool connection PostgreSQL/PostGIS)
- `backend/src/app.ts` / `server.ts` (khởi tạo Express gốc)
- `backend/migrations/*.js` (file migration quản lý bằng `node-pg-migrate`)
- `.env.example` (danh sách biến môi trường chuẩn)

**Quy trình bắt buộc:**

1. Người 2 tạo xong các file trên, test chạy được (`docker compose up`, connect DB OK, server chạy OK).
2. Người 2 **thông báo lên nhóm** đúng mẫu câu sau (copy dùng luôn):

   > 📢 File database/server đã cấu hình xong (`docker-compose.yml`, `backend/src/db/index.ts`, `backend/src/app.ts`). Mọi người **chỉ import để dùng** (`import pool from '../db'`), **cấm sửa trực tiếp** các file này. Cần đổi gì (thêm bảng, đổi cổng, đổi biến môi trường...) thì nhắn nhóm, mình là người sửa và báo lại.

3. Từ lúc đó, 2 người còn lại chỉ `import`/`require` các file này, **không mở ra sửa**. Nếu cần thêm bảng mới → báo Người 2 thêm migration, không tự thêm `CREATE TABLE` rải rác ở file khác.

Lý do: file config/DB bị nhiều người sửa cùng lúc là nguồn conflict khó gỡ nhất (vì mỗi người set khác port, khác tên biến, khác cấu trúc pool) và dễ gây lỗi runtime cho người khác mà không biết do đâu.

---

## 4. Chuẩn hóa đường dẫn tương đối

- Trong code Node.js: luôn dùng `path.join(__dirname, ...)`, **không** viết đường dẫn tuyệt đối kiểu `D:\project k7\...` hoặc `/home/an/...` trong code — máy người khác không có đường dẫn đó.
- Import module trong JS/TS: dùng đường dẫn tương đối từ file hiện tại (`../services/mqttSubscriber`), không hard-code path tuyệt đối.
- File tĩnh / dữ liệu mẫu (GeoJSON, CSV, ảnh...): để trong thư mục con cố định (`gis/data/`, `analytics/data/`) và luôn tham chiếu tương đối tới thư mục đó — không ai để đường dẫn kiểu `C:\Users\<tên riêng>\...`.
- Frontend gọi API: không hard-code `http://localhost:3000`. Để trong biến môi trường (`VITE_API_URL`), đọc qua `import.meta.env.VITE_API_URL`. Đổi port/host không cần sửa code.
- Python (GIS/analytics): dùng `Path(__file__).parent / "data" / "ten_file.csv"` (module `pathlib`), không hard-code path máy cá nhân.

---

## 5. Chốt định dạng JSON trước khi code (API & MQTT contract)

**Việc này làm trước khi ai viết dòng code route/backend nào**, vì nếu 3 người tự đoán format, ráp lại sẽ lệch field, lệch kiểu dữ liệu, rất mất công sửa lại.

Tạo file `docs/contracts.md` (hoặc `docs/schema.json`), ghi rõ:

**a) Payload MQTT thiết bị gửi lên** (Người 1 đề xuất, cả nhóm duyệt):

```json
{
  "stationId": "ST01",
  "portId": 1,
  "status": "charging",
  "powerKw": 7.4,
  "energyKwh": 12.3,
  "temperature": 29.5,
  "timestamp": "2026-10-12T10:00:00Z"
}
```

**b) Response chuẩn cho API** (Người 2 đề xuất):

```json
{
  "success": true,
  "data": { },
  "error": null
}
```

Khi lỗi:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "STATION_NOT_FOUND", "message": "Không tìm thấy trạm" }
}
```

**c) Object `station` chuẩn** (có field GIS, Người 3 đề xuất):

```json
{
  "stationId": "ST01",
  "name": "Trạm Cầu Giấy",
  "location": { "lat": 21.0368, "lng": 105.7829 },
  "ports": 2,
  "status": "idle"
}
```

**Quy tắc:** field nào đã chốt trong `docs/contracts.md` thì **không đổi tên tùy ý** (ví dụ không đổi `powerKw` thành `power_kw` giữa đường) — ai cần đổi phải báo nhóm, sửa 1 lần ở file contract, rồi cả 3 cùng sửa code theo.

---

## 6. Kỹ thuật Mocking khi chưa ghép phần cứng / chưa ghép module khác

Không ai được ngồi chờ người khác xong mới code. Dùng giả lập:

**a) Giả lập ESP32 gửi MQTT** (để Người 2 code backend mà không cần Người 1 xong mạch Wokwi):

`iot/mock/mockPublisher.js`:

```js
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

setInterval(() => {
  const payload = {
    stationId: 'ST01',
    portId: 1,
    status: 'charging',
    powerKw: +(Math.random() * 10).toFixed(1),
    energyKwh: +(Math.random() * 50).toFixed(1),
    temperature: +(25 + Math.random() * 10).toFixed(1),
    timestamp: new Date().toISOString(),
  };
  client.publish('stations/ST01/status', JSON.stringify(payload));
  console.log('Mock publish:', payload);
}, 3000);
```

Chạy `node iot/mock/mockPublisher.js` → backend nhận dữ liệu y như thiết bị thật, theo đúng format đã chốt ở mục 5a.

**b) Giả lập API cho Frontend** (để Người 3 code giao diện mà không cần chờ Người 2 xong backend thật):

- Dùng `json-server` với file `frontend/mock/db.json` chứa dữ liệu mẫu đúng format ở mục 5c.
- Hoặc dùng `msw` (Mock Service Worker) nếu muốn mock ngay trong React.
- Khi backend thật xong, chỉ đổi `VITE_API_URL` từ mock sang thật — không sửa code gọi API.

**c) Giả lập dữ liệu lớn cho phân tích** (Người 3 làm phân tích dữ liệu không cần chờ có dữ liệu thật):

- Dùng `Faker`/`numpy.random` sinh dữ liệu phiên sạc theo đúng schema `charging_sessions` đã chốt (xem `TECH_STACK.md` mục 4).

---

## 7. Dùng Linter/Formatter để tránh "conflict giả"

"Conflict giả" là conflict do khác style code (tab vs space, dấu `;`, xuống dòng khác nhau) chứ không phải khác logic — rất hay gặp khi trình độ git chưa vững. Cách triệt tiêu:

- Cài **ESLint + Prettier** cho `backend/` và `frontend/`, dùng **1 file config chung duy nhất** commit ở root mỗi project (`.eslintrc.json`, `.prettierrc`), không ai tự chỉnh config riêng theo ý mình.
- Cài **Husky + lint-staged**: tự động chạy format trước mỗi commit, không ai commit được code sai style:

```json
// package.json
"lint-staged": {
  "*.{js,jsx}": ["eslint --fix", "prettier --write"]
}
```

- Python (GIS/analytics): dùng `black` (format) + `flake8` (lint), chạy trước khi commit notebook/script.
- Bật format-on-save trong VS Code, cả 3 người cùng dùng chung extension (Prettier, ESLint, Python) để không ai gõ ra style khác nhau ngay từ đầu.
- **Quy tắc vàng:** không bao giờ "format lại toàn bộ file" chỉ vì tiện tay — việc này đổi hàng trăm dòng không liên quan, làm git diff rối và gây conflict với người đang sửa cùng file. Chỉ format phần mình vừa sửa (lint-staged ở trên đã tự làm đúng việc này).

---

## 8. Quản lý biến môi trường (`.env`)

- **Không commit file `.env` thật lên git** — thêm `.env` vào `.gitignore` ngay từ commit đầu tiên.
- Commit file `**.env.example**` chứa đầy đủ tên biến, giá trị mẫu (không phải giá trị thật):

```env
# backend/.env.example
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/evcharging
JWT_SECRET=change_me
MQTT_BROKER_URL=mqtt://localhost:1883
```

```env
# frontend/.env.example
VITE_API_URL=http://localhost:3000
```

- Mỗi người tự copy `.env.example` → `.env` trên máy mình, tự điền giá trị thật (mật khẩu DB cá nhân, secret riêng khi test) — **không** gửi `.env` thật qua chat nhóm, không chụp ảnh `.env` có secret thật.
- Khi thêm biến môi trường mới: người thêm phải cập nhật luôn vào `.env.example` và báo nhóm — không để người khác tự đoán tên biến.

---

## 9. Checklist trước khi bắt đầu code

- [ ] Cả 3 người cùng đọc và đồng ý nội dung file này.
- [ ] Chốt version ở mục 1 (Node, Python, Postgres/PostGIS image).
- [ ] Người 2 dựng xong `docker-compose.yml`, DB connection, server gốc → thông báo nhóm theo mẫu ở mục 3.
- [ ] Chốt file `docs/contracts.md` (JSON format MQTT + API) — cả 3 ký duyệt trước khi code route/giao diện.
- [ ] Mỗi người tạo nhánh `feature/...` riêng, không code trên `main`.
- [ ] Cài ESLint/Prettier + Husky (JS) và black/flake8 (Python) trước commit đầu tiên.
- [ ] `.env.example` có đầy đủ biến, `.env` thật đã nằm trong `.gitignore`.
- [ ] Người 1 có sẵn `mockPublisher.js`, Người 3 có sẵn mock API — không ai phải chờ ai mới code được.

---

## 10. Quy tắc commit & Pull Request (để hợp với trình độ git còn non)

- Commit message ngắn, rõ, tiếng Việt hoặc tiếng Anh đều được, theo mẫu: `feat: thêm route /stations`, `fix: sửa lỗi kết nối MQTT`, `docs: cập nhật contract JSON`.
- `git pull` trước khi bắt đầu code mỗi buổi, không để code cũ 1 tuần rồi mới pull — pull trễ là nguyên nhân conflict lớn nhất.
- Trước khi mở PR: tự chạy lại app/test 1 lần, đảm bảo không lỗi cú pháp.
- Nếu bị conflict: **không** `git push --force`, gọi ngay người liên quan trong nhóm cùng xem, không tự ý chọn "accept all incoming" hoặc "accept all current" khi không hiểu đoạn conflict là gì.
