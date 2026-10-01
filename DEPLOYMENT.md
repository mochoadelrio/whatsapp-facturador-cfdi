# Guía de Despliegue en la Nube (24/7 sin Mac)

Esta guía explica cómo mantener el **Bot de Facturación CFDI** encendido las 24 horas del día, los 7 días de la semana en un servidor en la nube (VPS), para que responda y facture de inmediato aunque tu Mac esté apagada o cerrada.

---

## 1. Requisitos del Servidor en la Nube

El bot ejecuta **Playwright (navegador Chromium sin cabeza)** para interactuar con los portales de autofacturación y procesar tickets.

* **Servidor recomendado:**
  * **DigitalOcean:** Droplet Basic (\$6 a \$12 USD/mes) — *Recomendado: 2 GB RAM / 1 vCPU con Ubuntu 24.04 LTS*.
  * **Hetzner Cloud:** CPX11 (~€4 EUR/mes) — *Excelente relación calidad/precio*.
  * **AWS Lightsail:** Instancia de 2 GB RAM (\$10 USD/mes).
* **Sistema Operativo:** Ubuntu 22.04 / 24.04 LTS o Debian 12.

---

## 2. Opción A: Despliegue Rápido con Docker (Recomendada)

Ya dejamos preparado el [`Dockerfile`](file:///Users/manuel8a/.gemini/antigravity/scratch/whatsapp-facturacion-bot/Dockerfile) y [`docker-compose.yml`](file:///Users/manuel8a/.gemini/antigravity/scratch/whatsapp-facturacion-bot/docker-compose.yml) oficiales con todos los paquetes de Chromium preinstalados.

### Paso 1: Instalar Docker en el servidor
En tu servidor Linux ejecuta:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
```

### Paso 2: Subir o clonar este proyecto en tu servidor
Copia la carpeta del proyecto a tu servidor o clónala:
```bash
git clone <tu-repositorio>
cd whatsapp-facturacion-bot
```

### Paso 3: Conservar tu sesión de WhatsApp ya vinculada
Para **no tener que volver a escanear el código QR**, simplemente copia la carpeta `auth_whatsapp` desde tu Mac al servidor:
```bash
# Ejecutar desde tu Mac:
scp -r auth_whatsapp usuario@ip-de-tu-servidor:/ruta/a/whatsapp-facturacion-bot/
```

### Paso 4: Configurar variables de entorno
Crea tu archivo `.env`:
```bash
cp .env.example .env
nano .env
```
Asegúrate de colocar tu `GEMINI_API_KEY` y tus credenciales de correo SMTP si deseas envío de correos directos.

### Paso 5: Iniciar en segundo plano
```bash
docker compose up -d --build
```
¡Listo! El bot estará corriendo permanentemente. Si el servidor se reinicia, Docker volverá a levantar el bot de forma automática (`restart: always`).

---

## 3. Opción B: Despliegue Directo con Node.js + PM2

Si prefieres correrlo sin Docker:

### Paso 1: Instalar Node.js 20 LTS y dependencias de Playwright
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2 tsx
```

### Paso 2: Instalar librerías del sistema para Chromium
```bash
cd whatsapp-facturacion-bot
npm install
npx playwright install --with-deps chromium
npm run build
```

### Paso 3: Arrancar con PM2 (Monitor 24/7)
```bash
pm2 start "npm start" --name facturador-bot
pm2 save
pm2 startup
```

---

## 4. Configuración del Correo para Comercios Directos (Pizza Hut, Ciosa, etc.)

En tu Mac el bot usa **Apple Mail** nativo. En un servidor Linux en la nube, el bot usa **SMTP estándar**.
Solo agrega en tu `.env` del servidor:

```env
# Ejemplo con cuenta de iCloud:
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_correo@icloud.com
SMTP_PASS=tu_contraseña_de_aplicacion_generada_en_appleid.apple.com

# O con Gmail:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=tu_contraseña_de_16_letras_de_aplicacion
```

---

## 5. Resumen de Ventajas al Migrar a la Nube

1. **Autonomía 24/7:** No requieres tener tu laptop abierta, cargando o encendida.
2. **IP y Conexión Estable:** El WebSocket de WhatsApp no sufre desconexiones por cambios de Wi-Fi.
3. **Escalabilidad:** Puede recibir tickets a cualquier hora del día y responder en segundos.
