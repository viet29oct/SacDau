const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { expireUnpaidHolds, markNoShows, completeStaleCheckIns } = require('../src/services/bookingJobs');
const {
  createAdmin,
  createOwner,
  createStationWithPort,
  insertBooking,
  latestPayment,
  minutesFromNow,
  payDeposit,
  registerUser,
  resetDb,
  simulateIpn,
  vnTime,
} = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

const book = (token, body) => request(app).post('/bookings').set('Authorization', `Bearer ${token}`).send(body);

// 10h-11h sáng mai giờ VN: luôn hợp lệ (tương lai, trong 7 ngày, trong giờ phục vụ)
const tomorrowSlot = (overrides = {}) => ({
  startTime: vnTime(1, 10).toISOString(),
  endTime: vnTime(1, 11).toISOString(),
  ...overrides,
});

const bookingStatus = async (id) => (await pool.query('SELECT status FROM bookings WHERE id = $1', [id])).rows[0].status;

describe('POST /bookings — đặt chỗ + cọc VNPay', () => {
  it('driver đặt -> 201 pending giữ chỗ 5 phút, có link VNPay cọc (có hạn), chưa có mã check-in', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const res = await book(driver.accessToken, { portId, ...tomorrowSlot() });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ userId: driver.user.id, portId, status: 'pending', depositAmount: 20000, checkInCode: null });
    const holdMs = new Date(res.body.data.holdExpiresAt).getTime() - Date.now();
    expect(holdMs).toBeGreaterThan(4 * 60 * 1000);
    expect(holdMs).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(res.body.data.paymentUrl).toMatch(/vnp_ExpireDate=/);
    expect(res.body.data.paymentUrl).toMatch(/vnp_Amount=2000000/);

    const payment = await latestPayment({ bookingId: res.body.data.id });
    expect(payment).toMatchObject({ purpose: 'booking_deposit', status: 'pending', user_id: driver.user.id });
    expect(res.body.data.depositPaymentId).toBe(payment.id);
  });

  it('IPN cọc thành công -> confirmed, tài xế thấy mã check-in 6 số', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const created = await book(driver.accessToken, { portId, ...tomorrowSlot() });

    const ipn = await payDeposit(created.body.data.id);
    expect(ipn.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });

    const me = await request(app).get('/bookings/me').set('Authorization', `Bearer ${driver.accessToken}`);
    expect(me.body.data[0].status).toBe('confirmed');
    expect(me.body.data[0].checkInCode).toMatch(/^\d{6}$/);
  });

  it('IPN sai số tiền -> RspCode 04, booking vẫn pending', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const created = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    const payment = await latestPayment({ bookingId: created.body.data.id });

    const ipn = await simulateIpn(payment.vnpay_txn_ref, { amount: 100 });
    expect(ipn.body.RspCode).toBe('04');
    expect(await bookingStatus(created.body.data.id)).toBe('pending');
  });

  it('owner/admin không đặt chỗ được -> 403', async () => {
    const { portId, owner } = await createStationWithPort();
    const admin = await createAdmin();
    for (const { accessToken } of [owner, admin]) {
      const res = await book(accessToken, { portId, ...tomorrowSlot() });
      expect(res.status).toBe(403);
    }
  });

  it('2 tài xế gửi cùng lúc cùng cổng cùng giờ -> đúng 1 thành công (exclusion constraint)', async () => {
    const { portId } = await createStationWithPort();
    const a = await registerUser();
    const b = await registerUser({ email: 'b@example.com' });
    const results = await Promise.all([
      book(a.accessToken, { portId, ...tomorrowSlot() }),
      book(b.accessToken, { portId, ...tomorrowSlot({ startTime: vnTime(1, 10, 30).toISOString() }) }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('BOOKING_CONFLICT');
  });

  it('cùng 1 tài xế đặt 2 cổng khác nhau chồng giờ -> 409 BOOKING_CONFLICT', async () => {
    const { portIds } = await createStationWithPort({ portsCount: 2 });
    const driver = await registerUser();
    const first = await book(driver.accessToken, { portId: portIds[0], ...tomorrowSlot() });
    await payDeposit(first.body.data.id);

    const second = await book(driver.accessToken, { portId: portIds[1], ...tomorrowSlot() });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('BOOKING_CONFLICT');
    expect(second.body.error.message).toMatch(/Bạn đã có booking/);
  });

  it.each([
    ['startTime ở quá khứ', { startTime: minutesFromNow(-30), endTime: minutesFromNow(30) }],
    ['ngắn hơn 15 phút', { startTime: vnTime(1, 10), endTime: vnTime(1, 10, 10) }],
    ['dài hơn 4 giờ', { startTime: vnTime(1, 8), endTime: vnTime(1, 13) }],
    ['đặt trước quá 7 ngày', { startTime: vnTime(9, 10), endTime: vnTime(9, 11) }],
    ['endTime <= startTime', { startTime: vnTime(1, 11), endTime: vnTime(1, 10) }],
  ])('%s -> 400 VALIDATION_ERROR', async (_label, slot) => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const res = await book(driver.accessToken, {
      portId,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('đang có 1 booking chờ cọc -> không giữ thêm chỗ (chống spam khoá cổng)', async () => {
    const { portIds } = await createStationWithPort({ portsCount: 2 });
    const driver = await registerUser();
    await book(driver.accessToken, { portId: portIds[0], ...tomorrowSlot() });
    const res = await book(driver.accessToken, {
      portId: portIds[1],
      startTime: vnTime(2, 10).toISOString(),
      endTime: vnTime(2, 11).toISOString(),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_LIMIT_REACHED');
  });

  it('đã để hết hạn cọc 3 lần trong 24h -> 409 BOOKING_LIMIT_REACHED', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    for (let i = 0; i < 3; i += 1) {
      await pool.query(
        `INSERT INTO bookings (user_id, port_id, start_time, end_time, status, cancel_reason, cancelled_at)
         VALUES ($1, $2, now() + make_interval(days => $3 + 2), now() + make_interval(days => $3 + 2, hours => 1),
                 'cancelled', 'payment_timeout', now())`,
        [driver.user.id, portId, i],
      );
    }
    const res = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_LIMIT_REACHED');
  });

  it('còn phiên sạc chưa trả phần còn lại -> 409 UNPAID_SESSION_EXISTS', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    await pool.query(
      `INSERT INTO charging_sessions (port_id, user_id, started_at, ended_at, energy_kwh, cost, deposit_applied)
       VALUES ($1, $2, now() - interval '2 hour', now() - interval '1 hour', 20, 70000, 20000)`,
      [portId, driver.user.id],
    );
    const res = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNPAID_SESSION_EXISTS');
  });

  it('trạm chưa có quản lý / đã ngừng hoạt động -> 409 STATION_NOT_OPERATIONAL', async () => {
    const noOwner = await createStationWithPort({ code: 'ST01', ownerId: null });
    const inactive = await createStationWithPort({ code: 'ST02' });
    await pool.query('UPDATE stations SET is_active = false WHERE id = $1', [inactive.stationId]);
    const driver = await registerUser();
    for (const portId of [noOwner.portId, inactive.portId]) {
      const res = await book(driver.accessToken, { portId, ...tomorrowSlot() });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STATION_NOT_OPERATIONAL');
    }
  });

  it('cổng bảo trì -> 409 PORT_UNAVAILABLE', async () => {
    const { portId } = await createStationWithPort();
    await pool.query("UPDATE ports SET service_status = 'maintenance' WHERE id = $1", [portId]);
    const driver = await registerUser();
    const res = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PORT_UNAVAILABLE');
  });

  it('cổng mất kết nối: chặn booking bắt đầu trong 1 giờ, nhưng vẫn cho đặt ngày mai', async () => {
    const { portId } = await createStationWithPort({ online: false });
    const driver = await registerUser();
    const soon = await book(driver.accessToken, {
      portId,
      startTime: minutesFromNow(5).toISOString(),
      endTime: minutesFromNow(35).toISOString(),
    });
    expect(soon.status).toBe(409);
    expect(soon.body.error.code).toBe('PORT_UNAVAILABLE');

    const tomorrow = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    expect(tomorrow.status).toBe(201);
  });

  it('portId không tồn tại -> 404 NOT_FOUND', async () => {
    const driver = await registerUser();
    const res = await book(driver.accessToken, { portId: 9999, ...tomorrowSlot() });
    expect(res.status).toBe(404);
  });
});

describe('Giờ phục vụ 6h-22h (giờ Việt Nam)', () => {
  it('booking ngoài giờ phục vụ hoặc qua ngày -> lỗi; trong giờ -> hợp lệ', () => {
    const original = { open: process.env.SERVICE_OPEN_HOUR, close: process.env.SERVICE_CLOSE_HOUR };
    process.env.SERVICE_OPEN_HOUR = '6';
    process.env.SERVICE_CLOSE_HOUR = '22';
    try {
      jest.isolateModules(() => {
        const { assertBookingWindow } = require('../src/services/bookings');
        expect(() => assertBookingWindow(vnTime(1, 10), vnTime(1, 11))).not.toThrow();
        expect(() => assertBookingWindow(vnTime(1, 21), vnTime(1, 22))).not.toThrow();
        expect(() => assertBookingWindow(vnTime(1, 5, 30), vnTime(1, 6, 30))).toThrow(/giờ phục vụ/);
        expect(() => assertBookingWindow(vnTime(1, 21, 30), vnTime(1, 22, 30))).toThrow(/giờ phục vụ/);
      });
    } finally {
      process.env.SERVICE_OPEN_HOUR = original.open;
      process.env.SERVICE_CLOSE_HOUR = original.close;
    }
  });
});

describe('Job giữ chỗ / no-show', () => {
  it('quá hạn cọc -> job huỷ (payment_timeout), payment failed, slot trống lại cho người khác', async () => {
    const { portId } = await createStationWithPort();
    const a = await registerUser();
    const b = await registerUser({ email: 'b@example.com' });
    const created = await book(a.accessToken, { portId, ...tomorrowSlot() });
    const id = created.body.data.id;

    await pool.query("UPDATE bookings SET hold_expires_at = now() - interval '2 minutes' WHERE id = $1", [id]);
    expect(await expireUnpaidHolds()).toBe(1);
    expect(await bookingStatus(id)).toBe('cancelled');
    expect((await latestPayment({ bookingId: id })).status).toBe('failed');

    const retry = await book(b.accessToken, { portId, ...tomorrowSlot() });
    expect(retry.status).toBe(201);
  });

  it('chưa quá đệm 1 phút cho IPN đến trễ -> job chưa huỷ', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const created = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    await pool.query("UPDATE bookings SET hold_expires_at = now() - interval '30 seconds' WHERE id = $1", [
      created.body.data.id,
    ]);
    expect(await expireUnpaidHolds()).toBe(0);
  });

  it('VNPay báo đã trả SAU KHI booking bị huỷ -> ghi nhận tiền, đánh dấu cần hoàn, không khôi phục booking', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const created = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    const id = created.body.data.id;
    await pool.query("UPDATE bookings SET hold_expires_at = now() - interval '2 minutes' WHERE id = $1", [id]);
    await expireUnpaidHolds();

    const ipn = await payDeposit(id);
    expect(ipn.body.RspCode).toBe('00');
    const payment = await latestPayment({ bookingId: id });
    expect(payment).toMatchObject({ status: 'success', refund_status: 'due' });
    expect(await bookingStatus(id)).toBe('cancelled');
  });

  it('đã cọc nhưng quá giờ bắt đầu + 15 phút chưa check-in -> no_show', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const late = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: -20, durationMin: 10 });
    const onTime = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: -10, durationMin: 5 });
    expect(await markNoShows()).toBe(1);
    expect(await bookingStatus(late.id)).toBe('no_show');
    expect(await bookingStatus(onTime.id)).toBe('confirmed');
  });

  it('check-in rồi hết giờ mà không cắm sạc -> completed', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const booking = await insertBooking({
      userId: driver.user.id,
      portId,
      startOffsetMin: -90,
      durationMin: 60,
      status: 'checked_in',
    });
    expect(await completeStaleCheckIns()).toBe(1);
    expect(await bookingStatus(booking.id)).toBe('completed');
  });
});

