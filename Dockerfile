FROM mcr.microsoft.com/playwright:v1.51.0-noble

WORKDIR /app

# Instalar dependencias de Node.js
COPY package*.json ./
RUN npm ci

# Copiar el código fuente y compilar TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Crear directorios de datos persistentes
RUN mkdir -p auth_whatsapp data downloads scratch

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true

# Ejecutar el bot de facturación
CMD ["npm", "start"]
