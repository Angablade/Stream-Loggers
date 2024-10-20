# Use the Node.js image
FROM node:18-slim

# Set working directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy app source code
COPY . .

# Command to run the app
CMD ["node", "index.js"]
