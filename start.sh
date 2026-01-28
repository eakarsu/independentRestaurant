#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${PORT:-3000}"
DB_NAME="restaurant_db"

echo "=========================================="
echo "  RestaurantAI - Startup Script"
echo "=========================================="
echo ""

# Set default DATABASE_URL if not provided
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "==> DATABASE_URL not set, using default..."
  # Use current system username for PostgreSQL connection (common on macOS)
  DB_USER="${USER:-$(whoami)}"
  export DATABASE_URL="postgresql://${DB_USER}@localhost:5432/${DB_NAME}?schema=public"
fi
echo "DATABASE_URL: ${DATABASE_URL}"

# Set other required environment variables with defaults
export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:${APP_PORT}}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-restaurant-ai-dev-secret-change-in-production}"

echo "NEXTAUTH_URL: ${NEXTAUTH_URL}"
echo ""

# Check if PostgreSQL is running
echo "==> Checking PostgreSQL status..."
if ! command -v psql &> /dev/null; then
  echo "WARNING: psql command not found. Assuming PostgreSQL is configured correctly."
else
  # Try to connect to PostgreSQL server (not specific database)
  if ! psql -h localhost -c "SELECT 1;" postgres >/dev/null 2>&1 && \
     ! psql -c "SELECT 1;" postgres >/dev/null 2>&1; then
    echo ""
    echo "ERROR: Cannot connect to PostgreSQL server."
    echo ""
    echo "Please start PostgreSQL:"
    echo "  macOS:  brew services start postgresql"
    echo "  Linux:  sudo systemctl start postgresql"
    echo ""
    exit 1
  fi
  echo "PostgreSQL server is running."

  # Create database if it doesn't exist
  echo ""
  echo "==> Ensuring database '${DB_NAME}' exists..."
  if ! psql -h localhost -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}" && \
     ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "Creating database '${DB_NAME}'..."
    createdb "${DB_NAME}" 2>/dev/null || createdb -h localhost "${DB_NAME}" 2>/dev/null || {
      echo "Could not create database automatically."
      echo "Please create it manually: createdb ${DB_NAME}"
      exit 1
    }
    echo "Database created successfully!"
  else
    echo "Database '${DB_NAME}' already exists."
  fi
fi

# Clean up processes on the app port
echo ""
echo "==> Cleaning up processes on port ${APP_PORT}..."
if lsof -ti tcp:"${APP_PORT}" >/dev/null 2>&1; then
  echo "Found processes on port ${APP_PORT}, killing them..."
  lsof -ti tcp:"${APP_PORT}" | xargs kill -9 || true
  sleep 1
  echo "Processes on port ${APP_PORT} have been terminated."
else
  echo "No processes found on port ${APP_PORT}."
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo ""
  echo "==> Installing dependencies..."
  npm install
fi

# Generate Prisma client
echo ""
echo "==> Generating Prisma client..."
npx prisma generate

# Run database migrations
echo ""
echo "==> Running Prisma migrations..."
npx prisma db push || {
  echo "Migration failed. Trying to create initial schema..."
  npx prisma db push --force-reset
}

# Update .env file with current DATABASE_URL
echo ""
echo "==> Updating .env file..."
if [ -f ".env" ]; then
  # Update DATABASE_URL in .env if it exists, otherwise append
  if grep -q "^DATABASE_URL=" .env; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env 2>/dev/null || \
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
  else
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
  fi
else
  echo "DATABASE_URL=\"${DATABASE_URL}\"" > .env
  echo "NEXTAUTH_URL=\"${NEXTAUTH_URL}\"" >> .env
  echo "NEXTAUTH_SECRET=\"${NEXTAUTH_SECRET}\"" >> .env
fi
echo ".env file updated."

# Check if database has been seeded
echo ""
echo "==> Checking if database needs seeding..."
# Remove Prisma-specific query parameters for psql
PSQL_URL=$(echo "${DATABASE_URL}" | sed 's/?schema=.*//')
TABLE_COUNT=$(psql "${PSQL_URL}" -t -c "SELECT COUNT(*) FROM \"Table\";" 2>/dev/null | xargs || echo "0")
if [ "${TABLE_COUNT}" = "0" ] || [ -z "${TABLE_COUNT}" ]; then
  echo "Database appears empty. Running seed..."
  DATABASE_URL="${DATABASE_URL}" npm run db:seed
else
  echo "Database already contains data (${TABLE_COUNT} tables). Skipping seed."
fi

# Start the application
echo ""
echo "=========================================="
echo "  Starting RestaurantAI on port ${APP_PORT}"
echo "=========================================="
echo ""
echo "Access the application at: http://localhost:${APP_PORT}"
echo ""
echo "Test credentials:"
echo "  Admin: admin@restaurant.com / admin123"
echo "  Manager: john@restaurant.com / admin123"
echo "  Chef: mike@restaurant.com / admin123"
echo ""

# For development
if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "Running in PRODUCTION mode..."
  npm run build
  npm run start
else
  echo "Running in DEVELOPMENT mode..."
  npm run dev
fi
