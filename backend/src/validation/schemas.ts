import { z } from 'zod';
import { parseEmail, parseName, parsePassword } from '../services/users';

// Bọc lại các hàm validate tay đã có (giữ đúng quy tắc cũ: trim/lowercase email,
// giới hạn 72 byte cho bcrypt...) thành field zod, để không viết trùng 2 lần logic.
const wrapParser = <T>(parse: (value: unknown) => T) =>
  z.any().transform((value, ctx) => {
    try {
      return parse(value);
    } catch (err) {
      ctx.addIssue({ code: 'custom', message: (err as Error).message });
      return z.NEVER;
    }
  });

export const nameField = wrapParser(parseName);
export const emailField = wrapParser(parseEmail);
export const passwordField = wrapParser(parsePassword);

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  role: z.enum(['driver', 'owner'], { error: () => 'role phải là driver hoặc owner' }),
});

// Login không siết định dạng email ở đây -> sai email/sai password phải trả cùng 1 lỗi 401
// (xem routes/auth.ts), không được lộ qua lỗi 400 khác nhau.
export const loginSchema = z.object({
  email: z.string({ error: () => 'Cần email và password' }),
  password: z.string({ error: () => 'Cần email và password' }),
});

export const refreshSchema = z.object({
  refreshToken: z.string({ error: () => 'Cần refreshToken' }),
});

export const updateUserSchema = z
  .object({
    name: nameField.optional(),
    email: emailField.optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'Cần ít nhất name hoặc email',
  });
