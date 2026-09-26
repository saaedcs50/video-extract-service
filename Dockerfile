FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy service dependencies and files
COPY video-extract-service/package.json ./
RUN npm install --production

# Copy service source code
COPY video-extract-service/ ./

# Expose default port (container platforms can inject PORT environment variable)
EXPOSE 3000

# Start the service
CMD ["node", "index.js"]
