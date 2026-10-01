#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 Configurando Bot Autónomo de Facturación CFDI en AWS"
echo "=========================================================="

# 1. Actualizar sistema e instalar Docker
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git

if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# 2. Configurar memoria Swap de 2GB (Vital para que Playwright y Chromium vuelen con 1GB RAM)
if [ ! -f /swapfile ]; then
    echo "🧠 Configurando memoria Swap de 2GB..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 3. Clonar repositorio oficial
cd ~
if [ -d "whatsapp-facturador-cfdi" ]; then
    cd whatsapp-facturador-cfdi
    git pull origin main
else
    git clone https://github.com/mochoadelrio/whatsapp-facturador-cfdi.git
    cd whatsapp-facturador-cfdi
fi

# 4. Crear archivo .env si no existe
if [ ! -f .env ]; then
    cat << 'EOF' > .env
GEMINI_API_KEY=AQ.Ab8RN6I3cDkqO1pi4-ByiHWR8yvWowyaJzCGKqaDts9Awg7jMQ
MODO_FACTURACION=real
PLAYWRIGHT_HEADLESS=true
AUTH_FOLDER=data/auth_whatsapp
EOF
fi

# 5. Iniciar con Docker Compose
echo "🐳 Levantando contenedor 24/7 con Docker..."
sudo docker compose up -d --build

echo ""
echo "=========================================================="
echo "✅ ¡BOT DESPLEGADO Y ACTIVO 24/7 EN AWS LIGHTSAIL!"
echo "=========================================================="
echo "Para ver los logs o el código QR de WhatsApp, escribe:"
echo "sudo docker logs -f facturador-cfdi-bot"
echo "=========================================================="
