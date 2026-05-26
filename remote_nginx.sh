#!/bin/bash
set -e

cat << 'NGINXEOF' > /etc/nginx/sites-available/omniworker
server {
    listen 80;
    server_name flux.simplex.lat;

    location /downloads/ {
        alias /opt/omniworker/downloads/;
        autoindex on;
        try_files $uri =404;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/omniworker /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx

# Run certbot to get SSL certificates
certbot --nginx -d flux.simplex.lat --non-interactive --agree-tos -m admin@simplex.lat || echo "Certbot failed. You may need to disable Cloudflare proxy during cert issuance."
