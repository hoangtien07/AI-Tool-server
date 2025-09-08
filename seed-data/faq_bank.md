---
collection: liam-faq
version: 1.0
lang: vi
notes: |
  File này chứa tri thức/FAQ + kịch bản gợi ý (discovery → booking).
  Dùng với tool rules: semantic_search_files → send_message; pricing luôn gọi get_course_catalog/get_promotions.
---

## discovery_script | tư vấn ban đầu | bắt đầu tư vấn
intent: greeting
tags: [discovery, script]
content:
  - "Mình là Trang bên Liam English. Bạn muốn xem **lịch & buổi trải nghiệm** trước hay **học phí & lộ trình** trước?"
  - "Nếu bạn bận, mình giữ 1 slot trải nghiệm miễn phí để giáo viên khám 15–20’ và gợi lộ trình cá nhân hóa."
cta:
  - "Bạn chọn **xem lịch** (để mình gợi 2–3 slot gần nhất) hay **xem học phí** trước?"

tool_hint:
  call: scheduling_manager.list_slots
  note: |
    Khi user chọn xem lịch → liệt kê 2–3 slot sớm nhất (ưu tiên buổi tối/cuối tuần nếu chưa có sở thích).
    Nếu user chọn học phí → nhảy tới mục pricing.

---

## booking_trial | đặt buổi trải nghiệm | trial | placement test
intent: book_trial
tags: [trial, placement, booking]
content:
  - "Để giữ chỗ, cần: **Họ tên**, **Số điện thoại**, (nếu online) **Email** để gửi link. Thiếu trường nào thì hỏi trường đó."
  - "Sau khi xác nhận, gửi: mã đặt, ngày/giờ, hình thức (online), link học + checklist chuẩn bị."
slot_filling:
  - ask_name:  "Bạn cho mình **họ tên** nhé?"
  - ask_phone: "Bạn cho mình **số điện thoại** để nhắc lịch?"
  - ask_email: "Bạn dùng **email** nào để nhận link lớp?"
cta:
  - "Slot gần nhất: {{slot1}}, {{slot2}}, {{slot3}} — bạn chọn giúp mình ạ?"
tool_hint:
  call: scheduling_manager.book
  memory: [profile.full_name, profile.phone, profile.email, booking.slot_id]

---

## schedule_slots | xem lịch trống | khung giờ | buổi tối
intent: schedule_slots
tags: [schedule, time, slot]
content:
  - "Lịch gần nhất mình đang có: {{slot1}}, {{slot2}}, {{slot3}}."
  - "Lớp học **online 100%**, bạn có thể học ở bất cứ đâu. Nếu thích, mình ưu tiên slot buổi tối/ cuối tuần."
cta:
  - "Bạn chọn {{slot1}} hay {{slot2}}? Nếu cần khung khác mình lọc tiếp nhé."
tool_hint:
  call: scheduling_manager.list_slots

---

## reschedule | dời lịch | đổi lịch
intent: reschedule
tags: [booking, change, reschedule]
content:
  - "Mình hỗ trợ dời lịch. Bạn cho mình **mã đặt** (nếu có) và mình gợi slot mới: {{slot1}}, {{slot2}}, {{slot3}}."
cta:
  - "Bạn muốn chuyển sang {{slot1}} hay {{slot2}}?"
tool_hint:
  call: scheduling_manager.reschedule

---

## cancel_booking | hủy lịch | không tham gia
intent: cancel
tags: [booking, cancel]
content:
  - "Mình có thể hủy giúp bạn. Bạn cho mình **mã đặt** hoặc thời gian đã giữ nhé."
cta:
  - "Bạn xác nhận muốn hủy lịch này chứ? Mình sẽ giữ sẵn 1–2 slot dự phòng nếu bạn cần."
tool_hint:
  call: scheduling_manager.cancel

---

## modality | online hay offline | học ở đâu
intent: modality
tags: [modality, location, online]
content:
  - "**Hiện lớp diễn ra online 100%** để bạn học linh hoạt ở mọi nơi, được hỗ trợ nhanh qua nền tảng trực tuyến."
  - "HQ: Sao Biển SP11-31, Vinhomes Ocean Park, Gia Lâm, Hà Nội (điểm liên hệ). Khi có workshop/thi xếp lịch tại cơ sở sẽ thông báo riêng."
cta:
  - "Bạn thấy học **online buổi tối** hay **cuối tuần** tiện hơn để mình gợi slot phù hợp?"

---

## pricing | học phí | bảng giá | price
intent: pricing
dynamic: true
tags: [pricing, fee, promotions]
content:
  - "Học phí phụ thuộc lộ trình (nhóm nhỏ/1–1), thời lượng và ưu đãi hiện hành."
  - "Luôn kiểm tra **bảng giá & khuyến mãi live** trước khi báo giá cụ thể."
