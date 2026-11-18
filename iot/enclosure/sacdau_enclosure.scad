// =====================================================================
//  Vỏ hộp trạm sạc SacDau — ESP32 DevKit V1 + DHT22 + 6 LED + 2 nút + biến trở
//  Mạch tham chiếu: iot/diagram.json
//
//  Cách dùng:
//    - Mở bằng OpenSCAD, bật Window > Customizer để chỉnh thông số.
//    - Chọn `part`: "box" / "lid" -> F6 (Render) -> F7 (Export STL).
//    - "print"     : thân + nắp đặt cạnh nhau, nắp đã lật úp sẵn để in.
//    - "assembled" : xem lắp ráp (nắp nâng lên `explode` mm).
//
//  Gốc toạ độ: tâm hộp theo XY, z = 0 là mặt ngoài của đáy.
//    -X = thành có lỗ USB (phía ESP32), +X = thành có khe DHT22.
//    Nhìn nắp từ trên xuống: +Y là phía trên (hàng LED), -Y là phía dưới (nút).
//
//  LƯU Ý: kích thước linh kiện là giá trị phổ biến. Đo lại ESP32, nút,
//  biến trở bằng thước kẹp rồi sửa thông số trước khi in.
// =====================================================================

/* [Phần cần xuất] */
part = "print"; // [print, box, lid, assembled]
explode = 25;   // khoảng nâng nắp khi xem "assembled"

/* [Phíp mạch (ESP32 + điện trở hàn trên đó)] */
pcb_l = 90;            // chiều dài phíp theo X
pcb_w = 70;            // chiều rộng phíp theo Y
pcb_t = 1.6;
pcb_hole_inset = 2.5;  // tâm lỗ góc phíp cách mép
standoff_h = 5;        // chiều cao cọc đỡ phíp
standoff_d = 6;
standoff_hole_d = 2.5; // vít M3 tự ren vào nhựa

/* [Thân hộp] */
wall = 2;
floor_t = 2;
inner_h = 45;          // chiều cao lòng hộp (từ mặt trong đáy tới miệng)
corner_r = 3;          // bo góc ngoài

/* [Cột bắt vít nắp (4 góc)] */
post_d = 7;            // cạnh cột vuông ở góc
post_clear = 1.5;      // khe giữa cột và góc phíp
post_hole_d = 2.5;     // lỗ vít M3 tự ren
post_hole_depth = 12;

/* [Nắp] */
lid_t = 2;             // <= 3 mm để ren M7 của biến trở còn đủ bắt đai ốc
lid_screw_d = 3.4;     // lỗ xuyên vít M3 trên nắp
lip_h = 4;             // gờ định vị cắm vào miệng hộp
lip_t = 1.5;
fit = 0.3;             // khe lắp ghép (tăng nếu nắp quá chặt)

/* [Lỗ trên nắp] */
led_hole_d = 5.3;      // LED 5 mm ép chặt (đế LED kim loại: 6.5–8)
btn_hole_d = 7.2;      // nút nhấn panel PBS-110 (lỗ 7 mm)
pot_hole_d = 7.2;      // biến trở WH148, cổ ren M7
pot_tab = false;       // lỗ chốt chống xoay của biến trở (đo lại vị trí chốt)
pot_tab_offset = 7.5;
pot_tab_d = 3.2;
port_dx = 30;          // khoảng cách mỗi cổng tới tâm theo X
led_y = [22, 12, 2];   // y của LED xanh / vàng / đỏ
pot_pos = [0, -2];
btn_y = -24;

/* [Nhãn khắc trên nắp] */
engrave_labels = true;
label_depth = 0.6;
label_font = "Liberation Sans:style=Bold";

/* [Lỗ USB (thành -X)] */
usb_w = 12;            // theo Y (đủ cho phần nhựa bọc đầu cáp)
usb_h = 10;            // theo Z
usb_y = 0;             // lệch theo Y nếu ESP32 không nằm giữa phíp
usb_z = 18;            // tâm lỗ tính từ mặt trong đáy: đo lại sau khi lắp

