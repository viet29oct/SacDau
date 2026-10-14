import { FacebookIcon, InstagramIcon, YoutubeIcon } from './icons';

export default function LandingFooter() {
  return (
    <footer className="bg-navy-dark py-16 text-white/80">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-lg font-bold text-white">
            Sạc<span className="text-forest-light">Đâu</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Nền tảng quản lý mạng lưới trạm sạc xe điện — tìm trạm, đặt chỗ và thanh toán trong một
            ứng dụng duy nhất.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-white">Liên hệ</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội</li>
            <li>Hotline: 1900 1234</li>
            <li>Email: support@sacdau.vn</li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-white">Mạng xã hội</h4>
          <div className="mt-3 flex gap-3">
            <a
              href="#"
              aria-label="Facebook"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-forest"
            >
              <FacebookIcon className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Instagram"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-forest"
            >
              <InstagramIcon className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Youtube"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-forest"
            >
              <YoutubeIcon className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-white">Chính sách</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="#" className="hover:text-white hover:underline">
                Chính sách bảo mật
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-white hover:underline">
                Điều khoản sử dụng
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-5xl border-t border-white/10 px-6 pt-6 text-xs">
        © {new Date().getFullYear()} SacDau. Đồ án môn học — không phải sản phẩm thương mại.
      </div>
    </footer>
  );
}
