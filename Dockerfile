# Use an official Node.js runtime
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY src/ ./src/

# Expose port 3000 (so you can access it from Windows)
EXPOSE 3000

# Start the server
CMD ["npm", "start"]