FROM nginx:alpine

COPY src/index.html src/style.css src/app.js /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
