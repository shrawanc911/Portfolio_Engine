# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN npm prune --production


# Stage 2: Create the production image
FROM node:20-alpine

# Install curl for health checks + AWS CLI
RUN apk add --no-cache \
    curl \
    python3 \
    py3-pip \
    aws-cli \
    && rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

# Add startup script
COPY startup.sh ./startup.sh
RUN chmod +x startup.sh

# Create shared directory for token
RUN mkdir -p /var/shared
RUN chmod -R 777 /var/shared

EXPOSE 5005

CMD ["npm", "run", "start:prod"]
