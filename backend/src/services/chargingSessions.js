// Object ChargingSession chuẩn theo docs/contracts.md mục 3.
// bookingId có thể null (phiên sạc vãng lai, không qua đặt chỗ trước).
const toChargingSession = (row) => ({
  id: row.id,
  bookingId: row.booking_id,
  portId: row.port_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  energyKwh: row.energy_kwh === null || row.energy_kwh === undefined ? null : Number(row.energy_kwh),
  cost: row.cost === null || row.cost === undefined ? null : Number(row.cost),
});

module.exports = { toChargingSession };
