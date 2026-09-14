FROM node:20-alpine

WORKDIR /app

# Install system compatibility libraries
RUN apk add --no-cache libc6-compat

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application source
COPY . .

# Create volume mount directories
RUN mkdir -p /app/auth_info /app/temp_uploads

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production
ENV SESSION_DATA_PATH=/app/auth_info

CMD ["node", "index.js"]
