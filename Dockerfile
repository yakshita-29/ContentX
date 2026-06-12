# Use lightweight Node.js base image
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Copy package config files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy source files
COPY . .

# Recreate uploads directory inside image
RUN mkdir -p uploads && chown -R node:node /usr/src/app

# Use non-root node user for security
USER node

# Expose production port
EXPOSE 3000

ENV NODE_ENV=production

# Start command
CMD [ "node", "server.js" ]
