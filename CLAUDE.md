# CLAUDE.md — SacDau

Tài liệu dự án: xem bảng "Tài liệu" trong `README.md`. Đặc tả nghiệp vụ chốt: `.claude/c_t_c_p_nh_t_ki_n_tr_c_nghi_p_v_d_n_d_nh_cho_claude.md`.

---

## Quy tắc dùng skill (bắt buộc, mỗi lần thực thi)

### Quy trình

1. **Trước khi gọi tool đầu tiên của một yêu cầu**, đọc **toàn bộ danh sách skill đang có** trong phiên (danh sách hệ thống đưa vào ngữ cảnh), không chỉ skill trong thư mục `.claude/skills/` của project. Danh sách này gồm:
   - skill tải/bật từ claude.ai (`anthropic-skills:*`, nằm ở `~/.claude/skills/synced/`)
   - skill từ plugin (`engineering:*`, `ui-consistency:*`, `ui-design-review:*`…)
   - skill cá nhân trong `~/.claude/skills/`
   - skill của project trong `.claude/skills/`
   - skill có sẵn của Claude Code (`code-review`, `simplify`, `run`…)
2. So mô tả của **từng** skill với yêu cầu. Skill nào khớp, dù chỉ phần nhỏ của yêu cầu, thì **gọi nó qua tool `Skill` trước**, rồi mới đọc file, sửa code hay chạy lệnh. Không tự làm theo trí nhớ khi đã có skill cho việc đó. Bảng "Chọn skill" bên dưới chỉ là gợi ý ưu tiên cho các việc hay gặp. Skill mới tải về mà bảng chưa ghi thì vẫn dùng nếu mô tả của nó khớp.
3. Nhiều skill cùng khớp: chạy theo thứ tự quy trình (tìm hiểu → lên kế hoạch → làm → kiểm tra). Có hai skill cùng một việc thì chọn skill cụ thể hơn.
4. Đang làm dở mà phát sinh việc mới khớp skill khác (vd. đang sửa trang thì gặp lỗi khó) thì gọi skill đó lúc phát sinh.
5. Khi bắt đầu trả lời, ghi một dòng skill đã dùng, vd. `Skill: engineering:debug`. Không dùng skill nào thì ghi `Skill: không có skill phù hợp`.
6. **Không ép skill**: câu hỏi ngắn, đọc/giải thích code, sửa typo, chạy một lệnh có sẵn thì làm luôn.
7. Người dùng gõ `/<tên-skill>` hoặc nêu tên skill thì luôn gọi đúng skill đó.

### Chọn skill

| Khi việc là… | Dùng skill |
|---|---|
| **Frontend (`frontend/`) — giao diện người dùng thấy** | |
| Trang/màn hình mới, tính năng mới có UI, refactor nhiều trang | `ui-consistency:finding-patterns` → `ui-consistency:planning` → `ui-consistency:implementing` → `ui-consistency:verifying` |
| Sửa nhỏ trên một trang (nhãn, nút, field, hành vi một control) | `ui-consistency:adjusting` → `ui-consistency:implementing` → `ui-consistency:verifying` |
| Có ảnh/bản thiết kế, hoặc cần chốt bố cục trước khi code | `ui-consistency:design` |
| Hỏi "trang này đã khớp các trang khác chưa", trước khi mở PR có UI | `ui-consistency:verifying` |
| Review/chấm điểm giao diện, liệt kê lỗi UI | `ui-design-review:ui-review` |
| Sửa các lỗi UI đã review, "làm đẹp", polish | `ui-design-review:ui-polish` |
| So với cách các app/web khác làm | `ui-design-review:ui-compare` |
| Chọn màu, font, phong cách, guideline UX khi project **chưa có** quy ước | `ui-ux-pro-max` (tham khảo, sau `finding-patterns`) |
| Accessibility (tương phản, bàn phím, label) khi được hỏi | `ui-consistency:accessibility` |
| Biểu đồ, thống kê, dashboard (trang `ReportsPage`, doanh thu…) | `dataviz` |
| **Backend, IoT, hệ thống** | |
| Lỗi, stack trace, test fail, "chạy không đúng" | `engineering:debug` |
| Viết/thiết kế test (Jest backend, test luồng) | `engineering:testing-strategy` |
| Thiết kế API, mô hình dữ liệu, luồng MQTT/WebSocket mới | `engineering:system-design` |
| Chọn giữa các công nghệ, ghi lại quyết định kiến trúc | `engineering:architecture` |
| Hỏi nên refactor gì, nợ kỹ thuật | `engineering:tech-debt` |
| Chuẩn bị demo/nộp bài/chạy bản cuối | `engineering:deploy-checklist` |
| **Review & dọn code** | |
| Review thay đổi, "check giúp trước khi merge" | `code-review` |
| Kiểm tra bảo mật (môn Web an toàn, JWT, phân quyền, VNPay) | `security-review` |
| Dọn/rút gọn code vừa viết | `simplify` |
| Viết hoặc dọn comment trong code | `anthropic-skills:human-code-comments` |
| **Git & tài liệu** | |
| Viết commit message, tiêu đề/mô tả PR | `anthropic-skills:human-pr-description` |
| Viết README, tài liệu kỹ thuật, runbook trong `docs/` | `engineering:documentation` |
| Báo cáo môn học dạng Word (`.docx`) | `anthropic-skills:docx` |
| Slide thuyết trình đồ án | `anthropic-skills:pptx` (file .pptx) hoặc `slides` (HTML) |
| Sơ đồ use case, class, sequence (`docs/diagrams/`) | `artifact-diagramming`, hoặc tool draw.io |
| Báo cáo tiến độ hằng ngày | `engineering:standup` |
| **Khác** | |
| Chạy app để xem thay đổi hoạt động | `run` |
| Đổi cấu hình Claude Code, hook, quyền | `update-config` |
| Code gọi API Claude/Anthropic | `claude-api` |

### Skill không dùng cho project này

- `unity:*`: project không dùng Unity.
- `banner-design`, `brand`, `design` (logo, CIP, banner), `design-system` (sinh token mới): chỉ dùng khi người dùng yêu cầu rõ ràng.
- `ui-styling`: viết cho shadcn/ui. Project dùng Tailwind với component riêng trong `frontend/src/components/ui/` (`Button`, `Card`, `Input`), nên không thêm shadcn hay Radix.

### Ưu tiên khi skill mâu thuẫn với project

Quy ước sẵn có của project đứng trên gợi ý của skill. Thứ tự ưu tiên:

1. `docs/contracts.md`, `docs/LUONG_NGHIEP_VU.md`, file đặc tả trong `.claude/`
2. `docs/QUY_TAC_LAM_VIEC_NHOM.md` (vùng cấm, style code, không format lại cả file)
3. Cách các trang/file hiện có đang làm
4. Gợi ý của skill

Nếu skill muốn đổi version thư viện, thêm thư viện mới, hoặc sửa file trong "vùng cấm" thì dừng lại và hỏi người dùng trước.

### Test thanh toán VNPay

Thẻ test sandbox (NCB, OTP) ghi ở `docs/VNPAY_TEST.md`, không cần tìm lại.
