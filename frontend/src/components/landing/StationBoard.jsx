import { Link } from 'react-router-dom';

// Bảng mẫu: dữ liệu ví dụ để minh hoạ, không phải trạng thái thật của trạm nào.
// Trạng thái thật lấy từ API /stations + WebSocket port:update (docs/contracts.md).
const ports = [
  { name: 'Cổng 1', state: 'Đang trống', tone: 'free', power: '0 kW' },
  { name: 'Cổng 2', state: 'Đang sạc', tone: 'busy', power: '18,4 kW' },
  { name: 'Cổng 3', state: 'Đang trống', tone: 'free', power: '0 kW' },
  { name: 'Cổng 4', state: 'Bảo trì', tone: 'down', power: '0 kW' },
];

const times = ['14:00', '14:30', '15:00', '16:30'];

export default function StationBoard() {
  return (
    <div
      className="board"
      data-slot="hero-board"
      data-kind="product"
      data-alt="Ảnh chụp màn hình bản đồ trạm trong ứng dụng, một trạm đang mở với danh sách cổng"
    >
      <div className="board__head">
        <span className="board__title">Trạm ví dụ, Hà Nội</span>
        <span className="board__live">Cập nhật mỗi 10 giây</span>
      </div>

      <div className="plate board__plate">
        <span className="plate__label">Giá điện</span>
        <span className="plate__figure">
          3.500đ<span className="plate__unit"> /kWh</span>
        </span>
      </div>

      <table className="board__table">
        <thead>
          <tr>
            <th scope="col">Cổng</th>
            <th scope="col">Trạng thái</th>
            <th scope="col" className="num">
              Công suất
            </th>
          </tr>
        </thead>
        <tbody>
          {ports.map((p) => (
            <tr key={p.name} className={p.tone === 'down' ? 'board__row--down' : undefined}>
              <td className="board__port">{p.name}</td>
              <td className={`state state--${p.tone}`}>{p.state}</td>
              <td className="num">{p.power}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="slots">
        <span className="slots__label">Giờ trống chiều nay</span>
        <div className="slots__row">
          {times.map((t) => (
            <Link key={t} to="/register" className="slot-cell" aria-label={`Đặt lúc ${t}, cần đăng ký`}>
              {t}
            </Link>
          ))}
        </div>
      </div>

      <p className="board__note">Dữ liệu mẫu. Trạng thái thật cập nhật trong ứng dụng.</p>
    </div>
  );
}
