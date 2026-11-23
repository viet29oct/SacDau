# Xem DB của project bằng pgAdmin

Postgres của project chạy trong Docker (container `sacdau_postgres`, image PostGIS) và mở ra máy ở cổng **5433**.

## Thông tin kết nối

| Trường | Giá trị |
|---|---|
| Host name/address | `localhost` |
| Port | **`5433`** (không phải 5432) |
| Maintenance database | `sacdau` (DB test: `sacdau_test`) |
| Username | `sacdau_user` |
| Password | `sacdau_dev_pw` |

Đây là giá trị mặc định trong `.env.example` và `docker-compose.yml`. Nếu đã đổi `.env` thì lấy theo `.env`.

## Thêm server trong pgAdmin

1. Chuột phải vào **Servers** → **Register** → **Server…**
2. Tab **General**: Name đặt là `SacDau`.
3. Tab **Connection**: điền theo bảng trên, tick **Save password?**
4. Bấm **Save**.

Bảng nằm ở: **SacDau → Databases → sacdau → Schemas → public → Tables**.
Xem dữ liệu: chuột phải vào bảng → **View/Edit Data → All Rows**. Chạy SQL: chọn DB rồi mở **Query Tool**.

## Lỗi hay gặp

- **Không thấy DB `sacdau`, chỉ thấy các DB lạ**: bạn đang ở server mặc định của pgAdmin (vd. **PostgreSQL 18**). Đó là Postgres cài thẳng trên Windows, chạy cổng 5432, không phải DB của project. Hãy dùng server `SacDau` ở cổng 5433.
- **`password authentication failed for user "..."`**:
  - Kiểm tra Port có đúng là `5433` không.
  - Kiểm tra Username có đúng là `sacdau_user` không. DB này không có user nào khác (ví dụ `sacdau_admin` là sai).
  - Xem có **dấu cách thừa** ở cuối username hoặc password không. Trong thông báo lỗi sẽ thấy dạng `"sacdau_user "`.
  - Muốn sửa thì chuột phải vào server → **Properties…** → tab **Connection**.
- **`Connection refused`**: container chưa chạy. Mở Docker Desktop rồi chạy trong thư mục `SacDau`:
  ```
  docker compose up -d postgres
  ```

## Kiểm tra nhanh bằng dòng lệnh

```
docker exec -it sacdau_postgres psql -U sacdau_user -d sacdau
```

## Lưu ý

Sửa cấu trúc bảng bằng tay trong pgAdmin thì thay đổi đó không nằm trong migration của backend. Muốn đổi schema thì làm qua migration.
