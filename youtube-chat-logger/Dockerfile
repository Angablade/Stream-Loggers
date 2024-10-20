# Use a smaller Node.js base image
FROM node:18-slim

# Install necessary dependencies for Puppeteer and Chromium
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  libnss3 \
  libgdk-pixbuf2.0-0 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libx11-xcb1 \
  libgbm1 \
  libasound2 \
  libnss3 \
  libnspr4 \
  libxss1 \
  libxtst6 \
  libappindicator3-1 \
  libxrandr2 \
  libvulkan1 \
  libgbm-dev \
  libnss3-dev \
  libgtk-3-0 \
  dbus-x11 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install the latest version of Puppeteer
RUN npm install puppeteer@latest

# Install the rest of the dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Set the default command to run your script
CMD ["node", "index.js"]
