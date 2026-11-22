// Mức giá mặc định ở backend/src/config/rules.js (đọc được từ env). Đổi giá thì sửa ở đó và ở đây.
const fares = [
  { name: 'Điện năng', figure: '3.500đ', unit: '/kWh', when: 'Theo số kWh đo được ở cổng' },
  { name: 'Tiền cọc', figure: '20.000đ', unit: '', when: 'Khi giữ chỗ một cổng' },
  { name: 'Phí chiếm chỗ', figure: '1.000đ', unit: '/phút', when: 'Xe đầy quá 15 phút, tối đa 100.000đ' },
];

export default function PriceBoard() {
  return (
    <section className="band-ink on-ink" aria-labelledby="fares-title">
      <div className="container">
        <div className="head head--split">
          <h2 id="fares-title">Giá điện, tiền cọc, phí chờ.</h2>
          <p className="lead">Một mức cho mọi trạm trong mạng lưới.</p>
        </div>
        <table className="fares">
          <thead>
            <tr>
              <th scope="col">Khoản</th>
              <th scope="col">Mức</th>
              <th scope="col">Áp dụng khi</th>
            </tr>
          </thead>
          <tbody>
            {fares.map((f) => (
              <tr key={f.name}>
                <td className="fares__name">{f.name}</td>
                <td>
                  <span className="fares__figure">{f.figure}</span>
                  {f.unit && <span className="fares__unit"> {f.unit}</span>}
                </td>
                <td className="fares__when">{f.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
