#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 Despliegue Automático de KlientIA Facturación en AWS"
echo "=========================================================="

# 1. Actualizar paquetes e instalar dependencias básicas
sudo apt-get update -y
sudo apt-get install -y git curl ufw

# 2. Instalar Docker si no está presente
if ! command -v docker &> /dev/null; then
  echo "📦 Instalando Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  rm get-docker.sh
fi

# 3. Configurar Firewall UFW (puertos 22, 80, 443, 3008)
echo "🛡️ Configurando Firewall..."
sudo ufw allow 22/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw allow 3008/tcp || true
sudo ufw --force enable || true

# 4. Clonar o actualizar el repositorio
APP_DIR="$HOME/whatsapp-facturador-cfdi"
if [ ! -d "$APP_DIR" ]; then
  echo "📥 Clonando repositorio..."
  git clone https://github.com/mochoadelrio/whatsapp-facturador-cfdi.git "$APP_DIR"
else
  echo "🔄 Actualizando repositorio existente..."
  cd "$APP_DIR"
  git pull origin main
fi

cd "$APP_DIR"

# 5. Configurar archivo .env
if [ ! -f ".env" ]; then
  echo "⚙️ Creando archivo .env inicial..."
  cat << 'EOF' > .env
GEMINI_API_KEY=AQ.Ab8RN6I3cDkqO1pi4-ByiHWR8yvWowyaJzCGKqaDts9Awg7jMQ
ADMIN_PIN=klientia2026
PORT=3008
MODO_FACTURACION=hibrido
PLAYWRIGHT_HEADLESS=true
AUTH_FOLDER=data/auth_whatsapp
EOF
fi

# 6. Detener contenedor previo si existe
if sudo docker ps -a --format '{{.Names}}' | grep -q "^klientia-bot$"; then
  echo "🛑 Deteniendo contenedor anterior..."
  sudo docker stop klientia-bot || true
  sudo docker rm klientia-bot || true
fi

# 7. Compilar imagen Docker y levantar contenedor con reinicio automático
echo "🏗️ Compilando imagen Docker (esto puede tardar 2-3 minutos la primera vez)..."
sudo docker build -t klientia-facturacion:latest .

echo "🚀 Iniciando contenedor con persistencia y reinicio 24/7..."
mkdir -p data/auth_whatsapp downloads scratch
sudo docker run -d \
  --name klientia-bot \
  --restart always \
  -p 3008:3008 \
  -e PORT=3008 \
  -v "$APP_DIR/data:/app/data" \
  -v "$APP_DIR/downloads:/app/downloads" \
  -v "$APP_DIR/assets:/app/assets" \
  --env-file .env \
  klientia-facturacion:latest

echo ""
echo "=========================================================="
echo "🎉 ¡KLIENTIA FACTURACIÓN ESTÁ ACTIVO EN AWS 24/7!"
echo "=========================================================="
PUBLIC_IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || echo "TU_IP_DE_AWS")
echo "🌐 URL Panel de Control: http://$PUBLIC_IP:3008"
echo "🔑 PIN de Administrador: klientia2026"
echo "=========================================================="
