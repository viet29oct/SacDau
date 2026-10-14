# npm audit — nhật ký

Chạy định kỳ (Phase 4/6), lưu kết quả `npm audit` (text + json) kèm ngày tháng. Không tự `npm audit fix --force`
nếu fix kéo theo breaking change cho gói lõi — phải báo nhóm trước (xem `docs/QUY_TAC_LAM_VIEC_NHOM.md` mục 1).

## 2026-10-14

- **frontend**: `found 0 vulnerabilities`.
- **backend**: 22 lỗ hổng (20 moderate, 2 high) — **toàn bộ đều ở dev dependency, không lộ qua API lúc chạy**:
  - `glob` (qua `node-pg-migrate`, high — command injection ở CLI `glob -c`, chỉ ảnh hưởng nếu tự chạy CLI đó bằng tay, migration của mình không dùng flag này) — fix đòi nâng `node-pg-migrate` lên `9.0.0` (breaking).
  - `sprintf-js`/`argparse`/`js-yaml`/`istanbul`/`jest-*`/`babel-*` (qua `ts-jest`/`jest`, moderate — DoS qua input không kiểm soát, chỉ chạy lúc `npm test`) — fix đòi hạ `ts-jest` xuống bản cũ hơn hiện tại (breaking, có thể phá test).
  - Quyết định: **chưa fix**, rủi ro thực tế thấp (dev-only), để team đồng ý trước khi đổi version `node-pg-migrate`/`ts-jest`.
  - Các gói mới thêm ở Phase 4 (`zod`, `express-rate-limit`, `pino`, `pino-http`, `pino-pretty`) không nằm trong danh sách lỗ hổng.
