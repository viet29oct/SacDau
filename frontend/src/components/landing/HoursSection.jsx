// Giờ phục vụ và luật đặt chỗ: backend/src/config/rules.js, docs/LUONG_NGHIEP_VU.md.
const rules = [
  { term: 'Đặt trước', value: 'Tối đa 7 ngày' },
  { term: 'Mỗi lượt', value: 'Từ 15 phút đến 4 giờ' },
  { term: 'Check-in', value: 'Sớm hoặc trễ tối đa 15 phút' },
  { term: 'Huỷ lịch', value: 'Trước 2 giờ thì được hoàn cọc' },
  { term: 'Công suất', value: 'Tối đa 22 kW mỗi cổng' },
];

export default function HoursSection() {
  return (
    <section className="section hours" aria-labelledby="hours-title">
      <div className="container">
        <div className="hours__grid">
          <div className="hours__side">
            <h2 id="hours-title">Mở cửa từ 6:00 đến 22:00.</h2>
            <address className="address">
              <h3 className="address__head">Liên hệ</h3>
              <span>235 Hoàng Quốc Việt, Hà Nội</span>
              <span>
                Hotline:{' '}
                <a className="link" href="tel:19001234">
                  1900 1234
                </a>
              </span>
              <span>
                Email:{' '}
                <a className="link" href="mailto:support@sacdau.vn">
                  support@sacdau.vn
                </a>
              </span>
            </address>
          </div>

          <dl className="rules">
            {rules.map((r) => (
              <div key={r.term}>
                <dt>{r.term}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure className="strip" aria-label="Giờ phục vụ trong ngày: từ 6 giờ sáng đến 22 giờ">
          <div className="strip__bar">
            <div className="strip__open">Nhận đặt chỗ và sạc</div>
          </div>
          <ol className="strip__ticks" aria-hidden="true">
            <li>0:00</li>
            <li>6:00</li>
            <li>12:00</li>
            <li>18:00</li>
            <li>24:00</li>
          </ol>
        </figure>
      </div>
    </section>
  );
}
