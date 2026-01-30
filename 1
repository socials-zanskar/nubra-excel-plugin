# Stage 1: Build the Vite project
FROM node:22 as builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install && npm install -g vite &&  apt update && apt install -y mkdocs mkdocs-material mkdocs-material-extensions
# RUN pip install mkdocs

# Copy the rest of the project files
COPY . .

# Build the project
RUN vite build && npm run build:docs

# Stage 2: Serve the built files using NGINX
FROM nginx:alpine

RUN mkdir -p /usr/share/nginx/html/products/api
# Copy the built files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html/products/api

# Copy custom NGINX configuration file
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]

