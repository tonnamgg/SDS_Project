# ==========================================
# Stage 1: Build (ใช้ Image Go ตัวเต็มเพื่อคอมไพล์โค้ด)
# ==========================================
FROM golang:1.26-alpine AS builder

# ตั้งค่าโฟลเดอร์ทำงานภายใน Container
WORKDIR /app

# คัดลอก go.mod และ go.sum เข้ามาก่อนเพื่อโหลด Dependencies
# (ช่วยให้ Docker นำ Cache มาใช้ได้ หากไม่มีการแก้แพ็กเกจ)
COPY go.mod go.sum ./
RUN go mod download

# คัดลอก Source Code ทั้งหมด
COPY . .

# Build โค้ด Go ให้เป็นไฟล์ Executable ชื่อ "api-server"
RUN go build -o api-server .

# ==========================================
# Stage 2: Run (ใช้ Image Alpine เปล่าๆ ขนาดเล็กมาก เพื่อนำมารัน)
# ==========================================
FROM alpine:latest

WORKDIR /app

# คัดลอกไฟล์ที่ Build เสร็จแล้วจาก Stage 1 มาใช้งาน
COPY --from=builder /app/api-server .

# ไม่ใส่ credentials.json ไว้ใน image (กัน key หลุดตอน push)
# ให้ mount เข้ามาตอนรันแทน เช่น docker compose / K8s Secret


# เปิดพอร์ต 8081 ให้ภายนอกสามารถเชื่อมต่อเข้ามาได้
EXPOSE 8081

# คำสั่งที่จะถูกรันเมื่อ Docker Container เริ่มทำงาน
CMD ["./api-server"]