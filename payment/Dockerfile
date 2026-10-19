FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY payment_service.py .

ENV PAYMENT_HOST=0.0.0.0
ENV PAYMENT_PORT=8082
ENV PRODUCT_CATALOG_URL=http://localhost:3000

EXPOSE 8082

CMD ["python", "payment_service.py"]