cta:
  - "Bạn muốn xem **tóm tắt theo ngân sách** hay **chi tiết từng gói**?"
tool_hint:
  call: get_course_catalog, get_promotions

---

## lesson_freq | mỗi tuần mấy buổi | lịch học
intent: schedule_detail
tags: [frequency, plan]
content:
  - "Mặc định **2 buổi/tuần với giáo viên**; các ngày còn lại có bài thực hành ngắn (được chữa trong ngày)."
  - "Có thể tăng/giảm tần suất tùy mục tiêu & quỹ thời gian."
cta:
  - "Bạn rảnh **tối** hay **cuối tuần** để mình đề xuất lịch phù hợp?"

---

## lesson_duration | mỗi buổi bao nhiêu phút | thời lượng buổi
intent: duration
tags: [duration, minutes]
content:
  - "Mỗi buổi thường **60–90 phút**, tùy lộ trình và cách sắp lịch."
  - "Thời lượng sẽ tối ưu theo khả năng tập trung & mục tiêu của bạn."
cta:
  - "Bạn thích **60’ gọn nhẹ** hay **90’ sâu hơn**?"

---

## teachers | giáo viên Việt hay bản ngữ | chọn giáo viên
intent: teacher
tags: [teacher, native, vn]
content:
  - "Có cả giáo viên Việt Nam và giáo viên bản ngữ; đội ngũ đều có chứng chỉ & ≥3 năm kinh nghiệm dạy người đi làm."
  - "Bạn có thể **đề xuất giáo viên** theo phong cách phù hợp; trong quá trình học có thể đổi nếu cần."
cta:
  - "Bạn muốn ưu tiên **VN dẫn dắt nền tảng** hay **bản ngữ luyện phản xạ**?"

---

## guarantee | cam kết | 6 tháng giao tiếp
intent: guarantee
tags: [commitment, outcome]
content:
  - "Mình **cam kết lộ trình & đồng hành**: mục tiêu rõ ràng, theo dõi tiến độ, điều chỉnh tần suất/định hướng khi cần."
  - "Thời gian đạt mục tiêu **phụ thuộc nền tảng và mức độ luyện tập**. Trung bình người mất gốc có thể giao tiếp cơ bản sau **4–6 tháng** nếu theo đúng kế hoạch."
cta:
  - "Mình giữ một buổi trải nghiệm để đo trình độ rồi chốt lộ trình & mốc thời gian nhé?"

---

## refund_policy | hoàn học phí | bảo lưu | chuyển nhượng
intent: refund_policy
tags: [policy, refund]
content:
  - "Thông thường **không hoàn học phí** sau khi kích hoạt khóa; trong trường hợp bất khả kháng có thể **bảo lưu** hoặc **chuyển nhượng** theo điều kiện trung tâm."
  - "Chi tiết áp dụng theo chính sách hiện hành."
cta:
  - "Bạn cần mình tạo phiếu hỗ trợ để tư vấn tình huống cụ thể không?"
tool_hint:
  call: crm_manager.create_ticket

---

## payment_terms | đóng theo tháng | học phí trả góp
intent: payment
tags: [payment, terms]
content:
  - "Thanh toán theo **khóa**. Nếu cần chia nhỏ lộ trình/chi phí, team tư vấn sẽ gợi phương án phù hợp."
  - "Ưu tiên chọn lộ trình sát mục tiêu để tối ưu chi phí/hiệu quả."
cta:
  - "Bạn muốn tham khảo gói **nhóm nhỏ** hay **1–1** để mình báo khung chi phí?"

---

## timeline_beginner | mất gốc học bao lâu giao tiếp
intent: timeline
tags: [beginner, timeline]
content:
  - "Với người mất gốc, lộ trình tiêu chuẩn để giao tiếp cơ bản thường **4–6 tháng** nếu học đều và có thực hành có hướng dẫn."
  - "Buổi trải nghiệm giúp đo trình độ & đề xuất mốc thời gian sát thực tế."
cta:
  - "Mình giữ 1 slot trải nghiệm miễn phí để đo trình độ và lên plan chi tiết nhé?"

---

## after_booking | xác nhận sau khi đặt lịch
intent: confirm_booking
tags: [confirmation, checklist]
content:
  - "Xác nhận: **{{slot1}}** (online). **Mã đặt: {{booking_id}}**. Link lớp: **{{join_link}}**."
  - "Checklist: micro/loa ổn; mạng ổn định; không gian yên tĩnh; đến trước 3–5'."
cta:
  - "Có gì thay đổi bạn nhắn mình để dời lịch linh hoạt nhé."
tool_hint:
  call: crm_manager.update_lead
  note: "Cập nhật stage: BOOKED sau khi đặt lịch thành công."

---
