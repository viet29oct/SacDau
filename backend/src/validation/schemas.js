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

module.exports = {
  nameField,
  emailField,
  passwordField,
  registerSchema,
  loginSchema,
  refreshSchema,
  updateUserSchema,
};