describe('GET /bookings/me', () => {
  it('chỉ trả booking của chính mình', async () => {
    const { portIds } = await createStationWithPort({ portsCount: 2 });
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    await book(driver.accessToken, { portId: portIds[0], ...tomorrowSlot() });
    await book(other.accessToken, { portId: portIds[1], ...tomorrowSlot() });

    const res = await request(app).get('/bookings/me').set('Authorization', `Bearer ${driver.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe(driver.user.id);
  });
});

describe('PATCH /bookings/:id/cancel — huỷ & hoàn cọc', () => {
  const cancel = (token, id, body = {}) =>
    request(app).patch(`/bookings/${id}/cancel`).set('Authorization', `Bearer ${token}`).send(body);

  it('tài xế huỷ khi còn pending -> cancelled, giao dịch cọc chưa trả -> failed', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const created = await book(driver.accessToken, { portId, ...tomorrowSlot() });
    const res = await cancel(driver.accessToken, created.body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', depositOutcome: 'none' });
    expect((await latestPayment({ bookingId: created.body.data.id })).status).toBe('failed');
  });

  it('tài xế huỷ trước giờ bắt đầu >= 2 tiếng -> cọc cần hoàn', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 180 });
    const res = await cancel(driver.accessToken, booking.id);
    expect(res.body.data.depositOutcome).toBe('refund_due');
    expect((await latestPayment({ bookingId: booking.id })).refund_status).toBe('due');
  });

  it('tài xế huỷ sát giờ (< 2 tiếng) -> mất cọc', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 60 });
    const res = await cancel(driver.accessToken, booking.id);
    expect(res.body.data.depositOutcome).toBe('forfeited');
    expect((await latestPayment({ bookingId: booking.id })).refund_status).toBeNull();
  });

  it('quản lý trạm huỷ (cổng hỏng) -> cọc cần hoàn; quản lý trạm khác / tài xế khác -> 403', async () => {
    const { portId, owner } = await createStationWithPort();
    const otherOwner = await createOwner({ email: 'o2@example.com' });
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 30 });

    for (const { accessToken } of [otherOwner, other]) {
      expect((await cancel(accessToken, booking.id)).status).toBe(403);
    }
    const res = await cancel(owner.accessToken, booking.id, { reason: 'Cổng hỏng cáp' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ depositOutcome: 'refund_due', cancelReason: 'Cổng hỏng cáp' });
  });

  it('booking đã check-in hoặc tài xế huỷ khi đã quá giờ bắt đầu -> 400 BOOKING_CANCEL_NOT_ALLOWED', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const checkedIn = await insertBooking({
      userId: driver.user.id,
      portId,
      startOffsetMin: -30,
      durationMin: 20,
      status: 'checked_in',
    });
    const started = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 60, durationMin: 30 });
    await pool.query("UPDATE bookings SET start_time = now() - interval '1 minute' WHERE id = $1", [started.id]);

    for (const id of [checkedIn.id, started.id]) {
      const res = await cancel(driver.accessToken, id);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BOOKING_CANCEL_NOT_ALLOWED');
    }
  });
});

describe('POST /bookings/:id/check-in — check-in bằng mã', () => {
  const checkIn = (token, id, body) =>
    request(app).post(`/bookings/${id}/check-in`).set('Authorization', `Bearer ${token}`).send(body);

  const openSession = async (portId, { userId = null, bookingId = null, startedMinAgo = 2 } = {}) => {
    const { rows } = await pool.query(
      `INSERT INTO charging_sessions (port_id, user_id, booking_id, started_at, energy_kwh, unit_price)
       VALUES ($1, $2, $3, now() - make_interval(mins => $4), 0.5, 3500) RETURNING *`,
      [portId, userId, bookingId, startedMinAgo],
    );
    return rows[0];
  };

  it('đúng mã trong cửa sổ +-15 phút -> checked_in', async () => {
    const { portId, owner } = await createStationWithPort();
    const driver = await registerUser();
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 5 });
    const res = await checkIn(owner.accessToken, booking.id, { code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking).toMatchObject({ status: 'checked_in', checkInCode: null });
    expect(res.body.data.session).toBeNull();
  });

  it('sai mã -> 400; sai 5 lần -> khoá 10 phút, kể cả nhập đúng sau đó vẫn bị chặn', async () => {
    const { portId, owner } = await createStationWithPort();
    const driver = await registerUser();
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 5 });

    const first = await checkIn(owner.accessToken, booking.id, { code: '000000' });
    expect(first.status).toBe(400);
    expect(first.body.error.code).toBe('INVALID_CHECKIN_CODE');
    for (let i = 0; i < 3; i += 1) await checkIn(owner.accessToken, booking.id, { code: '000000' });
    const fifth = await checkIn(owner.accessToken, booking.id, { code: '000000' });
    expect(fifth.status).toBe(429);

    const correct = await checkIn(owner.accessToken, booking.id, { code: '123456' });
    expect(correct.status).toBe(429);
    expect(await bookingStatus(booking.id)).toBe('confirmed');
  });

  it('quản lý trạm khác (IDOR) -> 403; tài xế tự check-in -> 403', async () => {
    const { portId } = await createStationWithPort();
    const otherOwner = await createOwner({ email: 'o2@example.com' });
    const driver = await registerUser();
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 5 });
    expect((await checkIn(otherOwner.accessToken, booking.id, { code: '123456' })).status).toBe(403);
    expect((await checkIn(driver.accessToken, booking.id, { code: '123456' })).status).toBe(403);
  });

  it('ngoài cửa sổ check-in -> 400 CHECKIN_NOT_ALLOWED; booking chưa cọc -> 400', async () => {
    const { portIds, owner } = await createStationWithPort({ portsCount: 2 });
    const driver = await registerUser();
    const early = await insertBooking({ userId: driver.user.id, portId: portIds[0], startOffsetMin: 60 });
    const unpaid = await insertBooking({
      userId: driver.user.id,
      portId: portIds[1],
      startOffsetMin: 200,
      status: 'pending',
      depositPaid: false,
    });
    for (const id of [early.id, unpaid.id]) {
      const res = await checkIn(owner.accessToken, id, { code: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CHECKIN_NOT_ALLOWED');
    }
  });

  it('cổng đang có phiên chưa gắn ai -> không tự gán (409 kèm phiên), gửi lại kèm attachSessionId thì gắn', async () => {
    const { portId, owner } = await createStationWithPort();
    const driver = await registerUser();
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 5 });
    const session = await openSession(portId);

    const first = await checkIn(owner.accessToken, booking.id, { code: '123456' });
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('SESSION_ACTION_NOT_ALLOWED');
    expect(first.body.error.details.session.id).toBe(session.id);
    expect(await bookingStatus(booking.id)).toBe('confirmed');

    const second = await checkIn(owner.accessToken, booking.id, { code: '123456', attachSessionId: session.id });
    expect(second.status).toBe(200);
    expect(second.body.data.session).toMatchObject({ id: session.id, userId: driver.user.id, bookingId: booking.id });
  });

  it('cổng đã đặt bị xe khác chiếm -> đổi sang cổng trống cùng trạm bằng portId; cổng trạm khác -> 400', async () => {
    const { portIds, owner } = await createStationWithPort({ portsCount: 2 });
    const otherStation = await createStationWithPort({ code: 'ST02' });
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    const booking = await insertBooking({ userId: driver.user.id, portId: portIds[0], startOffsetMin: 5 });
    await openSession(portIds[0], { userId: other.user.id });

    const blocked = await checkIn(owner.accessToken, booking.id, { code: '123456' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PORT_UNAVAILABLE');

    const wrongStation = await checkIn(owner.accessToken, booking.id, { code: '123456', portId: otherStation.portId });
    expect(wrongStation.status).toBe(400);

    const moved = await checkIn(owner.accessToken, booking.id, { code: '123456', portId: portIds[1] });
    expect(moved.status).toBe(200);
    expect(moved.body.data.booking).toMatchObject({ status: 'checked_in', portId: portIds[1] });
  });

  it('rút ra cắm lại: check-in lại kèm mã + attachSessionId gắn phiên mới; thiếu attachSessionId -> 400', async () => {
    const { portId, owner } = await createStationWithPort();
    const driver = await registerUser();
    const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: -20, status: 'checked_in' });
    const session = await openSession(portId);

    const noAttach = await checkIn(owner.accessToken, booking.id, { code: '123456' });
    expect(noAttach.status).toBe(400);
    const res = await checkIn(owner.accessToken, booking.id, { code: '123456', attachSessionId: session.id });
    expect(res.status).toBe(200);
    expect(res.body.data.session.userId).toBe(driver.user.id);
  });
});

describe('GET /stations/:id/bookings — danh sách booking hôm nay của trạm', () => {
  it('owner thấy tên tài xế, không thấy mã check-in; owner trạm khác -> 403', async () => {
    const { stationId, portId, owner } = await createStationWithPort();
    const otherOwner = await createOwner({ email: 'o2@example.com' });
    const driver = await registerUser();
    await insertBooking({ userId: driver.user.id, portId, startOffsetMin: 0, durationMin: 15 });

    const res = await request(app)
      .get(`/stations/${stationId}/bookings`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ driverName: 'Tài xế A', checkInCode: null });

    const forbidden = await request(app)
      .get(`/stations/${stationId}/bookings`)
      .set('Authorization', `Bearer ${otherOwner.accessToken}`);
    expect(forbidden.status).toBe(403);
  });
});
