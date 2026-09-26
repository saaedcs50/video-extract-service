FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package definition files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm install --production

# Copy remaining application source code
COPY . .

# Expose default port (container platforms can inject PORT environment variable)
EXPOSE 3000

# Start the service (index.js reads PORT from process.env.PORT || 3000 at runtime)
CMD ["node", "index.js"]
