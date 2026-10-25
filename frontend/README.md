# Frontend (Customer & Admin UI)

Frontend เบื้องต้นสำหรับ SDS Shop ใช้ HTML, CSS และ JavaScript แบบไม่พึ่ง build tool

โค้ดหน้าเว็บอยู่ในโฟลเดอร์ `src/` ได้แก่ `index.html`, `app.js` และ `style.css`

## สิ่งที่ทำไว้แล้ว

- โหลดสินค้าโดยเรียก `GET http://localhost:8080/api/products`
- เปิดหน้าต่าง Checkout และส่ง `POST http://localhost:8080/api/checkout`
- ส่ง `product_id` โดยใช้ค่า SKU เป็น temporary product identifier
- มีหน้าสำหรับกรอก Tracking ID
- มีโครงหน้า Admin สำหรับเพิ่ม/ลดสินค้าและอัปเดตสถานะจัดส่ง
- ส่วนที่ยังไม่มี API contract จะแสดงเป็น TODO แทนการเดาพฤติกรรม

## Run แบบง่าย

เปิด `index.html` ผ่าน static server ที่ port 3000 เช่น:

```powershell
npx serve . -l 3000
```

หรือ build และรันด้วย Docker:

```powershell
docker build -t sds-frontend .
docker run --rm -p 3000:3000 sds-frontend
```

เปิด `http://localhost:3000`

ถ้า API Gateway ไม่ได้อยู่ที่ `http://localhost:8080` ให้แก้ค่า `API_BASE` ใน `app.js`

## TODO ที่รอข้อมูลจาก service อื่น

- รูปแบบ response ของ checkout และชื่อ field ของ Tracking ID
- Delivery tracking endpoint
- Admin authentication
- Admin product CRUD และ Delivery status update endpoint

