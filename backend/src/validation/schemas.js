const { z } = require('zod');
const { parseEmail, parseName, parsePassword } = require('../services/users');

// Bọc lại các hàm validate tay đã có (giữ đúng quy tắc cũ: trim/lowercase email,
// giới hạn 72 byte cho bcrypt...) thành field zod, để không viết trùng 2 lần logic.
const wrapParser = (parse) =>
  z.any().transform((value, ctx) => {
    try {
      return parse(value);
    } catch (err) {
      ctx.addIssue({ code: 'custom', message: err.message });
      return z.NEVER;
    }
  });

const nameField = wrapParser(parseName);
const emailField = wrapParser(parseEmail);
const passwordField = wrapParser(parsePassword);

const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  role: z.enum(['driver', 'owner'], { error: () => 'role phải là driver hoặc owner' }),
});

// Login không siết định dạng email ở đây -> sai email/sai password phải trả cùng 1 lỗi 401
// (xem routes/auth.js), không được lộ qua lỗi 400 khác nhau.
const loginSchema = z.object({
  email: z.string({ error: () => 'Cần email và password' }),
  password: z.string({ error: () => 'Cần email và password' }),
});

const refreshSchema = z.object({
  refreshToken: z.string({ error: () => 'Cần refreshToken' }),
});

const updateUserSchema = z
  .object({
    name: nameField.optional(),
    email: emailField.optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'Cần ít nhất name hoặc email',
  });

// --- Mô hình nghiệp vụ mới (1 công ty vận hành nhiều trạm) — xem docs/contracts.md ---

const latField = z.number({ error: () => 'lat phải là số' }).gte(-90).lte(90);
const lngField = z.number({ error: () => 'lng phải là số' }).gte(-180).lte(180);
const stationNameField = z.string({ error: () => 'name là bắt buộc' }).trim().min(1).max(200);
// Mã trạm IoT gửi lên MQTT (vd "ST01"), khác với name hiển thị — xem contracts.md mục 1
const stationCodeField = z.string({ error: () => 'code là bắt buộc' }).trim().min(1).max(50);

const createStationSchema = z.object({
  name: stationNameField,
  code: stationCodeField,
  lat: latField,
  lng: lngField,
  portsCount: z.number().int().min(1).max(50).optional(),
});

const updateStationSchema = z
  .object({
    name: stationNameField.optional(),
    lat: latField.optional(),
    lng: lngField.optional(),
  })
  .refine((data) => data.name !== undefined || data.lat !== undefined || data.lng !== undefined, {
    message: 'Cần ít nhất 1 field để cập nhật',
  });

const assignOwnerSchema = z.object({
  ownerId: z.number({ error: () => 'ownerId là bắt buộc' }).int().positive(),
});

const isoDateTimeField = (label) =>
  z.string({ error: () => `${label} phải là chuỗi ISO 8601` }).transform((value, ctx) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: 'custom', message: `${label} không hợp lệ` });
      return z.NEVER;
    }
    return date;
  });

// Cho phép sai số 1 phút (độ trễ mạng/clock skew) khi so với "hiện tại"
const createBookingSchema = z
  .object({
    portId: z.number({ error: () => 'portId là bắt buộc' }).int().positive(),
    startTime: isoDateTimeField('startTime'),
    endTime: isoDateTimeField('endTime'),
  })
  .refine((data) => data.startTime.getTime() >= Date.now() - 60 * 1000, {
    message: 'startTime phải lớn hơn hoặc bằng hiện tại',
    path: ['startTime'],
  })
  .refine((data) => data.endTime.getTime() > data.startTime.getTime(), {
    message: 'endTime phải lớn hơn startTime',
    path: ['endTime'],
  });

const createPaymentSchema = z.object({
  chargingSessionId: z.number({ error: () => 'chargingSessionId là bắt buộc' }).int().positive(),
});

module.exports = {
  nameField,
  emailField,
  passwordField,
  registerSchema,
  loginSchema,
  refreshSchema,
  updateUserSchema,
  createStationSchema,
  updateStationSchema,
  assignOwnerSchema,
  createBookingSchema,
  createPaymentSchema,
};