/* [DHT22 (thành +X)] */
dht_mode = "vents";    // [vents, window]
dht_y = 0;
dht_z = 30;            // tâm vùng khe/cửa sổ, tính từ mặt trong đáy
dht_slots = 5;
dht_slot_w = 2;
dht_slot_h = 20;
dht_window = [16, 26]; // [Y, Z] cửa sổ cho thân DHT22 15.1 x 25

/* [Khe tản nhiệt ESP32 (hai thành dọc)] */
vent_x = -25;          // tâm vùng khe theo X (phía ESP32)
vent_len = 15;
vent_h = 2;
vent_count = 4;
vent_pitch = 4;
vent_z0 = 12;          // khe thấp nhất, tính từ mặt trong đáy

$fn = 48;

// ---------------- Kích thước suy ra ----------------
inner_l = pcb_l + 2 * (post_d + post_clear);
inner_w = pcb_w + 2 * (post_d + post_clear);
outer_l = inner_l + 2 * wall;
outer_w = inner_w + 2 * wall;
box_h   = floor_t + inner_h;
eps = 0.01;

echo(str("Kich thuoc ngoai: ", outer_l, " x ", outer_w, " x ", box_h + lid_t, " mm"));
echo(str("Long trong: ", inner_l, " x ", inner_w, " x ", inner_h, " mm"));

// ---------------- Tiện ích ----------------
module rbox(l, w, h, r) {
    rr = max(r, 0.5);
    hull()
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx * (l / 2 - rr), sy * (w / 2 - rr), 0])
                cylinder(r = rr, h = h);
}

function post_centers() = [
    for (sx = [-1, 1], sy = [-1, 1])
        [sx * (inner_l / 2 - post_d / 2), sy * (inner_w / 2 - post_d / 2)]
];

// ---------------- Thân hộp ----------------
module box() {
    difference() {
        union() {
            difference() {
                rbox(outer_l, outer_w, box_h, corner_r);
                translate([0, 0, floor_t])
                    rbox(inner_l, inner_w, box_h, corner_r - wall);
            }
            // Cột bắt vít ở 4 góc
            for (p = post_centers())
                translate([p[0] - post_d / 2, p[1] - post_d / 2, floor_t - eps])
                    cube([post_d, post_d, inner_h + eps]);
            // Cọc đỡ phíp
            for (sx = [-1, 1], sy = [-1, 1])
                translate([sx * (pcb_l / 2 - pcb_hole_inset),
                           sy * (pcb_w / 2 - pcb_hole_inset), floor_t - eps])
                    cylinder(d = standoff_d, h = standoff_h + eps);
        }

        // Lỗ vít trong cột góc
        for (p = post_centers())
            translate([p[0], p[1], box_h - post_hole_depth])
                cylinder(d = post_hole_d, h = post_hole_depth + 1);

        // Lỗ vít trong cọc đỡ phíp
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx * (pcb_l / 2 - pcb_hole_inset),
                       sy * (pcb_w / 2 - pcb_hole_inset), floor_t])
                cylinder(d = standoff_hole_d, h = standoff_h + 1);

        // Lỗ USB ở thành -X
        translate([-outer_l / 2 - 1, usb_y - usb_w / 2, floor_t + usb_z - usb_h / 2])
            cube([wall + 2, usb_w, usb_h]);

        // DHT22 ở thành +X
        if (dht_mode == "window") {
            translate([outer_l / 2 - wall - 1, dht_y - dht_window[0] / 2,
                       floor_t + dht_z - dht_window[1] / 2])
                cube([wall + 2, dht_window[0], dht_window[1]]);
        } else {
            pitch = dht_slot_w * 2;
            for (i = [0 : dht_slots - 1])
                translate([outer_l / 2 - wall - 1,
                           dht_y + (i - (dht_slots - 1) / 2) * pitch - dht_slot_w / 2,
                           floor_t + dht_z - dht_slot_h / 2])
                    cube([wall + 2, dht_slot_w, dht_slot_h]);
        }

        // Khe tản nhiệt hai thành dọc, cạnh ESP32
        for (sy = [-1, 1], i = [0 : vent_count - 1])
            translate([vent_x - vent_len / 2,
                       sy > 0 ? outer_w / 2 - wall - 1 : -outer_w / 2 - 1,
                       floor_t + vent_z0 + i * vent_pitch])
                cube([vent_len, wall + 2, vent_h]);
    }
}

