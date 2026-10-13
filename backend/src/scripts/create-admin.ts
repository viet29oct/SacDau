// Tạo tài khoản admin (API /auth/register không cho tự đăng ký role admin).
// Dùng: npm run create-admin -- "Tên Admin" admin@example.com matkhau123
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool, { query } from '../db';
import { parseEmail, parseName, parsePassword } from '../services/users';

const main = async () => {
  const [rawName, rawEmail, rawPassword] = process.argv.slice(2);
  const name = parseName(rawName);
  const email = parseEmail(rawEmail);
  const password = parsePassword(rawPassword);

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [name, email, passwordHash],
  );
  console.log(`Admin sẵn sàng: id=${rows[0].id}, email=${rows[0].email}`);
};

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
