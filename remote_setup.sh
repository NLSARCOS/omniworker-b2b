#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "Updating system..."
apt-get update && apt-get upgrade -y

echo "Installing Docker..."
if ! command -v docker > /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
fi

echo "Installing Nginx, Certbot & UFW..."
apt-get install -y nginx certbot python3-certbot-nginx ufw

echo "Configuring Firewall..."
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'

echo "Setting up SaaS..."
cd /opt/omniworker/omniworker-saas
cat << 'ENVEOF' > .env
DATABASE_URL="postgresql://postgres:password123@db:5432/omniworker?schema=public"
JWT_SECRET="super-secret-jwt-key-2026-thelab"
JWT_REFRESH_SECRET="super-secret-refresh-jwt-key-2026"
ENVEOF

echo "Modifying schema.prisma for PostgreSQL..."
sed -i 's/provider = "sqlite"/provider = "postgresql"/g' prisma/schema.prisma

echo "Starting Docker Compose..."
docker compose up -d --build

echo "Waiting for DB to start..."
sleep 15
docker compose exec -T omniworker-saas npx prisma@5.22.0 db push || true

echo "Configuring Nginx..."
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

# Restart Nginx
systemctl restart nginx

# Run certbot (this will only succeed if Cloudflare proxy allows it)
certbot --nginx -d flux.simplex.lat --non-interactive --agree-tos -m admin@simplex.lat || echo "Certbot failed, probably due to DNS propagation or Cloudflare settings. Using HTTP for now."

echo "Setup complete."