// ---------------- Nắp ----------------
// z = 0 là mặt dưới tấm nắp (tì lên miệng hộp); gờ định vị thò xuống z < 0.
module lid_label(txt, pos, size, halign = "center") {
    translate([pos[0], pos[1], lid_t - label_depth])
        linear_extrude(label_depth + 1)
            text(txt, size = size, font = label_font,
                 halign = halign, valign = "center");
}

module lid() {
    lip_l = inner_l - 2 * fit;
    lip_w = inner_w - 2 * fit;
    notch = post_d + fit + 0.5;   // khoét gờ ở góc để tránh cột vít

    difference() {
        union() {
            rbox(outer_l, outer_w, lid_t, corner_r);
            // Gờ định vị
            translate([0, 0, -lip_h])
                difference() {
                    rbox(lip_l, lip_w, lip_h + eps, corner_r - wall - fit);
                    translate([0, 0, -1])
                        rbox(lip_l - 2 * lip_t, lip_w - 2 * lip_t, lip_h + 2,
                             corner_r - wall - fit - lip_t);
                    for (sx = [-1, 1], sy = [-1, 1])
                        translate([sx * (inner_l / 2 - notch / 2),
                                   sy * (inner_w / 2 - notch / 2), lip_h / 2])
                            cube([notch, notch, lip_h + 4], center = true);
                }
        }

        // Lỗ vít nắp
        for (p = post_centers())
            translate([p[0], p[1], -1]) cylinder(d = lid_screw_d, h = lid_t + 2);

        // Hai cổng: 3 LED + 1 nút mỗi cổng
        for (sx = [-1, 1]) {
            for (y = led_y)
                translate([sx * port_dx, y, -1]) cylinder(d = led_hole_d, h = lid_t + 2);
            translate([sx * port_dx, btn_y, -1]) cylinder(d = btn_hole_d, h = lid_t + 2);
        }

        // Biến trở
        translate([pot_pos[0], pot_pos[1], -1]) cylinder(d = pot_hole_d, h = lid_t + 2);
        if (pot_tab)
            translate([pot_pos[0], pot_pos[1] + pot_tab_offset, -1])
                cylinder(d = pot_tab_d, h = lid_t + 2);

        // Nhãn khắc
        if (engrave_labels) {
            lid_label("CỔNG 1", [-port_dx, led_y[0] + 10], 4.5);
            lid_label("CỔNG 2", [ port_dx, led_y[0] + 10], 4.5);
            for (sx = [-1, 1]) {
                lid_label("Rảnh", [sx * port_dx + 5, led_y[0]], 3.2, "left");
                lid_label("Sạc",  [sx * port_dx + 5, led_y[1]], 3.2, "left");
                lid_label("Lỗi",  [sx * port_dx + 5, led_y[2]], 3.2, "left");
            }
            lid_label("CÔNG SUẤT", [pot_pos[0], pot_pos[1] - 14], 3.2);
            lid_label("NÚT 1", [-port_dx, btn_y - 10], 3.5);
            lid_label("NÚT 2", [ port_dx, btn_y - 10], 3.5);
        }
    }
}

// ---------------- Xuất ----------------
if (part == "box") {
    box();
} else if (part == "lid") {
    // Lật úp: mặt trên nắp nằm trên bàn in, gờ hướng lên
    translate([0, 0, lid_t]) rotate([180, 0, 0]) lid();
} else if (part == "assembled") {
    box();
    translate([0, 0, box_h + explode]) lid();
} else { // print
    translate([0, -(outer_w / 2 + 5), 0]) box();
    translate([0, outer_w / 2 + 5, lid_t]) rotate([180, 0, 0]) lid();
}
