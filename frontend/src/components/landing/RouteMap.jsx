// Sơ đồ tuyến: 4 việc tài xế làm, mỗi việc nối với phần hệ thống chạy phía sau nó.
// Thay cho hai mục cũ "Tính năng nổi bật" và "Quy trình hoạt động"; nội dung lấy từ chính hai mục đó.
const stops = [
  {
    title: 'Tìm trạm sạc gần bạn',
    system: 'Bản đồ trạm',
    detail: 'Trạm gần nhất và đường đi tới đó.',
  },
  {
    title: 'Đặt chỗ trước',
    system: 'Cọc qua VNPay',
    detail: 'Cổng được giữ 5 phút chờ bạn đặt cọc.',
  },
  {
    title: 'Sạc và theo dõi trực tiếp',
    system: 'Thiết bị ở cổng',
    detail: 'Báo trống, đang sạc hay lỗi mỗi 10 giây.',
  },
  {
    title: 'Thanh toán tự động',
    system: 'Hoá đơn',
    detail: 'Tính tiền theo kWh, xuất hoá đơn sau phiên.',
  },
];

export default function RouteMap() {
  return (
    <section className="section" aria-labelledby="route-title">
      <div className="container">
        <div className="head head--split">
          <h2 id="route-title">Một tuyến, bốn điểm dừng.</h2>
          <p className="lead">Từ bản đồ trạm tới hoá đơn, mỗi bước có hệ thống chạy phía sau.</p>
        </div>

        <ol className="route" aria-label="Các bước sạc xe với SạcĐâu">
          {stops.map((s) => (
            <li key={s.title} className="route__stop">
              <h3 className="route__title">{s.title}</h3>
              <div className="route__sys">
                <p className="route__caption">{s.system}</p>
                <p>{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
